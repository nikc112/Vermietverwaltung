import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { baueTestserver, tokenFuer, BENUTZER, TestDokument } from './hilfen/testserver';
import { config } from '../config';
import { erzeugeSpeicherName, pruefeMagicBytes, endungFuerMime, MAX_GROESSE_BYTES } from '../utils/dokument';
import { absoluterPfad } from '../services/dokument.service';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);

const DOKUMENTE: TestDokument[] = [
  { id: 1, kategorie: 'MIETVERTRAG', dateiname: 'Mietvertrag Mueller "2026".pdf', mimeTyp: 'application/pdf', speicherName: '2026/08/dateien-test.pdf' },
];

let server: FastifyInstance;

beforeAll(async () => {
  server = await baueTestserver({ dokumente: DOKUMENTE });
  const ziel = path.join(config.DOKUMENT_STORAGE_PATH, '2026/08/dateien-test.pdf');
  await fs.promises.mkdir(path.dirname(ziel), { recursive: true });
  await fs.promises.writeFile(ziel, PDF);
});
afterAll(async () => {
  await server.close();
  // Nur die eigene Datei: die Testdateien laufen parallel im selben Ablageort.
  await fs.promises.rm(path.join(config.DOKUMENT_STORAGE_PATH, '2026/08/dateien-test.pdf'), { force: true });
});

/** Baut einen Multipart-Koerper von Hand -- ohne zusaetzliche Abhaengigkeit. */
function multipart(dateiname: string, mime: string, inhalt: Buffer, felder: Record<string, string> = {}) {
  const grenze = '----pruefgrenze1234567890';
  const teile: Buffer[] = [];
  for (const [name, wert] of Object.entries(felder)) {
    teile.push(Buffer.from(`--${grenze}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${wert}\r\n`));
  }
  teile.push(Buffer.from(
    `--${grenze}\r\nContent-Disposition: form-data; name="datei"; filename="${dateiname}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`));
  teile.push(inhalt);
  teile.push(Buffer.from(`\r\n--${grenze}--\r\n`));
  return { payload: Buffer.concat(teile), headers: { 'content-type': `multipart/form-data; boundary=${grenze}` } };
}

function lade(dateiname: string, mime: string, inhalt: Buffer) {
  const { payload, headers } = multipart(dateiname, mime, inhalt, { kategorie: 'MIETVERTRAG', titel: 'Test' });
  return server.inject({
    method: 'POST', url: '/api/v1/dokumente/', payload,
    headers: { ...headers, authorization: `Bearer ${tokenFuer(server, BENUTZER.ADMIN)}` },
  });
}

describe('Upload: was abgelehnt werden muss', () => {
  it('weist nicht erlaubte Dateitypen ab', async () => {
    for (const [name, mime] of [
      ['test.html', 'text/html'],
      ['test.svg', 'image/svg+xml'],
      ['test.exe', 'application/x-msdownload'],
      ['test.php', 'application/x-httpd-php'],
    ] as const) {
      const antwort = await lade(name, mime, PDF);
      expect(antwort.statusCode, `${name} wurde nicht abgelehnt`).toBe(400);
    }
  });

  it('glaubt dem gemeldeten Typ nicht, sondern prueft die ersten Bytes', async () => {
    // Als PDF angemeldet, tatsaechlich HTML mit Skript -- genau der Versuch,
    // etwas Ausfuehrbares an der Typpruefung vorbeizuschmuggeln.
    const antwort = await lade('rechnung.pdf', 'application/pdf', Buffer.from('<script>alert(1)</script>'));
    expect(antwort.statusCode, antwort.body).toBe(400);
    expect(JSON.stringify(antwort.json()), antwort.body).toMatch(/passt nicht/i);
  });

  it('weist eine Datei ueber der Groessengrenze ab', async () => {
    const zuGross = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_GROESSE_BYTES + 1024, 0x20)]);
    const antwort = await lade('gross.pdf', 'application/pdf', zuGross);
    expect([400, 413]).toContain(antwort.statusCode);
  });

  it('laesst den Kostenbuchhalter gar nicht erst hochladen', async () => {
    const { payload, headers } = multipart('v.pdf', 'application/pdf', PDF, { kategorie: 'MIETVERTRAG' });
    const antwort = await server.inject({
      method: 'POST', url: '/api/v1/dokumente/', payload,
      headers: { ...headers, authorization: `Bearer ${tokenFuer(server, BENUTZER.KOSTENBUCHER)}` },
    });
    expect(antwort.statusCode).toBe(403);
  });
});

describe('Der hochgeladene Dateiname wird nie zum Speicherpfad', () => {
  const boesartig = [
    '../../etc/passwd',
    '..\..\windows\system.ini',
    '/etc/shadow',
    'rechnung.pdf.php',
    'test.html',
    'C:\Windows\system32\cmd.exe',
  ];

  it.each(boesartig)('"%s" taucht im erzeugten Speichernamen nicht auf', (name) => {
    const speicherName = erzeugeSpeicherName('application/pdf', new Date('2026-08-01'), 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(speicherName).toBe('2026/08/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf');
    expect(speicherName).not.toContain(name);
    expect(speicherName).not.toMatch(/\.\./);
  });

  it('vergibt die Endung nach dem geprueften Typ, nicht nach dem Dateinamen', () => {
    expect(endungFuerMime('application/pdf')).toBe('pdf');
    expect(endungFuerMime('text/html')).toBeNull();
    expect(endungFuerMime('image/svg+xml')).toBeNull();
    expect(endungFuerMime('application/x-httpd-php')).toBeNull();
  });

  it('sperrt einen Speichernamen, der aus dem Ablageverzeichnis herausfuehrt', () => {
    for (const name of ['../../etc/passwd', '../../../geheim', '/etc/shadow', '2026/../../../etc/passwd']) {
      expect(() => absoluterPfad(name), `"${name}" wurde durchgelassen`).toThrow();
    }
  });

  it('laesst einen regulaeren Speichernamen durch und bleibt im Ablageverzeichnis', () => {
    const pfad = absoluterPfad('2026/08/dateien-test.pdf');
    expect(pfad.startsWith(path.resolve(config.DOKUMENT_STORAGE_PATH))).toBe(true);
  });

  it('erkennt die Signatur der erlaubten Typen und faellt bei fremden nicht durch', () => {
    expect(pruefeMagicBytes('application/pdf', Buffer.from('%PDF'))).toBe(true);
    expect(pruefeMagicBytes('application/pdf', Buffer.from('<htm'))).toBe(false);
    expect(pruefeMagicBytes('text/html', Buffer.from('<htm'))).toBe(false);
    expect(pruefeMagicBytes('image/svg+xml', Buffer.from('<svg'))).toBe(false);
  });
});

describe('Download', () => {
  function laden(benutzer: keyof typeof BENUTZER = 'ADMIN') {
    return server.inject({
      method: 'GET', url: '/api/v1/dokumente/1/download',
      headers: { authorization: `Bearer ${tokenFuer(server, BENUTZER[benutzer])}` },
    });
  }

  it('liefert die Datei als Anhang und verbietet das Erraten des Typs', async () => {
    const antwort = await laden();
    expect(antwort.statusCode).toBe(200);
    expect(antwort.headers['content-disposition']).toMatch(/^attachment;/);
    expect(antwort.headers['x-content-type-options']).toBe('nosniff');
  });

  it('bricht die Header-Syntax nicht an Anfuehrungszeichen im Dateinamen', async () => {
    const kopf = String((await laden()).headers['content-disposition']);
    // Genau zwei Anfuehrungszeichen: die um den ASCII-Namen. Jedes weitere kaeme
    // aus dem Dateinamen und liesse sich zum Anhaengen eigener Header nutzen.
    expect((kopf.match(/"/g) ?? []).length).toBe(2);
    expect(kopf).not.toMatch(/[\r\n]/);
  });
});
