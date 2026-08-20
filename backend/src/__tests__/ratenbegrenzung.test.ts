import { describe, it, expect } from 'vitest';
import { baueTestserver, tokenFuer, BENUTZER, TestDokument } from './hilfen/testserver';

const DOKUMENTE: TestDokument[] = [
  { id: 1, kategorie: 'MIETVERTRAG', dateiname: 'v.pdf', mimeTyp: 'application/pdf', speicherName: '2026/08/aaa.pdf' },
];

// Genau die Liste, die docker-compose.yml als Vorgabe setzt: localhost und das
// interne Docker-Netz. Alles andere gilt als vom Client behauptet.
const VERTRAUTE_PROXYS = '127.0.0.1, ::1, 172.28.0.0/16';

async function serverMitGrenze(max: number, trustProxy: string | boolean = false) {
  return baueTestserver({ dokumente: DOKUMENTE, grenze: { max, timeWindow: '1 minute' }, trustProxy });
}

describe('Ratenbegrenzung', () => {
  it('greift nach der eingestellten Zahl von Anfragen', async () => {
    const server = await serverMitGrenze(3);
    const token = tokenFuer(server, BENUTZER.ADMIN);
    const stati: number[] = [];
    for (let i = 0; i < 5; i++) {
      const antwort = await server.inject({
        method: 'GET', url: '/api/v1/dokumente/1', headers: { authorization: `Bearer ${token}` },
      });
      stati.push(antwort.statusCode);
    }
    expect(stati.slice(0, 3)).toEqual([200, 200, 200]);
    expect(stati.slice(3)).toEqual([429, 429]);
    await server.close();
  });

  it('haelt stand, solange kein Proxy als vertrauenswuerdig gilt', async () => {
    // Ohne trustProxy wird X-Forwarded-For gar nicht erst angesehen. Der
    // Angreifer erfindet bei jedem Versuch eine neue Adresse -- ohne Wirkung.
    const server = await serverMitGrenze(3, false);
    const token = tokenFuer(server, BENUTZER.ADMIN);
    const stati: number[] = [];
    for (let i = 0; i < 6; i++) {
      const antwort = await server.inject({
        method: 'GET', url: '/api/v1/dokumente/1',
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `203.0.113.${i}` },
      });
      stati.push(antwort.statusCode);
    }
    expect(stati.filter((s) => s === 429).length, `Stati: ${stati.join(', ')}`).toBeGreaterThan(0);
    await server.close();
  });

  // Dieser Test haelt eine Grenze der Bauweise fest, keinen Wunsch. Sobald ein
  // Proxy als vertrauenswuerdig gilt, MUSS die Anwendung dessen
  // X-Forwarded-For glauben -- sonst saehe sie alle Nutzer als einen einzigen
  // Absender. Sie kann dabei aber nicht unterscheiden, ob der Header vom
  // Proxy stammt oder vom Client, der ihn mitgeschickt hat. Wer die
  // Adressbindung braucht, muss den aeussersten Proxy den Header ueberschreiben
  // lassen (siehe INSTALL.md, Schritt 5).
  //
  // Deshalb haengt die Bremse gegen Passwortraten NICHT an der Adresse,
  // sondern am Konto -- siehe anmeldesperre.test.ts.
  it('ist adressgebunden umgehbar, sobald einem Proxy geglaubt wird', async () => {
    const server = await serverMitGrenze(3, VERTRAUTE_PROXYS);
    const token = tokenFuer(server, BENUTZER.ADMIN);
    const stati: number[] = [];
    for (let i = 0; i < 6; i++) {
      const antwort = await server.inject({
        method: 'GET', url: '/api/v1/dokumente/1',
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `203.0.113.${i}` },
      });
      stati.push(antwort.statusCode);
    }
    expect(stati.every((s) => s === 200), `Stati: ${stati.join(', ')}`).toBe(true);
    await server.close();
  });

  it('vertraut dem Header nicht, wenn trustProxy gar nicht gesetzt ist', async () => {
    const server = await serverMitGrenze(2, false);
    const token = tokenFuer(server, BENUTZER.ADMIN);
    const stati: number[] = [];
    for (let i = 0; i < 4; i++) {
      const antwort = await server.inject({
        method: 'GET', url: '/api/v1/dokumente/1',
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `192.0.2.${i}` },
      });
      stati.push(antwort.statusCode);
    }
    expect(stati.filter((s) => s === 429).length).toBeGreaterThan(0);
    await server.close();
  });
});
