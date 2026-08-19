import { PrismaClient, KostenKategorie, UmlageSchluessel } from '@prisma/client';
import { notFound, conflict, badRequest } from '../utils/errors';
import { zeitraumFaktor } from '../utils/date';
import { toNumber, roundHalfUp } from '../utils/currency';
import { kontaktName } from '../utils/kontakt';
import { loescheDokumenteFuerBezug } from './dokument.service';

const PARAGRAPH_35A_KATEGORIEN = new Set([
  'HAUSMEISTER', 'GARTENPFLEGE', 'GEBAEUDEREINIGUNG',
  'SCHORNSTEINREINIGUNG', 'HEIZUNG', 'WARMWASSER',
]);

export interface NebenkostenPositionVorschau {
  kategorie: KostenKategorie;
  bezeichnung: string;
  gesamtkosten: number;
  umlageSchluessel: UmlageSchluessel;
  anteilFaktor: number;
  zeitraumFaktor: number;
  mieterAnteil: number;
  grundlageZaehler?: number;
  grundlageNenner?: number;
  grundlageEinheit?: string;
  lohnanteilAnteil?: number;
}

export interface NebenkostenVorschau {
  mietvertragID: number;
  abrechnungsjahr: number;
  abrechnungStart: Date;
  abrechnungEnde: Date;
  mieterName: string;
  einheitBezeichnung: string;
  einheitFlaeche: number;
  positionen: NebenkostenPositionVorschau[];
  gesamtkosten: number;
  mieterAnteil: number;
  geleisteteVZ: number;
  saldo: number;
}

export async function berechneVorschau(
  prisma: PrismaClient,
  mietvertragID: number,
  abrechnungsjahr: number,
  abrechnungStart?: Date,
  abrechnungEnde?: Date,
): Promise<NebenkostenVorschau> {
  const vertrag = await prisma.mietvertrag.findUnique({
    where: { id: mietvertragID },
    include: {
      mieter: true,
      mieteinheit: {
        include: {
          mietobjekt: true,
          mietvertraege: {
            where: { status: { not: 'BEENDET' } },
            select: { personenAnzahl: true, mieteinheit: { select: { flaeche: true } } },
          },
        },
      },
      mietzahlungen: { where: { jahr: abrechnungsjahr } },
    },
  });

  if (!vertrag) throw notFound('Mietvertrag');

  const einheit = vertrag.mieteinheit;
  const mietobjektID = einheit.mietobjektID;
  const einheitFlaeche = toNumber(einheit.flaeche);
  const mieterPersonenAnzahl = vertrag.personenAnzahl;

  const periodStart = abrechnungStart ?? new Date(`${abrechnungsjahr}-01-01`);
  const periodEnde = abrechnungEnde ?? new Date(`${abrechnungsjahr}-12-31`);

  const alleAktivenEinheiten = await prisma.mieteinheit.findMany({
    where: { mietobjektID, aktiv: true },
    select: { id: true, flaeche: true },
  });

  const gesamtFlaeche = alleAktivenEinheiten.reduce(
    (sum, e) => sum + toNumber(e.flaeche),
    0,
  );
  const anzahlEinheiten = alleAktivenEinheiten.length;

  const alleAktivenVertraege = await prisma.mietvertrag.findMany({
    where: {
      mieteinheit: { mietobjektID },
      status: 'AKTIV',
    },
    select: { personenAnzahl: true },
  });
  const gesamtPersonen = alleAktivenVertraege.reduce((s, v) => s + v.personenAnzahl, 0);

  const zFaktor = zeitraumFaktor(vertrag.beginn, vertrag.ende, abrechnungsjahr, periodStart, periodEnde);
  if (zFaktor === 0) throw badRequest('Mietvertrag war in diesem Zeitraum nicht aktiv');

  const kostenListe = await prisma.kosten.findMany({
    where: { mietobjektID, jahr: abrechnungsjahr, umlagefaehig: true },
    include: {
      umlageZuordnungen: { select: { mieteinheitID: true } },
    },
  });

  const positionen: NebenkostenPositionVorschau[] = [];

  for (const kosten of kostenListe) {
    if (kosten.umlageArt === 'SPEZIFISCHE_EINHEITEN') {
      const zugeordnet = kosten.umlageZuordnungen.map((z) => z.mieteinheitID);
      if (!zugeordnet.includes(einheit.id)) continue;
    }

    async function berechneAnteilFuer(schluessel: UmlageSchluessel): Promise<{
      anteil: number;
      zaehler: number;
      nenner: number;
      einheit: string;
    }> {
      switch (schluessel) {
        case 'FLAECHE':
          return {
            anteil: gesamtFlaeche > 0 ? einheitFlaeche / gesamtFlaeche : 0,
            zaehler: einheitFlaeche,
            nenner: gesamtFlaeche,
            einheit: 'm²',
          };
        case 'PERSONEN':
          return {
            anteil: gesamtPersonen > 0 ? mieterPersonenAnzahl / gesamtPersonen : 0,
            zaehler: mieterPersonenAnzahl,
            nenner: gesamtPersonen,
            einheit: 'Pers.',
          };
        case 'EINHEIT':
          return {
            anteil: anzahlEinheiten > 0 ? 1 / anzahlEinheiten : 0,
            zaehler: 1,
            nenner: anzahlEinheiten,
            einheit: 'Einh.',
          };
        case 'VERBRAUCH': {
          if (kosten.verbrauchswert && toNumber(kosten.verbrauchswert) > 0) {
            const gesamtVerbrauch = await prisma.kosten.aggregate({
              where: {
                mietobjektID,
                kategorie: kosten.kategorie,
                jahr: abrechnungsjahr,
                umlagefaehig: true,
              },
              _sum: { verbrauchswert: true },
            });
            const gesamt = toNumber(gesamtVerbrauch._sum.verbrauchswert ?? 0);
            return {
              anteil: gesamt > 0 ? toNumber(kosten.verbrauchswert) / gesamt : 0,
              zaehler: toNumber(kosten.verbrauchswert),
              nenner: gesamt,
              einheit: kosten.verbrauchEinheit ?? '',
            };
          } else {
            return {
              anteil: gesamtFlaeche > 0 ? einheitFlaeche / gesamtFlaeche : 0,
              zaehler: einheitFlaeche,
              nenner: gesamtFlaeche,
              einheit: 'm²',
            };
          }
        }
      }
    }

    let anteilFaktor = 0;
    let grundlageZaehler: number | undefined;
    let grundlageNenner: number | undefined;
    let grundlageEinheit: string | undefined;

    if (kosten.umlageSchluessel2 && kosten.umlageGewicht1 !== null) {
      const g = toNumber(kosten.umlageGewicht1!);
      const res1 = await berechneAnteilFuer(kosten.umlageSchluessel);
      const res2 = await berechneAnteilFuer(kosten.umlageSchluessel2 as UmlageSchluessel);
      anteilFaktor = (g * res1.anteil) + ((1 - g) * res2.anteil);
      grundlageZaehler = anteilFaktor;
      grundlageNenner = 1;
      grundlageEinheit = 'Gem.';
    } else {
      const res = await berechneAnteilFuer(kosten.umlageSchluessel);
      anteilFaktor = res.anteil;
      grundlageZaehler = res.zaehler;
      grundlageNenner = res.nenner;
      grundlageEinheit = res.einheit;
    }

    const gesamtkosten = toNumber(kosten.betrag);
    const mieterAnteil = roundHalfUp(gesamtkosten * anteilFaktor * zFaktor);

    const lohnanteilAnteil =
      PARAGRAPH_35A_KATEGORIEN.has(kosten.kategorie) &&
      kosten.lohnanteil &&
      toNumber(kosten.lohnanteil) > 0
        ? roundHalfUp(toNumber(kosten.lohnanteil) * anteilFaktor * zFaktor)
        : undefined;

    positionen.push({
      kategorie: kosten.kategorie,
      bezeichnung: kosten.bezeichnung,
      gesamtkosten,
      umlageSchluessel: kosten.umlageSchluessel,
      anteilFaktor: roundHalfUp(anteilFaktor, 6),
      zeitraumFaktor: zFaktor,
      mieterAnteil,
      grundlageZaehler,
      grundlageNenner,
      grundlageEinheit,
      lohnanteilAnteil,
    });
  }

  const gesamtkosten = roundHalfUp(positionen.reduce((s, p) => s + p.gesamtkosten, 0));
  const mieterAnteil = roundHalfUp(positionen.reduce((s, p) => s + p.mieterAnteil, 0));

  const vzJahrZahlungen = await prisma.mietzahlung.findMany({
    where: { mietvertragID, jahr: abrechnungsjahr },
    select: { eingegangen: true },
  });
  const vertragData = await prisma.mietvertrag.findUnique({
    where: { id: mietvertragID },
    select: { nebenkostenVorauszahlung: true },
  });
  const nkVZ = toNumber(vertragData!.nebenkostenVorauszahlung);
  const gezahlteMonateCount = vzJahrZahlungen.filter((z) => z.eingegangen).length;
  const geleisteteVZ = roundHalfUp(gezahlteMonateCount * nkVZ);

  const saldo = roundHalfUp(mieterAnteil - geleisteteVZ);

  return {
    mietvertragID,
    abrechnungsjahr,
    abrechnungStart: periodStart,
    abrechnungEnde: periodEnde,
    mieterName: kontaktName(vertrag.mieter),
    einheitBezeichnung: einheit.bezeichnung,
    einheitFlaeche,
    positionen,
    gesamtkosten,
    mieterAnteil,
    geleisteteVZ,
    saldo,
  };
}

export async function createAbrechnung(
  prisma: PrismaClient,
  mietvertragID: number,
  abrechnungsjahr: number,
  notizen?: string,
  abrechnungStart?: Date,
  abrechnungEnde?: Date,
) {
  const existing = await prisma.nebenkostenAbrechnung.findUnique({
    where: { mietvertragID_abrechnungsjahr: { mietvertragID, abrechnungsjahr } },
  });
  if (existing) throw conflict(`Abrechnung für ${abrechnungsjahr} existiert bereits`);

  const vorschau = await berechneVorschau(prisma, mietvertragID, abrechnungsjahr, abrechnungStart, abrechnungEnde);

  return prisma.nebenkostenAbrechnung.create({
    data: {
      mietvertragID,
      abrechnungsjahr,
      abrechnungStart: vorschau.abrechnungStart,
      abrechnungEnde: vorschau.abrechnungEnde,
      gesamtkosten: vorschau.gesamtkosten,
      mieterAnteil: vorschau.mieterAnteil,
      geleisteteVZ: vorschau.geleisteteVZ,
      saldo: vorschau.saldo,
      notizen,
      positionen: {
        create: vorschau.positionen.map((p) => ({
          kategorie: p.kategorie,
          bezeichnung: p.bezeichnung,
          gesamtkosten: p.gesamtkosten,
          umlageSchluessel: p.umlageSchluessel,
          anteilFaktor: p.anteilFaktor,
          zeitraumFaktor: p.zeitraumFaktor,
          mieterAnteil: p.mieterAnteil,
          grundlageZaehler: p.grundlageZaehler,
          grundlageNenner: p.grundlageNenner,
          grundlageEinheit: p.grundlageEinheit,
          lohnanteilAnteil: p.lohnanteilAnteil ?? null,
        })),
      },
    },
    include: {
      positionen: true,
      mietvertrag: {
        include: {
          mieter: { select: { id: true, anrede: true, vorname: true, nachname: true, firma: true, kommunikation: true } },
          mieteinheit: {
            include: {
              mietobjekt: { include: { eigentuemer: true } },
            },
          },
        },
      },
    },
  });
}

export async function listAbrechnungen(prisma: PrismaClient, filter: { mietvertragID?: number }) {
  return prisma.nebenkostenAbrechnung.findMany({
    where: filter.mietvertragID ? { mietvertragID: filter.mietvertragID } : undefined,
    include: {
      mietvertrag: {
        include: {
          mieter: { select: { vorname: true, nachname: true, firma: true, kommunikation: true } },
          mieteinheit: {
            include: { mietobjekt: { select: { bezeichnung: true } } },
          },
        },
      },
    },
    orderBy: [{ abrechnungsjahr: 'desc' }],
  });
}

export async function getAbrechnung(prisma: PrismaClient, id: number) {
  const a = await prisma.nebenkostenAbrechnung.findUnique({
    where: { id },
    include: {
      positionen: true,
      mietvertrag: {
        include: {
          mieter: { select: { id: true, anrede: true, vorname: true, nachname: true, firma: true, kommunikation: true } },
          mieteinheit: {
            include: {
              mietobjekt: { include: { eigentuemer: true } },
            },
          },
        },
      },
    },
  });
  if (!a) throw notFound('Nebenkostenabrechnung');
  return a;
}

export async function deleteAbrechnung(prisma: PrismaClient, id: number) {
  await getAbrechnung(prisma, id);
  // Entscheidet aufbewahrungspflichtig vs. loeschbar und raeumt die Dateien auf; die DB-Zeilen
  // wuerden sonst per ON DELETE SET NULL nur entkoppelt (nicht geloescht) und die Dateien
  // blieben in jedem Fall auf dem Host liegen
  await loescheDokumenteFuerBezug(prisma, 'abrechnungID', id);
  return prisma.nebenkostenAbrechnung.delete({ where: { id } });
}

export async function markiereVersendet(prisma: PrismaClient, id: number) {
  return prisma.nebenkostenAbrechnung.update({
    where: { id },
    data: { versandtAm: new Date(), versandFehlerlog: null, versandVersuche: { increment: 1 } },
  });
}

export async function protokolliereVersandFehler(prisma: PrismaClient, id: number, fehler: string) {
  return prisma.nebenkostenAbrechnung.update({
    where: { id },
    data: { versandFehlerlog: fehler, versandVersuche: { increment: 1 } },
  });
}

export async function setzeNachzahlungBeglichen(prisma: PrismaClient, id: number, beglichen: boolean) {
  await getAbrechnung(prisma, id);
  return prisma.nebenkostenAbrechnung.update({
    where: { id },
    data: { nachzahlungBeglichenAm: beglichen ? new Date() : null },
  });
}
