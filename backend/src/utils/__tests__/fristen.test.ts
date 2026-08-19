import { describe, it, expect } from 'vitest';
import {
  AutoFristKandidat, FristEinstellungen, FristOverride, VertragInput,
  ampelFuerFrist, berechneAutoFristen, mergeAutoFristen,
} from '../fristen';

const E: FristEinstellungen = { vorlaufNkaTage: 90, vorlaufVertragsendeTage: 90, vorlaufManuellTage: 28 };
const HEUTE = new Date(Date.UTC(2026, 7, 15)); // 15.08.2026

function vertrag(over: Partial<VertragInput> = {}): VertragInput {
  return {
    id: 1, vertragsnummer: 'MV-1', beginn: new Date(Date.UTC(2024, 0, 1)), ende: null,
    status: 'AKTIV', abrechnungsjahre: [], mieterName: 'Max Muster', ...over,
  };
}

describe('berechneAutoFristen — NKA', () => {
  it('meldet das juengste offene Jahr mit Frist 31.12. des Folgejahres', () => {
    const k = berechneAutoFristen([vertrag()], HEUTE);
    const nka = k.filter((x) => x.typ === 'NKA_ABRECHNUNG');
    expect(nka).toHaveLength(1);
    expect(nka[0].referenzJahr).toBe(2025);
    expect(nka[0].faelligAm.toISOString()).toContain('2026-12-31');
    expect(nka[0].aeltereOffen).toBe(1); // 2024 ist ebenfalls offen
    expect(nka[0].titel).toBe('NKA 2025 erstellen – MV-1 / Max Muster');
  });

  it('keine Frist, wenn alle Jahre abgerechnet sind', () => {
    const k = berechneAutoFristen([vertrag({ abrechnungsjahre: [2024, 2025] })], HEUTE);
    expect(k.filter((x) => x.typ === 'NKA_ABRECHNUNG')).toHaveLength(0);
  });

  it('keine Frist fuer das laufende Jahr (Vertragsbeginn 2026)', () => {
    const k = berechneAutoFristen([vertrag({ beginn: new Date(Date.UTC(2026, 2, 1)) })], HEUTE);
    expect(k.filter((x) => x.typ === 'NKA_ABRECHNUNG')).toHaveLength(0);
  });

  it('Vertragsbeginn mitten im Jahr zaehlt: Jahr 2025 braucht Abrechnung', () => {
    const k = berechneAutoFristen([vertrag({ beginn: new Date(Date.UTC(2025, 6, 1)) })], HEUTE);
    const nka = k.filter((x) => x.typ === 'NKA_ABRECHNUNG');
    expect(nka).toHaveLength(1);
    expect(nka[0].referenzJahr).toBe(2025);
    expect(nka[0].aeltereOffen).toBe(0);
  });

  it('nicht-aktive Vertraege liefern keine Kandidaten', () => {
    const k = berechneAutoFristen([vertrag({ status: 'BEENDET' })], HEUTE);
    expect(k).toHaveLength(0);
  });

  it('GEKUENDIGTE Vertraege liefern weiterhin NKA- und Vertragsende-Kandidaten', () => {
    const ende = new Date(Date.UTC(2026, 11, 31));
    const k = berechneAutoFristen([vertrag({ status: 'GEKUENDIGT', ende })], HEUTE);
    expect(k.filter((x) => x.typ === 'NKA_ABRECHNUNG')).toHaveLength(1);
    expect(k.filter((x) => x.typ === 'VERTRAGSENDE')).toHaveLength(1);
  });

  it('BEENDETE Vertraege liefern keine Kandidaten (auch mit Ende-Datum)', () => {
    const ende = new Date(Date.UTC(2026, 11, 31));
    const k = berechneAutoFristen([vertrag({ status: 'BEENDET', ende })], HEUTE);
    expect(k).toHaveLength(0);
  });

  it('offenes NKA-Jahr und Vertragsende ergeben zusammen genau zwei Kandidaten', () => {
    const ende = new Date(Date.UTC(2026, 11, 31));
    const k = berechneAutoFristen([vertrag({ ende })], HEUTE);
    expect(k).toHaveLength(2);
    expect(k.filter((x) => x.typ === 'NKA_ABRECHNUNG')).toHaveLength(1);
    expect(k.filter((x) => x.typ === 'VERTRAGSENDE')).toHaveLength(1);
  });
});

describe('berechneAutoFristen — Vertragsende', () => {
  it('Vertrag mit Ende-Datum erzeugt VERTRAGSENDE-Kandidat mit referenzJahr 0', () => {
    const ende = new Date(Date.UTC(2026, 11, 31));
    const k = berechneAutoFristen([vertrag({ ende, abrechnungsjahre: [2024, 2025] })], HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].typ).toBe('VERTRAGSENDE');
    expect(k[0].referenzJahr).toBe(0);
    expect(k[0].faelligAm).toEqual(ende);
    expect(k[0].titel).toBe('Vertrag MV-1 endet');
  });
});

describe('ampelFuerFrist', () => {
  const tage = (n: number) => new Date(HEUTE.getTime() + n * 24 * 60 * 60 * 1000);

  it('ueberfaellig ist ROT', () => {
    expect(ampelFuerFrist('MANUELL', tage(-1), HEUTE, E)).toBe('ROT');
  });
  it('faellig heute ist GELB', () => {
    expect(ampelFuerFrist('MANUELL', HEUTE, HEUTE, E)).toBe('GELB');
  });
  it('genau am Vorlaufrand ist GELB, dahinter GRUEN (manuell 28 Tage)', () => {
    expect(ampelFuerFrist('MANUELL', tage(28), HEUTE, E)).toBe('GELB');
    expect(ampelFuerFrist('MANUELL', tage(29), HEUTE, E)).toBe('GRUEN');
  });
  it('NKA nutzt den NKA-Vorlauf (90 Tage)', () => {
    expect(ampelFuerFrist('NKA_ABRECHNUNG', tage(90), HEUTE, E)).toBe('GELB');
    expect(ampelFuerFrist('NKA_ABRECHNUNG', tage(91), HEUTE, E)).toBe('GRUEN');
  });

  it('VERTRAGSENDE nutzt den Vertragsende-Vorlauf (90 Tage)', () => {
    expect(ampelFuerFrist('VERTRAGSENDE', tage(90), HEUTE, E)).toBe('GELB');
    expect(ampelFuerFrist('VERTRAGSENDE', tage(91), HEUTE, E)).toBe('GRUEN');
  });

  it('heute mit Uhrzeit behandelt eine heute faellige Frist als GELB, nicht ROT (Tagesgranularitaet)', () => {
    const heuteMitUhrzeit = new Date(Date.UTC(2026, 7, 15, 9, 30));
    const faelligAm = new Date(Date.UTC(2026, 7, 15));
    expect(ampelFuerFrist('MANUELL', faelligAm, heuteMitUhrzeit, E)).toBe('GELB');
  });
});

describe('mergeAutoFristen', () => {
  const kandidat: AutoFristKandidat = {
    typ: 'NKA_ABRECHNUNG', mietvertragID: 1, referenzJahr: 2025,
    titel: 'NKA 2025 erstellen – MV-1 / Max Muster',
    faelligAm: new Date(Date.UTC(2026, 11, 31)), aeltereOffen: 0,
  };
  const override = (over: Partial<FristOverride> = {}): FristOverride => ({
    id: 7, typ: 'NKA_ABRECHNUNG', mietvertragID: 1, referenzJahr: 2025,
    titel: 'NKA 2025 erstellen – MV-1 / Max Muster',
    faelligAm: new Date(Date.UTC(2027, 1, 28)), notizen: 'verschoben', status: 'OFFEN', ...over,
  });

  it('ohne Override bleibt der Kandidat unveraendert (overrideID null, OFFEN)', () => {
    const [f] = mergeAutoFristen([kandidat], []);
    expect(f.overrideID).toBeNull();
    expect(f.status).toBe('OFFEN');
    expect(f.faelligAm).toEqual(kandidat.faelligAm);
  });

  it('Override ersetzt faelligAm/notizen und liefert overrideID', () => {
    const [f] = mergeAutoFristen([kandidat], [override()]);
    expect(f.overrideID).toBe(7);
    expect(f.faelligAm.toISOString()).toContain('2027-02-28');
    expect(f.notizen).toBe('verschoben');
  });

  it('VERWORFEN-Status wird uebernommen', () => {
    const [f] = mergeAutoFristen([kandidat], [override({ status: 'VERWORFEN' })]);
    expect(f.status).toBe('VERWORFEN');
  });

  it('Override eines anderen Jahres greift nicht', () => {
    const [f] = mergeAutoFristen([kandidat], [override({ referenzJahr: 2024 })]);
    expect(f.overrideID).toBeNull();
  });
});
