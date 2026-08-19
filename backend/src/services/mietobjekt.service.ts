import { PrismaClient } from '@prisma/client';
import { CreateMietobjektInput, UpdateMietobjektInput } from '../schemas/mietobjekt.schema';
import { notFound, badRequest } from '../utils/errors';

export async function listMietobjekte(
  prisma: PrismaClient,
  filter: { eigentuemerID?: number; typ?: string; aktiv?: boolean },
) {
  return prisma.mietobjekt.findMany({
    where: {
      ...(filter.eigentuemerID ? { eigentuemerID: filter.eigentuemerID } : {}),
      ...(filter.typ ? { typ: filter.typ as never } : {}),
      ...(filter.aktiv !== undefined ? { aktiv: filter.aktiv } : {}),
    },
    include: {
      eigentuemer: { select: { id: true, vorname: true, nachname: true } },
      _count: { select: { mieteinheiten: true } },
    },
    orderBy: { bezeichnung: 'asc' },
  });
}

export async function getMietobjekt(prisma: PrismaClient, id: number) {
  const m = await prisma.mietobjekt.findUnique({
    where: { id },
    include: {
      eigentuemer: true,
      mieteinheiten: {
        include: {
          mietvertraege: {
            where: { status: 'AKTIV' },
            include: { mieter: { select: { vorname: true, nachname: true } } },
          },
        },
      },
    },
  });
  if (!m) throw notFound('Mietobjekt');
  return m;
}

export async function createMietobjekt(prisma: PrismaClient, data: CreateMietobjektInput) {
  const eigentuemerKontakt = await prisma.kontakt.findUnique({ where: { id: data.eigentuemerID } });
  if (!eigentuemerKontakt) throw badRequest('Eigentümer-Kontakt nicht gefunden');
  if (eigentuemerKontakt.anonymisiertAm) throw badRequest('Anonymisierte Kontakte können keinem Objekt zugeordnet werden');
  await prisma.kontaktRolle.upsert({
    where: { kontaktID_rolle: { kontaktID: data.eigentuemerID, rolle: 'EIGENTUEMER' } },
    create: { kontaktID: data.eigentuemerID, rolle: 'EIGENTUEMER' },
    update: {},
  });

  return prisma.mietobjekt.create({
    data,
    include: { eigentuemer: { select: { id: true, vorname: true, nachname: true } } },
  });
}

export async function updateMietobjekt(
  prisma: PrismaClient,
  id: number,
  data: UpdateMietobjektInput,
) {
  await getMietobjekt(prisma, id);
  return prisma.mietobjekt.update({ where: { id }, data });
}

export async function deleteMietobjekt(prisma: PrismaClient, id: number) {
  await getMietobjekt(prisma, id);
  return prisma.mietobjekt.update({ where: { id }, data: { aktiv: false } });
}

export async function getKostenZusammenfassung(
  prisma: PrismaClient,
  mietobjektID: number,
  jahr: number,
) {
  const kosten = await prisma.kosten.groupBy({
    by: ['kategorie', 'umlagefaehig'],
    where: { mietobjektID, jahr },
    _sum: { betrag: true },
    orderBy: { kategorie: 'asc' },
  });
  return kosten;
}
