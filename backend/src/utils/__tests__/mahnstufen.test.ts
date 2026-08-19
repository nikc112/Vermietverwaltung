import { describe, it, expect } from 'vitest';
import {
  mietFaelligkeit, bewertePosten, erstelleMahnVorschlag,
  MahnEinstellungen, PostenInput, OffenerPosten,
} from '../mahnstufen';

const E: MahnEinstellungen = { gebuehr: 5, karenzTage: 5, wartefristTage: 14, zahlungsfristTage: 10 };
const HEUTE = new Date('2026-07-13T00:00:00Z');

const miete = (over: Partial<PostenInput> = {}): PostenInput => ({
  typ: 'MIETE', referenzID: 1, beschreibung: 'Miete 06/2026', offenerBetrag: 500,
  faelligAm: new Date('2026-06-01T00:00:00Z'), bisherigeStufe: null, ...over,
});

describe('mietFaelligkeit', () => {
  it('liefert den Zahlungstag im Monat (UTC)', () => {
    expect(mietFaelligkeit(2026, 6, 3).toISOString()).toContain('2026-06-03');
  });
});

describe('bewertePosten', () => {
  it('Miete ueberfaellig erst nach Faelligkeit + Karenz', () => {
    const knapp = miete({ faelligAm: new Date('2026-07-09T00:00:00Z') }); // +5 Karenz = 14.07.
    const drueber = miete({ faelligAm: new Date('2026-07-07T00:00:00Z') }); // +5 = 12.07. < heute
    const [a, b] = bewertePosten([knapp, drueber], HEUTE, E);
    expect(a.ueberfaellig).toBe(false);
    expect(b.ueberfaellig).toBe(true);
  });

  it('NKA: 30-Tage-Regel ab Versand; ohne Versanddatum nie ueberfaellig', () => {
    const frisch: PostenInput = { typ: 'NEBENKOSTEN', referenzID: 9, beschreibung: 'NKA 2025', offenerBetrag: 200, faelligAm: new Date('2026-07-01T00:00:00Z'), bisherigeStufe: null };
    const alt: PostenInput = { ...frisch, faelligAm: new Date('2026-06-01T00:00:00Z') };
    const unversendet: PostenInput = { ...frisch, faelligAm: null };
    const [a, b, c] = bewertePosten([frisch, alt, unversendet], HEUTE, E);
    expect(a.ueberfaellig).toBe(false);
    expect(b.ueberfaellig).toBe(true);
    expect(c.ueberfaellig).toBe(false);
  });

  it('Mahngebuehr ist sofort ueberfaellig', () => {
    const g: PostenInput = { typ: 'MAHNGEBUEHR', referenzID: 4, beschreibung: 'Mahngebühr vom 01.06.2026', offenerBetrag: 5, faelligAm: new Date('2026-06-01T00:00:00Z'), bisherigeStufe: null };
    expect(bewertePosten([g], HEUTE, E)[0].ueberfaellig).toBe(true);
  });

  it('Stufen-Eskalation: null->ZE, ZE->M1, M1->M2, M2->Deckel(null)', () => {
    const stufen = [null, 'ZAHLUNGSERINNERUNG', 'MAHNUNG_1', 'MAHNUNG_2'] as const;
    const bewertet = bewertePosten(stufen.map((s, i) => miete({ referenzID: i, bisherigeStufe: s as PostenInput['bisherigeStufe'] })), HEUTE, E);
    expect(bewertet.map((p) => p.naechsteStufe)).toEqual(['ZAHLUNGSERINNERUNG', 'MAHNUNG_1', 'MAHNUNG_2', null]);
  });
});

describe('erstelleMahnVorschlag', () => {
  const offen = (over: Partial<OffenerPosten> = {}): OffenerPosten => ({
    ...miete(), ueberfaellig: true, naechsteStufe: 'ZAHLUNGSERINNERUNG', ...over,
  });

  it('mahnreif ohne Vorgeschichte, Stufe ZE, keine Gebuehr', () => {
    const v = erstelleMahnVorschlag([offen()], null, false, HEUTE, E);
    expect(v.mahnreif).toBe(true);
    if (v.mahnreif) {
      expect(v.stufe).toBe('ZAHLUNGSERINNERUNG');
      expect(v.gebuehr).toBe(0);
      expect(v.gesamtbetrag).toBe(500);
      expect(v.zahlungsfrist).toContain('2026-07-23'); // heute + 10
    }
  });

  it('hoechste anstehende Stufe gewinnt, Gebuehr ab MAHNUNG_1, Summe inkl. Gebuehr', () => {
    const v = erstelleMahnVorschlag(
      [offen(), offen({ referenzID: 2, naechsteStufe: 'MAHNUNG_1', offenerBetrag: 300 })],
      null, false, HEUTE, E,
    );
    if (v.mahnreif) {
      expect(v.stufe).toBe('MAHNUNG_1');
      expect(v.gebuehr).toBe(5);
      expect(v.gesamtbetrag).toBe(805);
    } else { throw new Error('sollte mahnreif sein'); }
  });

  it('Wartefrist sperrt', () => {
    const v = erstelleMahnVorschlag([offen()], new Date('2026-07-05T00:00:00Z'), false, HEUTE, E);
    expect(v.mahnreif).toBe(false);
    if (!v.mahnreif) {
      expect(v.grund).toBe('WARTEFRIST');
      expect(v.wartefristBis).toContain('2026-07-19');
    }
  });

  it('gesperrter Kontakt (anonymisiert/inaktiv) nie mahnreif', () => {
    const v = erstelleMahnVorschlag([offen()], null, true, HEUTE, E);
    expect(v.mahnreif).toBe(false);
    if (!v.mahnreif) expect(v.grund).toBe('KONTAKT_GESPERRT');
  });

  it('keine ueberfaelligen Posten', () => {
    const v = erstelleMahnVorschlag([offen({ ueberfaellig: false })], null, false, HEUTE, E);
    if (!v.mahnreif) expect(v.grund).toBe('KEINE_UEBERFAELLIGEN'); else throw new Error();
  });

  it('alle Posten am Deckel -> STUFEN_DECKEL', () => {
    const v = erstelleMahnVorschlag([offen({ naechsteStufe: null })], null, false, HEUTE, E);
    if (!v.mahnreif) expect(v.grund).toBe('STUFEN_DECKEL'); else throw new Error();
  });

  it('Deckel-Posten laufen im Schreiben mit, bestimmen aber die Stufe nicht', () => {
    const v = erstelleMahnVorschlag(
      [offen({ naechsteStufe: null, offenerBetrag: 400 }), offen({ referenzID: 2, naechsteStufe: 'ZAHLUNGSERINNERUNG' })],
      null, false, HEUTE, E,
    );
    if (v.mahnreif) {
      expect(v.stufe).toBe('ZAHLUNGSERINNERUNG');
      expect(v.positionen).toHaveLength(2);
      expect(v.gesamtbetrag).toBe(900);
    } else { throw new Error('sollte mahnreif sein'); }
  });
});
