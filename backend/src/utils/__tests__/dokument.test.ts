import { describe, it, expect } from 'vitest';
import {
  DokumentKategorieTyp, ERLAUBTE_TYPEN, KATEGORIE_META, MAX_GROESSE_BYTES,
  darfKategorieSehen, dsgvoAktion, endungFuerMime, erzeugeSpeicherName,
  pruefeMagicBytes, sichtbareKategorien,
} from '../dokument';

const ALLE_KATEGORIEN: DokumentKategorieTyp[] = [
  'MIETVERTRAG', 'NACHTRAG', 'KUENDIGUNG', 'UEBERGABEPROTOKOLL', 'RECHNUNG',
  'ABRECHNUNG', 'GRUNDRISS', 'ENERGIEAUSWEIS', 'VERSICHERUNG', 'FOTO',
  'AUSWEIS', 'SCHUFA', 'SELBSTAUSKUNFT', 'SCHRIFTWECHSEL', 'SONSTIGES',
];

describe('KATEGORIE_META', () => {
  it('deckt alle Kategorien mit Label ab', () => {
    for (const k of ALLE_KATEGORIEN) {
      expect(KATEGORIE_META[k]).toBeDefined();
      expect(KATEGORIE_META[k].label.length).toBeGreaterThan(0);
    }
  });

  it('kennzeichnet genau die vier sensiblen Kategorien', () => {
    const sensibel = ALLE_KATEGORIEN.filter((k) => KATEGORIE_META[k].sensibel);
    expect(sensibel.sort()).toEqual(['AUSWEIS', 'SCHRIFTWECHSEL', 'SCHUFA', 'SELBSTAUSKUNFT']);
  });

  it('kennzeichnet die aufbewahrungspflichtigen Kategorien (§147 AO)', () => {
    const pflicht = ALLE_KATEGORIEN.filter((k) => KATEGORIE_META[k].aufbewahrungspflichtig);
    expect(pflicht.sort()).toEqual([
      'ABRECHNUNG', 'KUENDIGUNG', 'MIETVERTRAG', 'NACHTRAG', 'RECHNUNG', 'UEBERGABEPROTOKOLL',
    ]);
  });

  it('keine Kategorie ist gleichzeitig sensibel und aufbewahrungspflichtig', () => {
    const beides = ALLE_KATEGORIEN.filter(
      (k) => KATEGORIE_META[k].sensibel && KATEGORIE_META[k].aufbewahrungspflichtig,
    );
    expect(beides).toEqual([]);
  });
});

describe('Dateitypen', () => {
  it('liefert die Endung zum erlaubten MIME-Typ', () => {
    expect(endungFuerMime('application/pdf')).toBe('pdf');
    expect(endungFuerMime('image/jpeg')).toBe('jpg');
  });

  it('lehnt unbekannte Typen ab', () => {
    expect(endungFuerMime('application/x-msdownload')).toBeNull();
    expect(endungFuerMime('')).toBeNull();
  });

  it('das Limit betraegt 25 MB', () => {
    expect(MAX_GROESSE_BYTES).toBe(25 * 1024 * 1024);
    expect(Object.keys(ERLAUBTE_TYPEN)).toHaveLength(7);
  });
});

describe('pruefeMagicBytes', () => {
  it('erkennt echte PDF-, JPEG-, PNG- und WEBP-Koepfe', () => {
    expect(pruefeMagicBytes('application/pdf', Buffer.from('%PDF-1.7'))).toBe(true);
    expect(pruefeMagicBytes('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(pruefeMagicBytes('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
    expect(pruefeMagicBytes('image/webp', webp)).toBe(true);
  });

  it('entlarvt eine als PDF deklarierte EXE', () => {
    expect(pruefeMagicBytes('application/pdf', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBe(false);
  });

  it('erkennt zu kurze Koepfe als ungueltig', () => {
    expect(pruefeMagicBytes('image/png', Buffer.from([0x89]))).toBe(false);
  });

  it('prueft Typen ohne bekannte Signatur nicht (txt)', () => {
    expect(pruefeMagicBytes('text/plain', Buffer.from('Hallo'))).toBe(true);
  });

  it('erkennt einen echten ZIP-Kopf bei DOCX und XLSX (OOXML-Container)', () => {
    const zipKopf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(pruefeMagicBytes(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipKopf,
    )).toBe(true);
    expect(pruefeMagicBytes(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zipKopf,
    )).toBe(true);
  });

  it('entlarvt ein als DOCX deklariertes PDF', () => {
    expect(pruefeMagicBytes(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('%PDF-1.7'),
    )).toBe(false);
  });

  it('weist nicht erlaubte MIME-Typen ab, auch ohne Signatur', () => {
    expect(pruefeMagicBytes('application/x-msdownload', Buffer.from([0x4d, 0x5a]))).toBe(false);
    expect(pruefeMagicBytes('application/octet-stream', Buffer.from('irgendwas'))).toBe(false);
  });

  it('kommt mit einem leeren Kopf zurecht', () => {
    expect(pruefeMagicBytes('application/pdf', Buffer.alloc(0))).toBe(false);
  });
});

describe('erzeugeSpeicherName', () => {
  it('legt nach Jahr und Monat ab und nutzt die MIME-Endung', () => {
    const name = erzeugeSpeicherName('application/pdf', new Date(Date.UTC(2026, 7, 16)), 'abc-123');
    expect(name).toBe('2026/08/abc-123.pdf');
  });

  it('fuellt einstellige Monate auf', () => {
    const name = erzeugeSpeicherName('image/png', new Date(Date.UTC(2026, 0, 5)), 'x');
    expect(name).toBe('2026/01/x.png');
  });
});

describe('Sichtbarkeit sensibler Kategorien', () => {
  it('KOSTENBUCHER sieht sensible Kategorien nicht', () => {
    expect(darfKategorieSehen('AUSWEIS', 'KOSTENBUCHER')).toBe(false);
    expect(darfKategorieSehen('RECHNUNG', 'KOSTENBUCHER')).toBe(true);
  });

  it('alle Rollen ausser KOSTENBUCHER sehen alles', () => {
    for (const rolle of ['VERTRAGSVERWALTER', 'VOLLZUGRIFF', 'ADMIN', 'VERWALTER']) {
      expect(darfKategorieSehen('AUSWEIS', rolle)).toBe(true);
      expect(darfKategorieSehen('SCHUFA', rolle)).toBe(true);
    }
  });

  it('eine unbekannte Rolle sieht nichts Sensibles', () => {
    expect(darfKategorieSehen('AUSWEIS', 'GAST')).toBe(false);
    expect(darfKategorieSehen('RECHNUNG', 'GAST')).toBe(true);
  });

  it('sichtbareKategorien liefert fuer KOSTENBUCHER nur die unsensiblen', () => {
    expect(sichtbareKategorien('KOSTENBUCHER')).toHaveLength(11);
    expect(sichtbareKategorien('ADMIN')).toHaveLength(15);
    expect(sichtbareKategorien('VERWALTER')).toHaveLength(15);
  });
});

describe('dsgvoAktion', () => {
  it('aufbewahrungspflichtige Dokumente werden nur entkoppelt', () => {
    expect(dsgvoAktion('RECHNUNG')).toBe('ENTKOPPELN');
    expect(dsgvoAktion('MIETVERTRAG')).toBe('ENTKOPPELN');
  });

  it('alle uebrigen Dokumente werden geloescht', () => {
    expect(dsgvoAktion('AUSWEIS')).toBe('LOESCHEN');
    expect(dsgvoAktion('FOTO')).toBe('LOESCHEN');
    expect(dsgvoAktion('SONSTIGES')).toBe('LOESCHEN');
  });
});
