import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import authPlugin from '../../plugins/auth';
import dokumentRoutes from '../../routes/dokument.routes';
import { bestimmeFehlerantwort } from '../../utils/fehlerantwort';
import { MAX_GROESSE_BYTES } from '../../utils/dokument';

export interface TestBenutzer {
  id: string;
  aktiv: boolean;
  rolle: string;
}

/** Die Benutzer, mit denen die Berechtigungstests arbeiten -- einer je Rolle. */
export const BENUTZER: Record<string, TestBenutzer> = {
  ADMIN:             { id: 'u-admin',   aktiv: true, rolle: 'ADMIN' },
  VOLLZUGRIFF:       { id: 'u-voll',    aktiv: true, rolle: 'VOLLZUGRIFF' },
  VERTRAGSVERWALTER: { id: 'u-vertrag', aktiv: true, rolle: 'VERTRAGSVERWALTER' },
  KOSTENBUCHER:      { id: 'u-kosten',  aktiv: true, rolle: 'KOSTENBUCHER' },
  GESPERRT:          { id: 'u-weg',     aktiv: false, rolle: 'ADMIN' },
};

export interface TestDokument {
  id: number;
  kategorie: string;
  dateiname: string;
  mimeTyp: string;
  speicherName: string;
}

export interface TestserverOptionen {
  dokumente?: TestDokument[];
  /** Ratenbegrenzung fuer die Tests herunterdrehen, damit sie schnell greift. */
  grenze?: { max: number; timeWindow: string };
  /** Adressen, deren X-Forwarded-For geglaubt wird. */
  trustProxy?: string | boolean;
}

// Eine Attrappe statt einer echten Datenbank: die Berechtigungstests pruefen,
// welche Zeilen die Anwendung ueberhaupt anfasst, nicht wie Postgres sie
// speichert. Die Rollenpruefung sitzt vollstaendig im Anwendungscode.
function prismaAttrappe(dokumente: TestDokument[]) {
  // Die Felder entsprechen DOKUMENT_SELECT aus dokument.service.ts. Fehlt eines,
  // scheitert toAnzeige mit einem 500er statt mit einer Aussage ueber Rechte --
  // die Tests wuerden dann Gruenes melden, wo nichts geprueft wurde.
  const alle = () => dokumente.map((d) => ({
    ...d,
    groesseBytes: 1024,
    sha256: 'a'.repeat(64),
    titel: `Titel ${d.id}`,
    beschreibung: null,
    schlagworte: [] as string[],
    hochgeladenAm: new Date('2026-08-01T10:00:00Z'),
    aktualisiertAm: new Date('2026-08-01T10:00:00Z'),
    textAktualisiertAm: null,
    hochgeladenVonID: 'u-admin',
    mietvertragID: null, mietobjektID: null, mieteinheitID: null,
    kontaktID: null, kostenID: null, abrechnungID: null,
    textStatus: 'FERTIG', textQuelle: 'PDF_TEXT', textHinweis: null, textVersuche: 0,
    hochgeladenVon: { name: 'Admin' },
    mietvertrag: null, mietobjekt: null, mieteinheit: null,
    kontakt: null, kosten: null, abrechnung: null,
  }));
  return {
    benutzer: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        Object.values(BENUTZER).find((b) => b.id === where.id) ?? null,
    },
    dokument: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        alle().find((d) => d.id === where.id) ?? null,
      findMany: async () => alle(),
      findFirst: async () => null,
      count: async () => dokumente.length,
      update: async ({ where }: { where: { id: number } }) => alle().find((d) => d.id === where.id),
      delete: async ({ where }: { where: { id: number } }) => alle().find((d) => d.id === where.id),
    },
    $queryRaw: async () => [],
  } as unknown as PrismaClient;
}

export async function baueTestserver(optionen: TestserverOptionen = {}): Promise<FastifyInstance> {
  const server = Fastify({ logger: false, trustProxy: optionen.trustProxy ?? false });
  server.decorate('prisma', prismaAttrappe(optionen.dokumente ?? []));
  await server.register(authPlugin);
  await server.register(multipart, { limits: { fileSize: MAX_GROESSE_BYTES, files: 1 } });
  await server.register(rateLimit, {
    global: true,
    max: optionen.grenze?.max ?? 1000,
    timeWindow: optionen.grenze?.timeWindow ?? '1 minute',
  });
  server.setErrorHandler((error: unknown, _request, reply) => {
    const antwort = bestimmeFehlerantwort(error);
    return reply.status(antwort.status).send({ error: antwort.nachricht });
  });
  await server.register(dokumentRoutes, { prefix: '/api/v1/dokumente' });
  await server.ready();
  return server;
}

export function tokenFuer(server: FastifyInstance, benutzer: TestBenutzer): string {
  return server.jwt.sign({ id: benutzer.id, rolle: benutzer.rolle });
}
