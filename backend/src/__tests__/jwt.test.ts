import { describe, it, expect } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { createSigner } from 'fast-jwt';
import type { PrismaClient } from '@prisma/client';
import authPlugin from '../plugins/auth';
import { configSchema } from '../config.schema';
import { erzeugeJwtOptionen, JWT_ALGORITHMUS } from '../utils/jwt';

const GEHEIMNIS = process.env.JWT_SECRET as string;

// Der Benutzer, den die Datenbank kennt. Seine Rolle ist die Wahrheit -- alles,
// was ein Token darueber behauptet, muss dagegen verlieren.
const BENUTZER_IN_DB = { id: 'nutzer-1', aktiv: true, rolle: 'KOSTENBUCHER' };

function prismaAttrappe(benutzer: typeof BENUTZER_IN_DB | null) {
  return {
    benutzer: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        benutzer && where.id === benutzer.id ? benutzer : null,
    },
  } as unknown as PrismaClient;
}

async function baueServer(benutzer = BENUTZER_IN_DB as typeof BENUTZER_IN_DB | null): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  server.decorate('prisma', prismaAttrappe(benutzer));
  await server.register(authPlugin);
  server.get('/geschuetzt', { preHandler: [server.authenticate] }, async (request) => ({
    id: request.user.id,
    rolle: request.user.rolle,
  }));
  await server.ready();
  return server;
}

function ruf(server: FastifyInstance, token: string) {
  return server.inject({ method: 'GET', url: '/geschuetzt', headers: { authorization: `Bearer ${token}` } });
}

function teil(inhalt: unknown): string {
  return Buffer.from(JSON.stringify(inhalt)).toString('base64url');
}

describe('JWT-Authentifizierung', () => {
  it('laesst ein gueltiges Token durch', async () => {
    const server = await baueServer();
    const token = server.jwt.sign({ id: BENUTZER_IN_DB.id, rolle: BENUTZER_IN_DB.rolle });
    const antwort = await ruf(server, token);
    expect(antwort.statusCode).toBe(200);
    expect(antwort.json().id).toBe(BENUTZER_IN_DB.id);
    await server.close();
  });

  it('lehnt ein abgelaufenes Token ab', async () => {
    const server = await baueServer();
    // Vor 10 Tagen ausgestellt, Laufzeit 7 Tage -- also seit 3 Tagen abgelaufen.
    const vor10Tagen = Math.floor(Date.now() / 1000) - 10 * 86400;
    const signieren = createSigner({ key: GEHEIMNIS, algorithm: JWT_ALGORITHMUS, clockTimestamp: vor10Tagen * 1000, expiresIn: '7d' });
    const antwort = await ruf(server, signieren({ id: BENUTZER_IN_DB.id }));
    expect(antwort.statusCode).toBe(401);
    await server.close();
  });

  it('lehnt ein Token mit falscher Signatur ab', async () => {
    const server = await baueServer();
    const fremd = createSigner({ key: 'Xq4vNz8LcRt2WmYbJ7hPdA5sGf3KuEiO9nTr', algorithm: JWT_ALGORITHMUS });
    const antwort = await ruf(server, fremd({ id: BENUTZER_IN_DB.id, rolle: 'ADMIN' }));
    expect(antwort.statusCode).toBe(401);
    await server.close();
  });

  it('weist ein leeres oder zu schwaches JWT_SECRET beim Start zurueck', () => {
    const grundlage = { DATABASE_URL: 'postgresql://x', JWT_EXPIRES_IN: '7d' };
    for (const geheimnis of ['', 'kurz', 'a'.repeat(64), 'CHANGEME-bitte-hier-etwas-Zufaelliges-einsetzen']) {
      const ergebnis = configSchema.safeParse({ ...grundlage, JWT_SECRET: geheimnis });
      expect(ergebnis.success, `haette "${geheimnis.slice(0, 12)}" ablehnen muessen`).toBe(false);
    }
    expect(configSchema.safeParse({ ...grundlage, JWT_SECRET: GEHEIMNIS }).success).toBe(true);
    expect(() => erzeugeJwtOptionen('', '7d')).toThrow(/mindestens/);
  });

  it('uebernimmt die Rolle aus der Datenbank, nicht aus dem Token', async () => {
    const server = await baueServer();
    // Korrekt signiert -- der Angreifer ist ein echter Benutzer, der sich in
    // seinem eigenen Token eine hoehere Rolle eintraegt.
    const token = server.jwt.sign({ id: BENUTZER_IN_DB.id, rolle: 'ADMIN' });
    const antwort = await ruf(server, token);
    expect(antwort.statusCode).toBe(200);
    expect(antwort.json().rolle).toBe('KOSTENBUCHER');
    await server.close();
  });

  it('lehnt ein Token mit nachtraeglich geaenderter Benutzer-ID ab', async () => {
    const server = await baueServer();
    const [kopf, , signatur] = server.jwt.sign({ id: BENUTZER_IN_DB.id }).split('.');
    const gefaelscht = `${kopf}.${teil({ id: 'nutzer-999' })}.${signatur}`;
    const antwort = await ruf(server, gefaelscht);
    expect(antwort.statusCode).toBe(401);
    await server.close();
  });

  it('lehnt ein Token mit anderem Algorithmus ab', async () => {
    const server = await baueServer();
    const hs512 = createSigner({ key: GEHEIMNIS, algorithm: 'HS512' });
    const antwort = await ruf(server, hs512({ id: BENUTZER_IN_DB.id, rolle: 'ADMIN' }));
    expect(antwort.statusCode).toBe(401);
    await server.close();
  });

  it('lehnt ein Token ohne Signatur ab (alg: none)', async () => {
    const server = await baueServer();
    const ohne = `${teil({ alg: 'none', typ: 'JWT' })}.${teil({ id: BENUTZER_IN_DB.id, rolle: 'ADMIN' })}.`;
    const antwort = await ruf(server, ohne);
    expect(antwort.statusCode).toBe(401);
    await server.close();
  });

  it('lehnt einen Benutzer ab, den es nicht mehr gibt', async () => {
    const server = await baueServer(null);
    const antwort = await ruf(server, server.jwt.sign({ id: BENUTZER_IN_DB.id }));
    expect(antwort.statusCode).toBe(401);
    await server.close();
  });
});
