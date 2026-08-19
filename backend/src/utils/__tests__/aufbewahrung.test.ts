import { describe, it, expect } from 'vitest';
import { ermittleLoeschfall } from '../aufbewahrung';

const basis = {
  objektAnzahl: 0,
  vertraege: [] as { ende: Date | null }[],
  letztesAbrechnungsjahr: null as number | null,
  letzteZahlung: null as { monat: number; jahr: number } | null,
  mahnungAnzahl: 0,
  heute: new Date('2026-07-12T00:00:00Z'),
};

describe('ermittleLoeschfall', () => {
  it('LOESCHEN ohne Abhaengigkeiten', () => {
    expect(ermittleLoeschfall({ ...basis })).toEqual({ fall: 'LOESCHEN' });
  });

  it('GESPERRT ohne Datum bei zugeordnetem Objekt', () => {
    const e = ermittleLoeschfall({ ...basis, objektAnzahl: 2 });
    expect(e.fall).toBe('GESPERRT');
    if (e.fall === 'GESPERRT') expect(e.sperrBis).toBeNull();
  });

  it('GESPERRT ohne Datum bei laufendem Vertrag', () => {
    const e = ermittleLoeschfall({ ...basis, vertraege: [{ ende: null }] });
    expect(e.fall).toBe('GESPERRT');
    if (e.fall === 'GESPERRT') expect(e.sperrBis).toBeNull();
  });

  it('ANONYMISIEREN wenn Frist abgelaufen (Vertragsende 2010)', () => {
    const e = ermittleLoeschfall({ ...basis, vertraege: [{ ende: new Date('2010-06-30T00:00:00Z') }] });
    expect(e).toEqual({ fall: 'ANONYMISIEREN' });
  });

  it('GESPERRT mit sperrBis wenn Frist laeuft (Vertragsende 2020 -> Sperre bis 31.12.2030)', () => {
    const e = ermittleLoeschfall({ ...basis, vertraege: [{ ende: new Date('2020-03-31T00:00:00Z') }] });
    expect(e.fall).toBe('GESPERRT');
    if (e.fall === 'GESPERRT') expect(e.sperrBis).toContain('2030-12-31');
  });

  it('spaetere Abrechnung verlaengert die Frist ueber das Vertragsende hinaus', () => {
    const e = ermittleLoeschfall({
      ...basis,
      vertraege: [{ ende: new Date('2014-12-31T00:00:00Z') }],
      letztesAbrechnungsjahr: 2020,
    });
    expect(e.fall).toBe('GESPERRT'); // 2020 + 10 = Sperre bis 31.12.2030
  });

  it('letzte Zahlung zaehlt als Aktivitaet', () => {
    const e = ermittleLoeschfall({
      ...basis,
      vertraege: [{ ende: new Date('2005-01-31T00:00:00Z') }],
      letzteZahlung: { monat: 2, jahr: 2025 },
    });
    expect(e.fall).toBe('GESPERRT'); // 2025 + 10
  });

  it('ANONYMISIEREN statt LOESCHEN wenn Mahnhistorie existiert', () => {
    const e = ermittleLoeschfall({ ...basis, mahnungAnzahl: 2 });
    expect(e).toEqual({ fall: 'ANONYMISIEREN' });
  });

  it('Mahnhistorie aendert GESPERRT-Faelle nicht', () => {
    const e = ermittleLoeschfall({ ...basis, vertraege: [{ ende: null }], mahnungAnzahl: 1 });
    expect(e.fall).toBe('GESPERRT');
  });
});
