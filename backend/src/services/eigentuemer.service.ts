import { PrismaClient, Prisma } from '@prisma/client';
import { CreateEigentuemerInput, UpdateEigentuemerInput } from '../schemas/eigentuemer.schema';
import { notFound, conflict } from '../utils/errors';
import { standardEmail, ersterTelefon } from '../utils/kontakt';

function mitKontaktfeldern<T extends { kommunikation: { typ: string; wert: string; istStandard: boolean }[] }>(k: T) {
  return { ...k, email: standardEmail(k.kommunikation), telefon: ersterTelefon(k.kommunikation) };
}

const EIGENTUEMER_WHERE: Prisma.KontaktWhereInput = {
  rollen: { some: { rolle: 'EIGENTUEMER' } },
  anonymisiertAm: null,
};

export async function listEigentuemer(prisma: PrismaClient, aktiv?: boolean) {
  const kontakte = await prisma.kontakt.findMany({
    where: { ...EIGENTUEMER_WHERE, ...(aktiv !== undefined ? { aktiv } : {}) },
    include: { kommunikation: true, rollen: true, ansprechpartner: true, _count: { select: { mietobjekte: true } } },
    orderBy: [{ nachname: 'asc' }, { vorname: 'asc' }],
  });
  return kontakte.map(mitKontaktfeldern);
}

export async function getEigentuemer(prisma: PrismaClient, id: number) {
  const e = await prisma.kontakt.findFirst({
    where: { id, rollen: { some: { rolle: 'EIGENTUEMER' } } },
    include: {
      kommunikation: true,
      mietobjekte: {
        where: { aktiv: true },
        include: { _count: { select: { mieteinheiten: true } } },
      },
    },
  });
  if (!e) throw notFound('Eigentümer');
  return mitKontaktfeldern(e);
}

export async function createEigentuemer(prisma: PrismaClient, data: CreateEigentuemerInput) {
  const kommunikation: Prisma.KontaktKommunikationCreateWithoutKontaktInput[] = [];
  if (data.email) kommunikation.push({ typ: 'EMAIL', wert: data.email, istStandard: true });
  if (data.telefon) kommunikation.push({ typ: 'TELEFON', wert: data.telefon });

  const kontakt = await prisma.kontakt.create({
    data: {
      anrede: data.anrede,
      vorname: data.vorname,
      nachname: data.nachname,
      firma: data.firma,
      strasse: data.strasse,
      hausnummer: data.hausnummer,
      plz: data.plz,
      ort: data.ort,
      iban: data.iban,
      steuernummer: data.steuernummer,
      notizen: data.notizen,
      rollen: { create: [{ rolle: 'EIGENTUEMER' }] },
      kommunikation: { create: kommunikation },
    },
    include: { kommunikation: true },
  });
  return mitKontaktfeldern(kontakt);
}

export async function updateEigentuemer(
  prisma: PrismaClient,
  id: number,
  data: UpdateEigentuemerInput,
) {
  const bestehend = await prisma.kontakt.findFirst({
    where: { id, rollen: { some: { rolle: 'EIGENTUEMER' } } },
  });
  if (!bestehend) throw notFound('Eigentümer');
  if (bestehend.anonymisiertAm) throw conflict('Anonymisierte Kontakte können nicht bearbeitet werden');

  const { email, telefon, ...stammdaten } = data;
  const kontakt = await prisma.$transaction(async (tx) => {
    if (email !== undefined) {
      await tx.kontaktKommunikation.deleteMany({ where: { kontaktID: id, typ: 'EMAIL' } });
      if (email) {
        await tx.kontaktKommunikation.create({
          data: { kontaktID: id, typ: 'EMAIL', wert: email, istStandard: true },
        });
      }
    }
    if (telefon !== undefined) {
      await tx.kontaktKommunikation.deleteMany({ where: { kontaktID: id, typ: 'TELEFON' } });
      if (telefon) {
        await tx.kontaktKommunikation.create({
          data: { kontaktID: id, typ: 'TELEFON', wert: telefon },
        });
      }
    }
    return tx.kontakt.update({ where: { id }, data: stammdaten, include: { kommunikation: true } });
  });
  return mitKontaktfeldern(kontakt);
}

export async function deleteEigentuemer(prisma: PrismaClient, id: number) {
  const bestehend = await prisma.kontakt.findFirst({
    where: { id, rollen: { some: { rolle: 'EIGENTUEMER' } } },
  });
  if (!bestehend) throw notFound('Eigentümer');
  return prisma.kontakt.update({ where: { id }, data: { aktiv: false } });
}
