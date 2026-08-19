import { PrismaClient, Prisma } from '@prisma/client';
import { CreateMieterInput, UpdateMieterInput } from '../schemas/mieter.schema';
import { notFound, conflict } from '../utils/errors';
import { standardEmail, ersterTelefon } from '../utils/kontakt';

function mitKontaktfeldern<T extends { kommunikation: { typ: string; wert: string; istStandard: boolean }[] }>(k: T) {
  return { ...k, email: standardEmail(k.kommunikation), telefon: ersterTelefon(k.kommunikation) };
}

const MIETER_WHERE: Prisma.KontaktWhereInput = {
  rollen: { some: { rolle: 'MIETER' } },
  anonymisiertAm: null,
};

export async function listMieter(prisma: PrismaClient, search?: string) {
  const kontakte = await prisma.kontakt.findMany({
    where: {
      ...MIETER_WHERE,
      ...(search
        ? {
            OR: [
              { vorname: { contains: search, mode: 'insensitive' } },
              { nachname: { contains: search, mode: 'insensitive' } },
              { firma: { contains: search, mode: 'insensitive' } },
              { kommunikation: { some: { wert: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    include: { kommunikation: true, rollen: true, ansprechpartner: true, _count: { select: { mietvertraege: true } } },
    orderBy: [{ nachname: 'asc' }, { vorname: 'asc' }],
  });
  return kontakte.map(mitKontaktfeldern);
}

export async function getMieter(prisma: PrismaClient, id: number) {
  const m = await prisma.kontakt.findFirst({
    where: { id, rollen: { some: { rolle: 'MIETER' } } },
    include: {
      kommunikation: true,
      mietvertraege: {
        include: {
          mieteinheit: {
            include: { mietobjekt: { select: { bezeichnung: true, strasse: true, ort: true } } },
          },
        },
        orderBy: { beginn: 'desc' },
      },
    },
  });
  if (!m) throw notFound('Mieter');
  return mitKontaktfeldern(m);
}

export async function createMieter(prisma: PrismaClient, data: CreateMieterInput) {
  const kommunikation: Prisma.KontaktKommunikationCreateWithoutKontaktInput[] = [];
  if (data.email) kommunikation.push({ typ: 'EMAIL', wert: data.email, istStandard: true });
  if (data.telefon) kommunikation.push({ typ: 'TELEFON', wert: data.telefon });

  const kontakt = await prisma.kontakt.create({
    data: {
      anrede: data.anrede,
      vorname: data.vorname,
      nachname: data.nachname,
      strasse: data.strasse,
      hausnummer: data.hausnummer,
      plz: data.plz,
      ort: data.ort,
      notizen: data.notizen,
      geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : undefined,
      rollen: { create: [{ rolle: 'MIETER' }] },
      kommunikation: { create: kommunikation },
    },
    include: { kommunikation: true },
  });
  return mitKontaktfeldern(kontakt);
}

export async function updateMieter(prisma: PrismaClient, id: number, data: UpdateMieterInput) {
  const bestehend = await prisma.kontakt.findFirst({
    where: { id, rollen: { some: { rolle: 'MIETER' } } },
  });
  if (!bestehend) throw notFound('Mieter');
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
    return tx.kontakt.update({
      where: { id },
      data: {
        ...stammdaten,
        geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : undefined,
      },
      include: { kommunikation: true },
    });
  });
  return mitKontaktfeldern(kontakt);
}
