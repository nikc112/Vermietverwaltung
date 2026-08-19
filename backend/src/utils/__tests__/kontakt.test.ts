import { describe, it, expect } from 'vitest';
import { kontaktName, standardEmail, ersterTelefon } from '../kontakt';

describe('kontaktName', () => {
  it('nutzt Vorname + Nachname bei Personen', () => {
    expect(kontaktName({ vorname: 'Max', nachname: 'Mustermann', firma: null })).toBe('Max Mustermann');
  });
  it('nutzt Firma falls gesetzt', () => {
    expect(kontaktName({ vorname: '', nachname: '', firma: 'Hausmeister GmbH' })).toBe('Hausmeister GmbH');
  });
  it('ignoriert leere Firma', () => {
    expect(kontaktName({ vorname: 'Max', nachname: 'Mustermann', firma: '  ' })).toBe('Max Mustermann');
  });
});

describe('standardEmail', () => {
  const email = (wert: string, istStandard: boolean) => ({ typ: 'EMAIL', wert, istStandard });
  const telefon = { typ: 'TELEFON', wert: '0123', istStandard: false };

  it('liefert die Standard-EMAIL', () => {
    expect(standardEmail([email('a@b.de', false), email('c@d.de', true)])).toBe('c@d.de');
  });
  it('faellt auf erste EMAIL zurueck', () => {
    expect(standardEmail([telefon, email('a@b.de', false)])).toBe('a@b.de');
  });
  it('liefert undefined ohne EMAIL', () => {
    expect(standardEmail([telefon])).toBeUndefined();
  });
});

describe('ersterTelefon', () => {
  it('liefert TELEFON oder MOBIL, keine EMAIL', () => {
    expect(ersterTelefon([
      { typ: 'EMAIL', wert: 'a@b.de', istStandard: true },
      { typ: 'MOBIL', wert: '0171', istStandard: false },
    ])).toBe('0171');
  });
  it('liefert undefined ohne Telefonnummer', () => {
    expect(ersterTelefon([])).toBeUndefined();
  });
});
