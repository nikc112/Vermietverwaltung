import { PrismaClient } from '@prisma/client';
import { CreateMieteinheitInput, UpdateMieteinheitInput } from '../schemas/mieteinheit.schema';
import { notFound } from '../utils/errors';

export async function listMieteinheiten(
  prisma: PrismaClient,
  filter: { mietobjektID?: number; aktiv?: boolean },
) {
  return prisma.mieteinheit.findMany({
    where: {
      ...(filter.mietobjektID ? { mietobjektID: filter.mietobjektID } : {}),
      ...(filter.aktiv !== undefined ? { aktiv: filter.aktiv } : {}),
    },
    include: {
      mietobjekt: { select: { id: true, bezeichnung: true } },
      mietvertraege: {
        where: { status: 'AKTIV' },
        include: { mieter: { select: { vorname: true, nachname: true } } },
        take: 1,
      },
    },
    orderBy: { bezeichnung: 'asc' },
  });
}

export async function getMieteinheit(prisma: PrismaClient, id: number) {
  const e = await prisma.mieteinheit.findUnique({
    where: { id },
    include: {
      mietobjekt: {
        include: { eigentuemer: { select: { vorname: true, nachname: true } } },
      },
      mietvertraege: {
        include: { mieter: true },
        orderBy: { beginn: 'desc' },
      },
    },
  });
  if (!e) throw notFound('Mieteinheit');
  return e;
}

export async function createMieteinheit(prisma: PrismaClient, data: CreateMieteinheitInput) {
  return prisma.mieteinheit.create({
    data: {
      mietobjektID: data.mietobjektID,
      bezeichnung: data.bezeichnung,
      typ: data.typ,
      flaeche: data.flaeche,
      zimmeranzahl: data.zimmeranzahl,
      etage: data.etage,
      notizen: data.notizen,
    },
    include: { mietobjekt: { select: { id: true, bezeichnung: true } } },
  });
}

export async function updateMieteinheit(
  prisma: PrismaClient,
  id: number,
  data: UpdateMieteinheitInput,
) {
  await getMieteinheit(prisma, id);
  return prisma.mieteinheit.update({ where: { id }, data });
}

export async function deleteMieteinheit(prisma: PrismaClient, id: number) {
  await getMieteinheit(prisma, id);
  return prisma.mieteinheit.update({ where: { id }, data: { aktiv: false } });
}
