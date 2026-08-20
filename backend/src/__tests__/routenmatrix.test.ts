import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import authPlugin from '../plugins/auth';
import routes from '../routes';
import { bestimmeFehlerantwort } from '../utils/fehlerantwort';

/**
 * Prueft die Rechte fuer JEDE registrierte Route, nicht fuer eine ausgewaehlte.
 *
 * Die Rollenpruefung sitzt in makeAuth als preHandler. Sie laeuft also, bevor
 * ein Handler die Datenbank anfasst -- deshalb genuegt hier eine Attrappe, die
 * bei jedem Zugriff scheitert. Kommt eine Antwort mit 401 oder 403 zurueck, hat
 * der Waechter gegriffen; alles andere heisst, der Handler wurde erreicht.
 *
 * Der Sinn: eine neue Route, die den Waechter vergisst, faellt hier auf. Ein
 * Test, der nur die Dokumentroute prueft, haette das nicht bemerkt.
 */

const BENUTZER = {
  ADMIN:             { id: 1, aktiv: true, rolle: 'ADMIN' },
  VERTRAGSVERWALTER: { id: 2, aktiv: true, rolle: 'VERTRAGSVERWALTER' },
  KOSTENBUCHER:      { id: 3, aktiv: true, rolle: 'KOSTENBUCHER' },
};

interface Route { methode: string; pfad: string }

// Jeder Datenbankzugriff scheitert -- ausser der Abfrage, die die Anmeldung
// braucht. Ein erreichter Handler endet damit in einem 500er, und genau das
// unterscheidet ihn hier von einem 401 oder 403.
function prismaAttrappe(): PrismaClient {
  const benutzer = {
    findUnique: async ({ where }: { where: { id: number } }) =>
      Object.values(BENUTZER).find((b) => b.id === where.id) ?? null,
  };
  return new Proxy({} as Record<string, unknown>, {
    get(_ziel, name: string) {
      if (name === 'benutzer') return benutzer;
      if (name === 'then') return undefined;
      return new Proxy({}, {
        get: () => async () => { throw new Error('Attrappe ohne Datenbank'); },
      });
    },
  }) as unknown as PrismaClient;
}

let server: FastifyInstance;
const gefunden: Route[] = [];

beforeAll(async () => {
  server = Fastify({ logger: false });
  server.decorate('prisma', prismaAttrappe());
  server.addHook('onRoute', (opt) => {
    if (opt.method === 'HEAD') return;
    const methoden = Array.isArray(opt.method) ? opt.method : [opt.method];
    for (const m of methoden) gefunden.push({ methode: m, pfad: opt.url });
  });
  await server.register(authPlugin);
  await server.register(multipart, { limits: { fileSize: 1024, files: 1 } });
  await server.register(rateLimit, { global: true, max: 100000, timeWindow: '1 minute' });
  server.setErrorHandler((fehler: unknown, _req, reply) => {
    const a = bestimmeFehlerantwort(fehler);
    return reply.status(a.status).send({ error: a.nachricht });
  });
  await server.register(routes, { prefix: '/api/v1' });
  await server.ready();
});

afterAll(async () => { await server.close(); });

/** Setzt Beispielwerte fuer die Pfadparameter ein. */
function fuelle(pfad: string): string {
  return pfad.replace(/:vertragID/g, '1').replace(/:id/g, '1').replace(/:typ/g, 'ABRECHNUNG');
}

function ruf(r: Route, rolle?: keyof typeof BENUTZER, pfad?: string) {
  const mitRumpf = !['GET', 'DELETE', 'HEAD'].includes(r.methode);
  const kopf: Record<string, string> = {};
  // Nur setzen, wo auch ein Rumpf mitgeht: ein content-type ohne Inhalt laesst
  // Fastify schon beim Parsen mit 400 abbrechen -- vor jeder Rechtepruefung.
  if (mitRumpf) kopf['content-type'] = 'application/json';
  if (rolle) kopf.authorization = `Bearer ${server.jwt.sign({ id: BENUTZER[rolle].id, rolle })}`;
  return server.inject({
    method: r.methode as 'GET',
    url: pfad ?? fuelle(r.pfad),
    headers: kopf,
    payload: mitRumpf ? {} : undefined,
  });
}

// Die einzige Route, die ohne Anmeldung erreichbar sein darf.
const OFFEN = new Set(['POST /api/v1/auth/login']);

describe('Rechte ueber alle registrierten Routen', () => {
  it('findet ueberhaupt Routen -- sonst prueft der Rest nichts', () => {
    expect(gefunden.length).toBeGreaterThan(40);
  });

  it('sperrt jede Route ohne Anmeldung', async () => {
    const durchgelassen: string[] = [];
    for (const r of gefunden) {
      const name = `${r.methode} ${r.pfad}`;
      if (OFFEN.has(name)) continue;
      const antwort = await ruf(r);
      if (antwort.statusCode !== 401) durchgelassen.push(`${name} -> ${antwort.statusCode}`);
    }
    expect(durchgelassen, `ohne Token erreichbar:\n${durchgelassen.join('\n')}`).toEqual([]);
  });

  it('laesst die Anmeldung selbst offen', async () => {
    const antwort = await server.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: 'niemand@example.org', password: 'falsch' },
    });
    // Sie antwortet mit 401, aber wegen der falschen Zugangsdaten -- nicht,
    // weil ein Waechter davor sitzt. Der Unterschied steckt in der Meldung.
    expect(antwort.json().error).not.toBe('Nicht authentifiziert');
    expect(antwort.json().error).toMatch(/Anmeldedaten/);
  });

  // Wer loeschen darf, ist eine Entscheidung ueber die Arbeitsteilung im Haus.
  // Dieser Test schreibt sie fest, statt sie dem Zufall der naechsten Aenderung
  // zu ueberlassen: der Kostenbuchhalter darf seine Kosten loeschen -- dafuer
  // gibt es die Rolle --, sonst nichts.
  const KOSTENBUCHER_DARF_LOESCHEN = new Set(['DELETE /api/v1/kosten/:id']);

  it('laesst den Kostenbuchhalter nur loeschen, was ihm zusteht', async () => {
    const loeschrouten = gefunden.filter((r) => r.methode === 'DELETE');
    expect(loeschrouten.length).toBeGreaterThan(8);
    const unerwartet: string[] = [];
    for (const r of loeschrouten) {
      const name = `${r.methode} ${r.pfad}`;
      const antwort = await ruf(r, 'KOSTENBUCHER');
      const abgewiesen = antwort.statusCode === 403;
      const sollAbgewiesen = !KOSTENBUCHER_DARF_LOESCHEN.has(name);
      if (abgewiesen !== sollAbgewiesen) {
        unerwartet.push(`${name} -> ${antwort.statusCode} (erwartet: ${sollAbgewiesen ? '403' : 'kein 403'})`);
      }
    }
    expect(unerwartet, `Loeschrechte weichen ab:\n${unerwartet.join('\n')}`).toEqual([]);
  });

  it('weist krumme Kennungen im Pfad ab, auf jeder Route die eine hat', async () => {
    const mitKennung = gefunden.filter((r) => /:id|:vertragID/.test(r.pfad));
    expect(mitKennung.length).toBeGreaterThan(20);
    const durchgelassen: string[] = [];
    for (const r of mitKennung) {
      for (const krumm of ['12xyz', '0', '-1', 'abc', '1%201']) {
        const pfad = r.pfad.replace(/:vertragID/g, krumm).replace(/:id/g, krumm).replace(/:typ/g, 'ABRECHNUNG');
        const antwort = await ruf(r, 'ADMIN', pfad);
        // 400 = abgewiesen, 404 = Fastify hat den Pfad gar nicht erst zugeordnet
        if (![400, 404].includes(antwort.statusCode)) {
          durchgelassen.push(`${r.methode} ${pfad} -> ${antwort.statusCode}`);
        }
      }
    }
    expect(durchgelassen, `krumme Kennung angenommen:\n${durchgelassen.join('\n')}`).toEqual([]);
  });
});
