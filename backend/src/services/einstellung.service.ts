import { PrismaClient } from '@prisma/client';
import { MahnEinstellungen } from '../utils/mahnstufen';
import { FristEinstellungen } from '../utils/fristen';

export const MAHN_SCHLUESSEL = [
  'mahn_gebuehr',
  'mahn_karenz_tage',
  'mahn_wartefrist_tage',
  'mahn_zahlungsfrist_tage',
] as const;

const MAHN_DEFAULTS: Record<(typeof MAHN_SCHLUESSEL)[number], number> = {
  mahn_gebuehr: 5.0,
  mahn_karenz_tage: 5,
  mahn_wartefrist_tage: 14,
  mahn_zahlungsfrist_tage: 10,
};

export const FRIST_SCHLUESSEL = [
  'frist_vorlauf_nka_tage',
  'frist_vorlauf_vertragsende_tage',
  'frist_vorlauf_manuell_tage',
] as const;

const FRIST_DEFAULTS: Record<(typeof FRIST_SCHLUESSEL)[number], number> = {
  frist_vorlauf_nka_tage: 90,
  frist_vorlauf_vertragsende_tage: 90,
  frist_vorlauf_manuell_tage: 28,
};

// Leere/ungueltige Werte fallen auf den Default zurueck; Komma-Dezimaltrenner erlaubt
function zahlOderDefault(rows: { schluessel: string; wert: string }[], key: string, def: number): number {
  const raw = rows.find((r) => r.schluessel === key)?.wert;
  const num = raw !== undefined && raw.trim() !== '' ? Number(raw.replace(',', '.')) : NaN;
  return Number.isFinite(num) ? num : def;
}

export async function ladeMahnEinstellungen(prisma: PrismaClient): Promise<MahnEinstellungen> {
  const rows = await prisma.einstellung.findMany({
    where: { schluessel: { in: [...MAHN_SCHLUESSEL] } },
  });
  return {
    gebuehr: zahlOderDefault(rows, 'mahn_gebuehr', MAHN_DEFAULTS.mahn_gebuehr),
    karenzTage: zahlOderDefault(rows, 'mahn_karenz_tage', MAHN_DEFAULTS.mahn_karenz_tage),
    wartefristTage: zahlOderDefault(rows, 'mahn_wartefrist_tage', MAHN_DEFAULTS.mahn_wartefrist_tage),
    zahlungsfristTage: zahlOderDefault(rows, 'mahn_zahlungsfrist_tage', MAHN_DEFAULTS.mahn_zahlungsfrist_tage),
  };
}

export async function ladeFristEinstellungen(prisma: PrismaClient): Promise<FristEinstellungen> {
  const rows = await prisma.einstellung.findMany({
    where: { schluessel: { in: [...FRIST_SCHLUESSEL] } },
  });
  return {
    vorlaufNkaTage: zahlOderDefault(rows, 'frist_vorlauf_nka_tage', FRIST_DEFAULTS.frist_vorlauf_nka_tage),
    vorlaufVertragsendeTage: zahlOderDefault(rows, 'frist_vorlauf_vertragsende_tage', FRIST_DEFAULTS.frist_vorlauf_vertragsende_tage),
    vorlaufManuellTage: zahlOderDefault(rows, 'frist_vorlauf_manuell_tage', FRIST_DEFAULTS.frist_vorlauf_manuell_tage),
  };
}
