import { PrismaClient } from '@prisma/client';
import { CreateKostenInput, UpdateKostenInput, NOT_UMLAGEFAEHIG_KATEGORIEN } from '../schemas/kosten.schema';
import { notFound } from '../utils/errors';
import { loescheDokumenteFuerBezug } from './dokument.service';

export async function listKosten(
  prisma: PrismaClient,
  filter: {
    mietobjektID?: number;
    jahr?: number;
    kategorie?: string;
    umlagefaehig?: boolean;
  },
) {
  return prisma.kosten.findMany({
    where: {
      ...(filter.mietobjektID ? { mietobjektID: filter.mietobjektID } : {}),
      ...(filter.jahr ? { jahr: filter.jahr } : {}),
      ...(filter.kategorie ? { kategorie: filter.kategorie as never } : {}),
      ...(filter.umlagefaehig !== undefined ? { umlagefaehig: filter.umlagefaehig } : {}),
    },
    include: {
      mietobjekt: { select: { bezeichnung: true } },
      umlageZuordnungen: { include: { mieteinheit: { select: { bezeichnung: true } } } },
    },
    orderBy: [{ datum: 'desc' }],
  });
}

export async function getKosten(prisma: PrismaClient, id: number) {
  const k = await prisma.kosten.findUnique({
    where: { id },
    include: {
      umlageZuordnungen: { include: { mieteinheit: { select: { id: true, bezeichnung: true } } } },
    },
  });
  if (!k) throw notFound('Kosten');
  return k;
}

export async function createKosten(prisma: PrismaClient, data: CreateKostenInput) {
  const umlagefaehig = NOT_UMLAGEFAEHIG_KATEGORIEN.has(data.kategorie)
    ? false
    : data.umlagefaehig;

  return prisma.$transaction(async (tx) => {
    const kosten = await tx.kosten.create({
      data: {
        mietobjektID: data.mietobjektID,
        bezeichnung: data.bezeichnung,
        kategorie: data.kategorie,
        betrag: data.betrag,
        datum: new Date(data.datum),
        jahr: data.jahr,
        umlagefaehig,
        umlageSchluessel: data.umlageSchluessel ?? 'FLAECHE',
        umlageSchluessel2: data.umlageSchluessel2 ?? null,
        umlageGewicht1: data.umlageGewicht1 ?? null,
        umlageArt: data.umlageArt ?? 'ALLE_EINHEITEN',
        lohnanteil: data.lohnanteil ?? null,
        verbrauchswert: data.verbrauchswert,
        verbrauchEinheit: data.verbrauchEinheit,
        belegNummer: data.belegNummer,
        anbieter: data.anbieter,
        notizen: data.notizen,
      },
    });

    if (data.umlageArt === 'SPEZIFISCHE_EINHEITEN' && data.umlageEinheitenIDs?.length) {
      await tx.kostenUmlageZuordnung.createMany({
        data: data.umlageEinheitenIDs.map((mieteinheitID) => ({
          kostenID: kosten.id,
          mieteinheitID,
        })),
      });
    }

    return tx.kosten.findUnique({
      where: { id: kosten.id },
      include: { umlageZuordnungen: true },
    });
  });
}

export async function updateKosten(prisma: PrismaClient, id: number, data: UpdateKostenInput) {
  await getKosten(prisma, id);

  return prisma.$transaction(async (tx) => {
    if (data.umlageEinheitenIDs !== undefined) {
      await tx.kostenUmlageZuordnung.deleteMany({ where: { kostenID: id } });
      if (data.umlageArt === 'SPEZIFISCHE_EINHEITEN' && data.umlageEinheitenIDs.length) {
        await tx.kostenUmlageZuordnung.createMany({
          data: data.umlageEinheitenIDs.map((mieteinheitID) => ({ kostenID: id, mieteinheitID })),
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gewollt: Feld aus dem Update-Payload ausschliessen
    const { umlageEinheitenIDs: _ids, ...rest } = data;
    return tx.kosten.update({
      where: { id },
      data: {
        ...rest,
        datum: rest.datum ? new Date(rest.datum) : undefined,
        umlageSchluessel2: 'umlageSchluessel2' in data ? (rest.umlageSchluessel2 ?? null) : undefined,
        umlageGewicht1: 'umlageGewicht1' in data ? (rest.umlageGewicht1 ?? null) : undefined,
        lohnanteil: 'lohnanteil' in data ? (rest.lohnanteil ?? null) : undefined,
      },
    });
  });
}

export async function deleteKosten(prisma: PrismaClient, id: number) {
  await getKosten(prisma, id);
  // Entscheidet aufbewahrungspflichtig vs. loeschbar und raeumt die Dateien auf; die DB-Zeilen
  // wuerden sonst per ON DELETE SET NULL nur entkoppelt (nicht geloescht) und die Dateien
  // blieben in jedem Fall auf dem Host liegen
  await loescheDokumenteFuerBezug(prisma, 'kostenID', id);
  return prisma.kosten.delete({ where: { id } });
}

export const KATEGORIEN_META: Record<
  string,
  { label: string; umlagefaehig: boolean; schluessel: string }
> = {
  GRUNDSTEUER: { label: 'Grundsteuer', umlagefaehig: true, schluessel: 'FLAECHE' },
  KALTWASSER: { label: 'Kaltwasser', umlagefaehig: true, schluessel: 'VERBRAUCH' },
  ABWASSER: { label: 'Abwasser', umlagefaehig: true, schluessel: 'VERBRAUCH' },
  HEIZUNG: { label: 'Heizung', umlagefaehig: true, schluessel: 'VERBRAUCH' },
  WARMWASSER: { label: 'Warmwasser', umlagefaehig: true, schluessel: 'VERBRAUCH' },
  AUFZUG: { label: 'Aufzug', umlagefaehig: true, schluessel: 'EINHEIT' },
  STRASSENREINIGUNG: { label: 'Straßenreinigung', umlagefaehig: true, schluessel: 'FLAECHE' },
  MUELLABFUHR: { label: 'Müllabfuhr', umlagefaehig: true, schluessel: 'EINHEIT' },
  GEBAEUDEREINIGUNG: { label: 'Gebäudereinigung', umlagefaehig: true, schluessel: 'FLAECHE' },
  GARTENPFLEGE: { label: 'Gartenpflege', umlagefaehig: true, schluessel: 'FLAECHE' },
  ALLGEMEINSTROM: { label: 'Allgemeinstrom', umlagefaehig: true, schluessel: 'FLAECHE' },
  SCHORNSTEINREINIGUNG: { label: 'Schornsteinreinigung', umlagefaehig: true, schluessel: 'FLAECHE' },
  GEBAEUDEVERSICHERUNG: { label: 'Gebäudeversicherung', umlagefaehig: true, schluessel: 'FLAECHE' },
  HAFTPFLICHTVERSICHERUNG: { label: 'Haftpflichtversicherung', umlagefaehig: true, schluessel: 'FLAECHE' },
  HAUSMEISTER: { label: 'Hausmeisterkosten', umlagefaehig: true, schluessel: 'FLAECHE' },
  KABELFERNSEHEN: { label: 'Kabelfernsehen/Antenne', umlagefaehig: true, schluessel: 'EINHEIT' },
  VERWALTUNGSKOSTEN: { label: 'Verwaltungskosten', umlagefaehig: false, schluessel: 'FLAECHE' },
  INSTANDHALTUNG: { label: 'Instandhaltung/Reparaturen', umlagefaehig: false, schluessel: 'FLAECHE' },
  INSTANDSETZUNGSRUECKLAGE: { label: 'Instandsetzungsrücklage', umlagefaehig: false, schluessel: 'FLAECHE' },
  BANKGEBUEHREN: { label: 'Bankgebühren', umlagefaehig: false, schluessel: 'FLAECHE' },
  RECHTSKOSTEN: { label: 'Rechts-/Beratungskosten', umlagefaehig: false, schluessel: 'FLAECHE' },
  SONSTIGE_UMLAGEFAEHIG: { label: 'Sonstige (umlagefähig)', umlagefaehig: true, schluessel: 'FLAECHE' },
  SONSTIGE_NICHT_UMLAGEFAEHIG: { label: 'Sonstige (nicht umlagefähig)', umlagefaehig: false, schluessel: 'FLAECHE' },
};
