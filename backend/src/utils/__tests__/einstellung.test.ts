import { describe, it, expect } from 'vitest';
import { ladeFristEinstellungen, ladeMahnEinstellungen } from '../../services/einstellung.service';
import { PrismaClient } from '@prisma/client';

function fakePrisma(rows: { schluessel: string; wert: string }[]): PrismaClient {
  return { einstellung: { findMany: async () => rows } } as unknown as PrismaClient;
}

describe('ladeMahnEinstellungen', () => {
  it('liefert Defaults ohne gespeicherte Werte', async () => {
    const e = await ladeMahnEinstellungen(fakePrisma([]));
    expect(e).toEqual({ gebuehr: 5, karenzTage: 5, wartefristTage: 14, zahlungsfristTage: 10 });
  });

  it('leerer String zaehlt als nicht gesetzt (Default statt 0)', async () => {
    const e = await ladeMahnEinstellungen(fakePrisma([
      { schluessel: 'mahn_gebuehr', wert: '' },
      { schluessel: 'mahn_karenz_tage', wert: '  ' },
    ]));
    expect(e.gebuehr).toBe(5);
    expect(e.karenzTage).toBe(5);
  });

  it('parst Komma-Dezimaltrenner und Zahlen', async () => {
    const e = await ladeMahnEinstellungen(fakePrisma([
      { schluessel: 'mahn_gebuehr', wert: '7,50' },
      { schluessel: 'mahn_wartefrist_tage', wert: '21' },
    ]));
    expect(e.gebuehr).toBe(7.5);
    expect(e.wartefristTage).toBe(21);
  });

  it('ungueltige Werte fallen auf Default zurueck', async () => {
    const e = await ladeMahnEinstellungen(fakePrisma([{ schluessel: 'mahn_zahlungsfrist_tage', wert: 'abc' }]));
    expect(e.zahlungsfristTage).toBe(10);
  });
});

describe('ladeFristEinstellungen', () => {
  it('liefert Defaults ohne gespeicherte Werte', async () => {
    const e = await ladeFristEinstellungen(fakePrisma([]));
    expect(e).toEqual({ vorlaufNkaTage: 90, vorlaufVertragsendeTage: 90, vorlaufManuellTage: 28 });
  });

  it('leerer String zaehlt als nicht gesetzt (Default statt 0)', async () => {
    const e = await ladeFristEinstellungen(fakePrisma([{ schluessel: 'frist_vorlauf_nka_tage', wert: '' }]));
    expect(e.vorlaufNkaTage).toBe(90);
  });

  it('gespeicherte Zahlen werden geparst', async () => {
    const e = await ladeFristEinstellungen(fakePrisma([
      { schluessel: 'frist_vorlauf_vertragsende_tage', wert: '120' },
      { schluessel: 'frist_vorlauf_manuell_tage', wert: '14' },
    ]));
    expect(e.vorlaufVertragsendeTage).toBe(120);
    expect(e.vorlaufManuellTage).toBe(14);
  });
});
