import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { baueTestserver, tokenFuer, BENUTZER, TestDokument } from './hilfen/testserver';

// Zwei Dokumente an benachbarten IDs: eines harmlos, eines sensibel. Genau das
// Muster, mit dem sich ein Rechteproblem durch Hochzaehlen der ID finden liesse.
const DOKUMENTE: TestDokument[] = [
  { id: 123, kategorie: 'MIETVERTRAG', dateiname: 'vertrag.pdf', mimeTyp: 'application/pdf', speicherName: '2026/08/berechtigungen-a.pdf' },
  { id: 124, kategorie: 'SCHUFA',      dateiname: 'schufa.pdf',  mimeTyp: 'application/pdf', speicherName: '2026/08/berechtigungen-b.pdf' },
];

let server: FastifyInstance;
beforeAll(async () => { server = await baueTestserver({ dokumente: DOKUMENTE }); });
afterAll(async () => { await server.close(); });

function hole(pfad: string, benutzer?: keyof typeof BENUTZER, methode: 'GET' | 'PUT' | 'DELETE' | 'POST' = 'GET') {
  const headers = benutzer ? { authorization: `Bearer ${tokenFuer(server, BENUTZER[benutzer])}` } : {};
  return server.inject({ method: methode, url: pfad, headers, payload: methode === 'PUT' ? { titel: 'neu' } : undefined });
}

describe('Zugang ohne Anmeldung', () => {
  const geschuetzt = [
    ['GET', '/api/v1/dokumente/'],
    ['GET', '/api/v1/dokumente/123'],
    ['GET', '/api/v1/dokumente/123/download'],
    ['GET', '/api/v1/dokumente/schlagworte'],
    ['PUT', '/api/v1/dokumente/123'],
    ['DELETE', '/api/v1/dokumente/123'],
    ['POST', '/api/v1/dokumente/123/text-neu'],
  ] as const;

  it.each(geschuetzt)('%s %s ist ohne Token gesperrt', async (methode, pfad) => {
    const antwort = await hole(pfad, undefined, methode);
    expect(antwort.statusCode).toBe(401);
  });

  it('lehnt einen erfundenen Bearer-Wert ab', async () => {
    const antwort = await server.inject({
      method: 'GET', url: '/api/v1/dokumente/123',
      headers: { authorization: 'Bearer nicht.wirklich.eintoken' },
    });
    expect(antwort.statusCode).toBe(401);
  });

  it('lehnt einen deaktivierten Benutzer trotz gueltigem Token ab', async () => {
    const antwort = await hole('/api/v1/dokumente/123', 'GESPERRT');
    expect(antwort.statusCode).toBe(401);
  });
});

describe('Rollen bei schreibenden und loeschenden Aktionen', () => {
  it('laesst den Kostenbuchhalter nicht aendern', async () => {
    expect((await hole('/api/v1/dokumente/123', 'KOSTENBUCHER', 'PUT')).statusCode).toBe(403);
  });

  it('laesst den Vertragsverwalter aendern, aber nicht loeschen', async () => {
    expect((await hole('/api/v1/dokumente/123', 'VERTRAGSVERWALTER', 'PUT')).statusCode).toBe(200);
    expect((await hole('/api/v1/dokumente/123', 'VERTRAGSVERWALTER', 'DELETE')).statusCode).toBe(403);
  });

  it('laesst Vollzugriff loeschen', async () => {
    expect((await hole('/api/v1/dokumente/123', 'VOLLZUGRIFF', 'DELETE')).statusCode).toBe(200);
  });

  it('laesst die Texterkennung nur mit Vollzugriff neu anstossen', async () => {
    expect((await hole('/api/v1/dokumente/123/text-neu', 'VERTRAGSVERWALTER', 'POST')).statusCode).toBe(403);
    expect((await hole('/api/v1/dokumente/123/text-neu', 'KOSTENBUCHER', 'POST')).statusCode).toBe(403);
  });
});

describe('Fremde Daten durch Aendern der ID (IDOR)', () => {
  it('gibt dem Kostenbuchhalter das unbedenkliche Dokument', async () => {
    expect((await hole('/api/v1/dokumente/123', 'KOSTENBUCHER')).statusCode).toBe(200);
  });

  it('verweigert ihm das sensible Dokument an der Nachbar-ID', async () => {
    expect((await hole('/api/v1/dokumente/124', 'KOSTENBUCHER')).statusCode).toBe(404);
  });

  it('antwortet dabei 404 und nicht 403 -- sonst verriete der Code die Existenz', async () => {
    const verboten = await hole('/api/v1/dokumente/124', 'KOSTENBUCHER');
    const garnichtda = await hole('/api/v1/dokumente/999', 'KOSTENBUCHER');
    expect(verboten.statusCode).toBe(garnichtda.statusCode);
    expect(verboten.json()).toEqual(garnichtda.json());
  });

  it('verweigert auch den Download des sensiblen Dokuments', async () => {
    expect((await hole('/api/v1/dokumente/124/download', 'KOSTENBUCHER')).statusCode).toBe(404);
  });

  it('laesst den Vertragsverwalter an das sensible Dokument -- er fordert es beim Mieter an', async () => {
    expect((await hole('/api/v1/dokumente/124', 'VERTRAGSVERWALTER')).statusCode).toBe(200);
  });

  it('weist krumme IDs ab, statt sie zurechtzubiegen', async () => {
    for (const id of ['12xyz', '-1', '0', '1e3', '../123', '123%00', 'null']) {
      const antwort = await hole(`/api/v1/dokumente/${encodeURIComponent(id)}`, 'ADMIN');
      expect([400, 404], `ID "${id}" ergab ${antwort.statusCode}`).toContain(antwort.statusCode);
    }
  });
});
