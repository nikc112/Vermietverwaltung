import { PrismaClient } from '@prisma/client';
import {
  CreateMietzahlungInput,
  UpdateMietzahlungInput,
} from '../schemas/mietzahlung.schema';
import { notFound, conflict } from '../utils/errors';
import { standardEmail } from '../utils/kontakt';

export async function listMietzahlungen(
  prisma: PrismaClient,
  filter: { mietvertragID?: number; jahr?: number; eingegangen?: boolean },
) {
  return prisma.mietzahlung.findMany({
    where: {
      ...(filter.mietvertragID ? { mietvertragID: filter.mietvertragID } : {}),
      ...(filter.jahr ? { jahr: filter.jahr } : {}),
      ...(filter.eingegangen !== undefined ? { eingegangen: filter.eingegangen } : {}),
    },
    include: {
      mietvertrag: {
        include: {
          mieter: { select: { vorname: true, nachname: true } },
          mieteinheit: {
            include: { mietobjekt: { select: { bezeichnung: true } } },
          },
        },
      },
    },
    orderBy: [{ jahr: 'desc' }, { monat: 'desc' }],
  });
}

export async function getMietzahlung(prisma: PrismaClient, id: number) {
  const z = await prisma.mietzahlung.findUnique({ where: { id } });
  if (!z) throw notFound('Mietzahlung');
  return z;
}

export async function createMietzahlung(prisma: PrismaClient, data: CreateMietzahlungInput) {
  const existing = await prisma.mietzahlung.findUnique({
    where: {
      mietvertragID_monat_jahr: {
        mietvertragID: data.mietvertragID,
        monat: data.monat,
        jahr: data.jahr,
      },
    },
  });
  if (existing) throw conflict(`Eintrag für ${data.monat}/${data.jahr} existiert bereits`);

  return prisma.mietzahlung.create({
    data: {
      mietvertragID: data.mietvertragID,
      monat: data.monat,
      jahr: data.jahr,
      sollBetrag: data.sollBetrag,
      istBetrag: data.istBetrag,
      eingegangen: data.eingegangen ?? false,
      eingangsdat: data.eingangsdat ? new Date(data.eingangsdat) : null,
      zahlungsart: data.zahlungsart ?? 'UEBERWEISUNG',
      notizen: data.notizen,
    },
  });
}

export async function updateMietzahlung(
  prisma: PrismaClient,
  id: number,
  data: UpdateMietzahlungInput,
) {
  await getMietzahlung(prisma, id);
  return prisma.mietzahlung.update({
    where: { id },
    data: {
      ...data,
      eingangsdat: data.eingangsdat !== undefined
        ? data.eingangsdat ? new Date(data.eingangsdat) : null
        : undefined,
    },
  });
}

export async function getAusstehende(prisma: PrismaClient) {
  const today = new Date();
  const monat = today.getMonth() + 1;
  const jahr = today.getFullYear();

  const zahlungen = await prisma.mietzahlung.findMany({
    where: {
      eingegangen: false,
      OR: [
        { jahr: { lt: jahr } },
        { jahr, monat: { lte: monat } },
      ],
      mietvertrag: { status: 'AKTIV' },
    },
    include: {
      mietvertrag: {
        include: {
          mieter: { select: { vorname: true, nachname: true, kommunikation: true } },
          mieteinheit: {
            include: { mietobjekt: { select: { bezeichnung: true } } },
          },
        },
      },
    },
    orderBy: [{ jahr: 'asc' }, { monat: 'asc' }],
  });
  return zahlungen.map((z) => ({
    ...z,
    mietvertrag: {
      ...z.mietvertrag,
      mieter: { ...z.mietvertrag.mieter, email: standardEmail(z.mietvertrag.mieter.kommunikation) },
    },
  }));
}

export async function bulkAnlegen(
  prisma: PrismaClient,
  mietvertragID: number,
  jahr: number,
) {
  const vertrag = await prisma.mietvertrag.findUnique({
    where: { id: mietvertragID },
    select: { kaltmiete: true, nebenkostenVorauszahlung: true, beginn: true, ende: true },
  });
  if (!vertrag) throw notFound('Mietvertrag');

  const sollBetrag = Number(vertrag.kaltmiete) + Number(vertrag.nebenkostenVorauszahlung);
  const created: number[] = [];

  for (let monat = 1; monat <= 12; monat++) {
    const vertragsStart = new Date(vertrag.beginn);
    const vertragsEnde = vertrag.ende;
    const monatsDatum = new Date(jahr, monat - 1, 1);

    if (monatsDatum < new Date(vertragsStart.getFullYear(), vertragsStart.getMonth(), 1)) continue;
    if (vertragsEnde && monatsDatum > new Date(vertragsEnde.getFullYear(), vertragsEnde.getMonth(), 1)) continue;

    const exists = await prisma.mietzahlung.findUnique({
      where: { mietvertragID_monat_jahr: { mietvertragID, monat, jahr } },
    });
    if (!exists) {
      await prisma.mietzahlung.create({
        data: { mietvertragID, monat, jahr, sollBetrag, eingegangen: false },
      });
      created.push(monat);
    }
  }

  return { angelegteMonate: created };
}
