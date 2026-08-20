import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs';
import { config } from './config';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import corsPlugin from './plugins/cors';
import routes from './routes';
import { bestimmeFehlerantwort } from './utils/fehlerantwort';
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
  // MUSS vor server.register(routes) stehen. Fastify bindet den
  // Fehlerbehandler an den Kontext, der beim Registrieren einer Route gilt --
  // ein spaeter gesetzter Behandler greift fuer die bereits registrierten
  // Routen nicht mehr. Genau das war hier der Fall: der Behandler unten stand
  // hinter den Routen und lief nie, sodass Fastifys Standardbehandlung
  // antwortete. Die gibt bei einem 500er die Fehlermeldung mit heraus, also
  // etwa "ENOENT ... open '/app/storage/dokumente/2026/08/xxx.pdf'" -- der
  // vollstaendige Ablagepfad, an jeden Aufrufer.
  // Fastify 5 typt den Fehler hier als unknown. Das ist keine Schikane: der
  // Fehlerbehandler faengt auch, was Plugins und Fremdcode werfen, und das muss
  // kein Error sein. Die Eingrenzung steckt in bestimmeFehlerantwort.
  server.setErrorHandler((error: unknown, _request, reply) => {
    const antwort = bestimmeFehlerantwort(error);
    if (antwort.protokollieren) {
      server.log.error(error);
    }
    return reply.status(antwort.status).send({ error: antwort.nachricht });
  });

  await server.register(routes, { prefix: '/api/v1' });

  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));


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
