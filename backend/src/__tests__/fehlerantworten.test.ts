import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { bestimmeFehlerantwort } from '../utils/fehlerantwort';
import { AppError } from '../utils/errors';

const INTERNE_MELDUNG =
  "ENOENT: no such file or directory, open '/app/storage/dokumente/2026/08/ausweis.pdf'";

describe('bestimmeFehlerantwort', () => {
  it('reicht die Meldung eines AppError durch -- sie ist fuer den Aufrufer gedacht', () => {
    expect(bestimmeFehlerantwort(new AppError(404, 'Dokument nicht gefunden')))
      .toEqual({ status: 404, nachricht: 'Dokument nicht gefunden', protokollieren: false });
  });

  it('verschweigt alles an einem Serverfehler und protokolliert ihn stattdessen', () => {
    const antwort = bestimmeFehlerantwort(new Error(INTERNE_MELDUNG));
    expect(antwort).toEqual({ status: 500, nachricht: 'Interner Serverfehler', protokollieren: true });
    expect(JSON.stringify(antwort)).not.toContain('/app/storage');
  });

  it('behandelt auch, was gar kein Error ist', () => {
    for (const wurf of [undefined, null, 'kaputt', 42, { irgendwas: true }]) {
      expect(bestimmeFehlerantwort(wurf).status).toBe(500);
    }
  });

  it('laesst die Meldung der Ratenbegrenzung stehen -- sie nennt die Wartezeit', () => {
    const fehler = Object.assign(new Error('Zu viele Anfragen. Bitte in 42 Sekunden erneut versuchen.'), { statusCode: 429 });
    expect(bestimmeFehlerantwort(fehler)).toEqual({
      status: 429, nachricht: 'Zu viele Anfragen. Bitte in 42 Sekunden erneut versuchen.', protokollieren: false,
    });
  });
});

describe('Reihenfolge der Registrierung', () => {
  // Fastify bindet den Fehlerbehandler an den Kontext, der beim Registrieren
  // einer Route gilt. Wird er erst danach gesetzt, antwortet fuer diese Routen
  // weiterhin Fastifys Standardbehandlung -- und die gibt bei einem 500er die
  // Fehlermeldung mit heraus, samt Dateipfad. Genau das war hier einmal der
  // Fall; dieser Test haelt die richtige Reihenfolge fest.
  async function baue(behandlerZuerst: boolean) {
    const server = Fastify({ logger: false });
    const setzen = () => server.setErrorHandler((fehler: unknown, _req, reply) => {
      const antwort = bestimmeFehlerantwort(fehler);
      return reply.status(antwort.status).send({ error: antwort.nachricht });
    });
    const routen = () => server.register(async (i) => {
      i.get('/platzt', async () => { throw new Error(INTERNE_MELDUNG); });
    }, { prefix: '/api' });
    if (behandlerZuerst) { setzen(); await routen(); } else { await routen(); setzen(); }
    await server.ready();
    return server;
  }

  it('gibt keinen Ablagepfad heraus, wenn der Behandler vor den Routen steht', async () => {
    const server = await baue(true);
    const antwort = await server.inject({ method: 'GET', url: '/api/platzt' });
    expect(antwort.statusCode).toBe(500);
    expect(antwort.body).not.toContain('/app/storage');
    expect(antwort.json()).toEqual({ error: 'Interner Serverfehler' });
    await server.close();
  });

  it('belegt den Unterschied: hinter den Routen gesetzt, dringt der Pfad nach aussen', async () => {
    const server = await baue(false);
    const antwort = await server.inject({ method: 'GET', url: '/api/platzt' });
    expect(antwort.body).toContain('/app/storage');
    await server.close();
  });
});
