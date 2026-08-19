import { PrismaClient } from '@prisma/client';
import {
  AmpelFarbe, FristStatusTyp, FristTypTyp, VertragInput,
  ampelFuerFrist, berechneAutoFristen, mergeAutoFristen,
} from '../utils/fristen';
import { ladeFristEinstellungen } from './einstellung.service';
import { CreateFristInput, OverrideAutoFristInput, UpdateFristInput } from '../schemas/frist.schema';
import { kontaktName } from '../utils/kontakt';
import { badRequest, notFound } from '../utils/errors';

export interface FristAnzeige {
  id: number | null; // Zeilen-ID (manuell/Override); null = reine Auto-Frist ohne Override
  typ: FristTypTyp;
  quelle: 'AUTO' | 'MANUELL';
  titel: string;
  faelligAm: string;
  notizen: string | null;
  status: FristStatusTyp;
  ampel: AmpelFarbe;
  mietvertragID: number | null;
  referenzJahr: number | null;
  mietobjektID: number | null;
  kontaktID: number | null;
  bezug: string | null;
  aeltereOffen: number;
}

async function ladeVertragInputs(prisma: PrismaClient, vertragID?: number): Promise<VertragInput[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ['AKTIV', 'GEKUENDIGT'] }, ...(vertragID !== undefined ? { id: vertragID } : {}) },
    select: {
      id: true, vertragsnummer: true, beginn: true, ende: true, status: true,
      mieter: { select: { vorname: true, nachname: true, firma: true } },
      nebenkostenabrechnungen: { select: { abrechnungsjahr: true } },
    },
  });
  return vertraege.map((v) => ({
    id: v.id,
    vertragsnummer: v.vertragsnummer,
    beginn: v.beginn,
    ende: v.ende,
    status: v.status,
    abrechnungsjahre: v.nebenkostenabrechnungen.map((a) => a.abrechnungsjahr),
    mieterName: kontaktName(v.mieter),
  }));
}

export async function listeFristen(
  prisma: PrismaClient,
  status: FristStatusTyp = 'OFFEN',
): Promise<FristAnzeige[]> {
  const heute = new Date();
  const [vertragInputs, overrides, manuelle, einstellungen] = await Promise.all([
    ladeVertragInputs(prisma),
    prisma.frist.findMany({ where: { typ: { not: 'MANUELL' } } }),
    prisma.frist.findMany({
      where: { typ: 'MANUELL', status },
      include: {
        mietvertrag: { select: { vertragsnummer: true } },
        mietobjekt: { select: { bezeichnung: true } },
        kontakt: { select: { vorname: true, nachname: true, firma: true } },
      },
    }),
    ladeFristEinstellungen(prisma),
  ]);

  const kandidaten = berechneAutoFristen(vertragInputs, heute);
  const gemergt = mergeAutoFristen(kandidaten, overrides);
  const vertragNummern = new Map(vertragInputs.map((v) => [v.id, v.vertragsnummer]));

  const auto: FristAnzeige[] = gemergt
    .filter((f) => f.status === status)
    .map((f) => ({
      id: f.overrideID,
      typ: f.typ,
      quelle: 'AUTO' as const,
      titel: f.titel,
      faelligAm: f.faelligAm.toISOString(),
      notizen: f.notizen,
      status: f.status,
      // Aeltere offene Jahre sind immer bereits ueberfaellig, daher ROT unabhaengig vom Vorlauf des juengsten Jahres.
      ampel: f.aeltereOffen > 0 ? 'ROT' : ampelFuerFrist(f.typ, f.faelligAm, heute, einstellungen),
      mietvertragID: f.mietvertragID,
      referenzJahr: f.referenzJahr,
      mietobjektID: null,
      kontaktID: null,
      bezug: vertragNummern.get(f.mietvertragID) ?? null,
      aeltereOffen: f.aeltereOffen,
    }));

  // Verwaiste Overrides: Ihr Auto-Kandidat existiert nicht mehr (z.B. NKA erledigt und die
  // Abrechnung danach tatsaechlich erfasst). Ohne diesen Zweig wuerden solche Zeilen spurlos aus
  // der Historie verschwinden und liessen sich nie mehr loeschen. Erscheint der Kandidat spaeter
  // erneut (z.B. Abrechnung geloescht), greift der Override automatisch wieder – das ist gewollt.
  const passendeOverrideIDs = new Set(
    gemergt.filter((f) => f.overrideID !== null).map((f) => f.overrideID as number),
  );
  const verwaist = overrides.filter(
    (o) => !passendeOverrideIDs.has(o.id) && o.status === status && o.status !== 'OFFEN',
  );
  if (verwaist.length > 0) {
    const vertragIDs = [...new Set(verwaist.map((o) => o.mietvertragID).filter((id): id is number => id !== null))];
    const vertraege = await prisma.mietvertrag.findMany({
      where: { id: { in: vertragIDs } },
      select: { id: true, vertragsnummer: true },
    });
    const verwaisteNummern = new Map(vertraege.map((v) => [v.id, v.vertragsnummer]));
    for (const o of verwaist) {
      auto.push({
        id: o.id,
        typ: o.typ,
        quelle: 'AUTO' as const,
        titel: o.titel,
        faelligAm: o.faelligAm.toISOString(),
        notizen: o.notizen,
        status: o.status as FristStatusTyp,
        ampel: ampelFuerFrist(o.typ, o.faelligAm, heute, einstellungen),
        mietvertragID: o.mietvertragID,
        referenzJahr: o.referenzJahr,
        mietobjektID: null,
        kontaktID: null,
        bezug: o.mietvertragID !== null ? verwaisteNummern.get(o.mietvertragID) ?? null : null,
        aeltereOffen: 0,
      });
    }
  }

  const manuelleAnzeige: FristAnzeige[] = manuelle.map((f) => ({
    id: f.id,
    typ: 'MANUELL' as const,
    quelle: 'MANUELL' as const,
    titel: f.titel,
    faelligAm: f.faelligAm.toISOString(),
    notizen: f.notizen,
    status: f.status as FristStatusTyp,
    ampel: ampelFuerFrist('MANUELL', f.faelligAm, heute, einstellungen),
    mietvertragID: f.mietvertragID,
    referenzJahr: null,
    mietobjektID: f.mietobjektID,
    kontaktID: f.kontaktID,
    bezug:
      f.mietvertrag?.vertragsnummer ??
      f.mietobjekt?.bezeichnung ??
      (f.kontakt ? kontaktName(f.kontakt) : null),
    aeltereOffen: 0,
  }));

  return [...auto, ...manuelleAnzeige].sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
}

export async function zaehleFristenAmpel(prisma: PrismaClient): Promise<{ rot: number; gelb: number }> {
  const offene = await listeFristen(prisma, 'OFFEN');
  return {
    rot: offene.filter((f) => f.ampel === 'ROT').length,
    gelb: offene.filter((f) => f.ampel === 'GELB').length,
  };
}

async function pruefeBezuege(
  prisma: PrismaClient,
  data: { mietvertragID?: number; mietobjektID?: number; kontaktID?: number },
) {
  if (data.mietvertragID !== undefined) {
    const v = await prisma.mietvertrag.findUnique({ where: { id: data.mietvertragID }, select: { id: true } });
    if (!v) throw badRequest('Mietvertrag nicht gefunden');
  }
  if (data.mietobjektID !== undefined) {
    const o = await prisma.mietobjekt.findUnique({ where: { id: data.mietobjektID }, select: { id: true } });
    if (!o) throw badRequest('Mietobjekt nicht gefunden');
  }
  if (data.kontaktID !== undefined) {
    const k = await prisma.kontakt.findUnique({ where: { id: data.kontaktID }, select: { id: true } });
    if (!k) throw badRequest('Kontakt nicht gefunden');
  }
}

export async function createFrist(prisma: PrismaClient, data: CreateFristInput) {
  await pruefeBezuege(prisma, data);
  return prisma.frist.create({
    data: {
      typ: 'MANUELL',
      titel: data.titel,
      faelligAm: new Date(data.faelligAm),
      notizen: data.notizen ?? null,
      mietvertragID: data.mietvertragID ?? null,
      mietobjektID: data.mietobjektID ?? null,
      kontaktID: data.kontaktID ?? null,
    },
  });
}

function statusDaten(status: FristStatusTyp | undefined) {
  if (status === undefined) return {};
  return { status, erledigtAm: status === 'ERLEDIGT' ? new Date() : null };
}

export async function updateFrist(prisma: PrismaClient, id: number, data: UpdateFristInput) {
  const frist = await prisma.frist.findUnique({ where: { id } });
  if (!frist) throw notFound('Frist');
  return prisma.frist.update({
    where: { id },
    data: {
      ...(data.titel !== undefined ? { titel: data.titel } : {}),
      ...(data.faelligAm !== undefined ? { faelligAm: new Date(data.faelligAm) } : {}),
      ...(data.notizen !== undefined ? { notizen: data.notizen } : {}),
      ...statusDaten(data.status),
    },
  });
}

// Copy-on-write: legt beim ersten Bearbeiten einer Auto-Frist die Override-Zeile an
export async function overrideAutoFrist(
  prisma: PrismaClient,
  typ: 'NKA_ABRECHNUNG' | 'VERTRAGSENDE',
  vertragID: number,
  data: OverrideAutoFristInput,
) {
  if (typ === 'NKA_ABRECHNUNG' && data.referenzJahr === undefined) {
    throw badRequest('referenzJahr ist für NKA-Fristen erforderlich');
  }
  const referenzJahr = typ === 'NKA_ABRECHNUNG' ? (data.referenzJahr as number) : 0;

  const inputs = await ladeVertragInputs(prisma, vertragID);
  const kandidat = berechneAutoFristen(inputs, new Date()).find(
    (k) => k.typ === typ && k.mietvertragID === vertragID && k.referenzJahr === referenzJahr,
  );
  if (!kandidat) throw notFound('Auto-Frist');

  return prisma.frist.upsert({
    where: { typ_mietvertragID_referenzJahr: { typ, mietvertragID: vertragID, referenzJahr } },
    update: {
      ...(data.faelligAm !== undefined ? { faelligAm: new Date(data.faelligAm) } : {}),
      ...(data.notizen !== undefined ? { notizen: data.notizen } : {}),
      ...statusDaten(data.status),
    },
    create: {
      typ,
      titel: kandidat.titel,
      faelligAm: data.faelligAm !== undefined ? new Date(data.faelligAm) : kandidat.faelligAm,
      notizen: data.notizen ?? null,
      mietvertragID: vertragID,
      referenzJahr,
      ...statusDaten(data.status),
    },
  });
}

export async function deleteFrist(prisma: PrismaClient, id: number) {
  const frist = await prisma.frist.findUnique({ where: { id } });
  if (!frist) throw notFound('Frist');
  await prisma.frist.delete({ where: { id } }); // Override-Loeschung reaktiviert die Auto-Frist
  return { message: 'Frist gelöscht' };
}
