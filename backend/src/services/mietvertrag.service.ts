import { PrismaClient } from '@prisma/client';
import {
  CreateMietvertragInput,
  UpdateMietvertragInput,
} from '../schemas/mietvertrag.schema';
import { notFound, conflict, badRequest } from '../utils/errors';
import { standardEmail } from '../utils/kontakt';

export async function listMietvertraege(
  prisma: PrismaClient,
  filter: { status?: string; mieteinheitID?: number; mieterID?: number },
) {
  const vertraege = await prisma.mietvertrag.findMany({
    where: {
      ...(filter.status ? { status: filter.status as never } : {}),
      ...(filter.mieteinheitID ? { mieteinheitID: filter.mieteinheitID } : {}),
      ...(filter.mieterID ? { mieterID: filter.mieterID } : {}),
    },
    include: {
      mieteinheit: {
        include: { mietobjekt: { select: { bezeichnung: true, strasse: true, ort: true } } },
      },
      mieter: { select: { id: true, vorname: true, nachname: true, kommunikation: true } },
    },
    orderBy: { beginn: 'desc' },
  });
  return vertraege.map((v) => ({
    ...v,
    mieter: { ...v.mieter, email: standardEmail(v.mieter.kommunikation) },
  }));
}

export async function getMietvertrag(prisma: PrismaClient, id: number) {
  const v = await prisma.mietvertrag.findUnique({
    where: { id },
    include: {
      mieteinheit: {
        include: {
          mietobjekt: {
            include: { eigentuemer: true },
          },
        },
      },
      mieter: { select: { id: true, anrede: true, vorname: true, nachname: true, firma: true, kommunikation: true } },
      mietzahlungen: { orderBy: [{ jahr: 'desc' }, { monat: 'desc' }] },
      nebenkostenabrechnungen: { orderBy: { abrechnungsjahr: 'desc' } },
    },
  });
  if (!v) throw notFound('Mietvertrag');
  return {
    ...v,
    mieter: { ...v.mieter, email: standardEmail(v.mieter.kommunikation) },
  };
}

export async function createMietvertrag(
  prisma: PrismaClient,
  data: CreateMietvertragInput,
) {
  const existing = await prisma.mietvertrag.findFirst({
    where: { vertragsnummer: data.vertragsnummer },
  });
  if (existing) throw conflict(`Vertragsnummer '${data.vertragsnummer}' existiert bereits`);

  const mieterKontakt = await prisma.kontakt.findUnique({ where: { id: data.mieterID } });
  if (!mieterKontakt) throw badRequest('Mieter-Kontakt nicht gefunden');
  if (mieterKontakt.anonymisiertAm) throw badRequest('Anonymisierte Kontakte können keinem Vertrag zugeordnet werden');
  await prisma.kontaktRolle.upsert({
    where: { kontaktID_rolle: { kontaktID: data.mieterID, rolle: 'MIETER' } },
    create: { kontaktID: data.mieterID, rolle: 'MIETER' },
    update: {},
  });

  return prisma.mietvertrag.create({
    data: {
      mieteinheitID: data.mieteinheitID,
      mieterID: data.mieterID,
      vertragsnummer: data.vertragsnummer,
      beginn: new Date(data.beginn),
      ende: data.ende ? new Date(data.ende) : null,
      kuendigungsfristMonate: data.kuendigungsfristMonate ?? 3,
      kaltmiete: data.kaltmiete,
      nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
      kaution: data.kaution,
      kautionBezahlt: data.kautionBezahlt ?? false,
      kautionBezahltAm: data.kautionBezahltAm ? new Date(data.kautionBezahltAm) : null,
      zahlungstag: data.zahlungstag ?? 1,
      personenAnzahl: data.personenAnzahl ?? 1,
      notizen: data.notizen,
    },
    include: {
      mieteinheit: { include: { mietobjekt: { select: { bezeichnung: true } } } },
      mieter: { select: { vorname: true, nachname: true } },
    },
  });
}

export async function updateMietvertrag(
  prisma: PrismaClient,
  id: number,
  data: UpdateMietvertragInput,
) {
  await getMietvertrag(prisma, id);
  return prisma.mietvertrag.update({
    where: { id },
    data: {
      ...data,
      beginn: data.beginn ? new Date(data.beginn) : undefined,
      ende: data.ende !== undefined ? (data.ende ? new Date(data.ende) : null) : undefined,
      kautionBezahltAm:
        data.kautionBezahltAm !== undefined
          ? data.kautionBezahltAm
            ? new Date(data.kautionBezahltAm)
            : null
          : undefined,
    },
  });
}

export async function kuendigenMietvertrag(
  prisma: PrismaClient,
  id: number,
  kuendigungsdatum: string,
) {
  const v = await getMietvertrag(prisma, id);
  if (v.status !== 'AKTIV') throw conflict('Vertrag ist nicht aktiv');
  return prisma.mietvertrag.update({
    where: { id },
    data: {
      status: 'GEKUENDIGT',
      ende: new Date(kuendigungsdatum),
    },
  });
}
