import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import { config } from './config';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import corsPlugin from './plugins/cors';
import routes from './routes';
import { AppError } from './utils/errors';
import { MAX_GROESSE_BYTES } from './utils/dokument';
import { raeumeReste, setzeHaengendeZurueck, starteWarteschlange } from './services/textextraktion.service';

if (!fs.existsSync(config.PDF_STORAGE_PATH)) {
  fs.mkdirSync(config.PDF_STORAGE_PATH, { recursive: true });
}

if (!fs.existsSync(config.DOKUMENT_STORAGE_PATH)) {
  fs.mkdirSync(config.DOKUMENT_STORAGE_PATH, { recursive: true });
}

// Wird beim Start gesetzt und beim Herunterfahren aufgerufen. Auf Modulebene,
// weil der Signalbehandler ausserhalb von main() steht.
let warteschlangeStoppen: (() => void) | null = null;

const server = Fastify({
  logger: config.NODE_ENV !== 'test',
  // Hinter nginx ist die Adresse des Proxys die Absenderadresse. Ohne trustProxy
  // saehe die Ratenbegrenzung alle Nutzer als einen einzigen Absender und wuerde
  // sie gemeinsam drosseln. Bewusst NICHT 'true': das wuerde jedem Eintrag in
  // X-Forwarded-For glauben, auch dem vom Client selbst gesetzten — damit liesse
  // sich die Anmeldesperre bei jedem Versuch zuruecksetzen. Vertraut wird nur den
  // Adressen aus TRUST_PROXY; alles links davon gilt als vom Client behauptet.
  trustProxy: config.TRUST_PROXY,
});

async function main() {
  await server.register(corsPlugin);
  await server.register(prismaPlugin);
  await server.register(authPlugin);
  await server.register(multipart, { limits: { fileSize: MAX_GROESSE_BYTES, files: 1 } });
  // Grosszuegige Grundgrenze: eine Seite loest rund zehn Anfragen aus, 300 pro
  // Minute stoeren normale Arbeit nicht. Einzelne Routen verschaerfen das ueber
  // ihre eigene rateLimit-Konfiguration. /health bleibt frei fuer Healthchecks.
  await server.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/health',
    errorResponseBuilder: (_request, context) => {
      const text = `Zu viele Anfragen. Bitte in ${Math.ceil(Number(context.ttl) / 1000)} Sekunden erneut versuchen.`;
      // 'message' wird mitgesetzt, weil der Fehler durch den globalen
      // Fehlerbehandler laeuft und dieser die Meldung von dort liest.
      return { statusCode: 429, error: text, message: text };
    },
  });
  await server.register(routes, { prefix: '/api/v1' });

  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    // Die Ratenbegrenzung wirft einen eigenen Fehler mit Status 429. Ohne diesen
    // Zweig faengt ihn der generische Fall unten ab und meldet 500 — der Nutzer
    // saehe einen Serverfehler statt des Hinweises, wie lange er warten muss.
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: error.message || 'Zu viele Anfragen. Bitte kurz warten.' });
    }
    server.log.error(error);
    return reply.status(500).send({ error: 'Interner Serverfehler' });
  });

  await server.listen({ port: 3000, host: '0.0.0.0' });
  server.log.info('Server läuft auf http://0.0.0.0:3000');

  // Texterkennung im Hintergrund: die Erkennungsprogramme laufen als eigene
  // Prozesse, blockieren die Ereignisschleife also nicht.
  const protokoll = {
    info: (nachricht: string) => server.log.info(nachricht),
    error: (nachricht: string) => server.log.error(nachricht),
  };
  const reste = await raeumeReste(protokoll);
  if (reste > 0) {
    server.log.info(`${reste} liegengebliebene Renderordner entfernt`);
  }
  const zurueckgesetzt = await setzeHaengendeZurueck(server.prisma);
  if (zurueckgesetzt > 0) {
    server.log.info(`${zurueckgesetzt} haengengebliebene Dokumente zur erneuten Verarbeitung vorgemerkt`);
  }
  warteschlangeStoppen = starteWarteschlange(server.prisma, protokoll);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const signals = ['SIGINT', 'SIGTERM'] as const;
for (const signal of signals) {
  process.once(signal, async () => {
    // Zuerst die Warteschlange anhalten: sonst uebernimmt sie waehrend des
    // Herunterfahrens womoeglich noch ein Dokument, das dann auf IN_ARBEIT
    // stehen bleibt, bis der naechste Start es zuruecksetzt.
    warteschlangeStoppen?.();
    await server.close();
    process.exit(0);
  });
}
