import { PrismaClient, Prisma, Mahnung } from '@prisma/client';
import fs from 'fs';
import { sammleKontaktForderungen } from './forderung.service';
import { generiereMahnungPDF } from './pdf.service';
import { kontaktName } from '../utils/kontakt';
import { notFound, conflict, badRequest } from '../utils/errors';

const listInclude = {
  kontakt: { select: { id: true, vorname: true, nachname: true, firma: true, kommunikation: true } },
  positionen: true,
} satisfies Prisma.MahnungInclude;

function ohnePfad<T extends Mahnung>(m: T) {
  const { pdfPfad, ...rest } = m;
  return { ...rest, hatPdf: !!pdfPfad };
}

/** Absender = Eigentümer des Objekts zum ältesten offenen Posten (Spec Abschnitt 3, Regeln). */
async function ermittleAbsender(prisma: PrismaClient, kontaktID: number) {
  const aeltesteZahlung = await prisma.mietzahlung.findFirst({
    where: { eingegangen: false, mietvertrag: { mieterID: kontaktID } },
    orderBy: [{ jahr: 'asc' }, { monat: 'asc' }],
    select: {
      mietvertrag: {
        select: { mieteinheit: { select: { mietobjekt: { select: { eigentuemer: true } } } } },
      },
    },
  });
  let eigentuemer = aeltesteZahlung?.mietvertrag.mieteinheit.mietobjekt.eigentuemer ?? null;

  if (!eigentuemer) {
    const nka = await prisma.nebenkostenAbrechnung.findFirst({
      where: { saldo: { gt: 0 }, versandtAm: { not: null }, nachzahlungBeglichenAm: null, mietvertrag: { mieterID: kontaktID } },
      orderBy: { versandtAm: 'asc' },
      select: {
        mietvertrag: {
          select: { mieteinheit: { select: { mietobjekt: { select: { eigentuemer: true } } } } },
        },
      },
    });
    eigentuemer = nka?.mietvertrag.mieteinheit.mietobjekt.eigentuemer ?? null;
  }
  if (!eigentuemer) {
    // Nur-Gebühren-Fall: Absender aus der letzten Mahnung übernehmen (Miet- oder NKA-Position)
    const letzte = await prisma.mahnung.findFirst({
      where: { kontaktID },
      orderBy: { datum: 'desc' },
      select: {
        positionen: {
          where: { OR: [{ mietzahlungID: { not: null } }, { abrechnungID: { not: null } }] },
          select: {
            mietzahlung: {
              select: { mietvertrag: { select: { mieteinheit: { select: { mietobjekt: { select: { eigentuemer: true } } } } } } },
            },
            abrechnung: {
              select: { mietvertrag: { select: { mieteinheit: { select: { mietobjekt: { select: { eigentuemer: true } } } } } } },
            },
          },
          take: 1,
        },
      },
    });
    const pos = letzte?.positionen[0];
    eigentuemer =
      pos?.mietzahlung?.mietvertrag.mieteinheit.mietobjekt.eigentuemer ??
      pos?.abrechnung?.mietvertrag.mieteinheit.mietobjekt.eigentuemer ??
      null;
  }
  if (!eigentuemer) throw badRequest('Kein Absender ermittelbar (kein Objektbezug vorhanden)');
  return eigentuemer;
}

export async function erzeugeMahnung(prisma: PrismaClient, kontaktID: number) {
  const forderungen = await sammleKontaktForderungen(prisma, kontaktID);
  const v = forderungen.vorschlag;
  if (!v.mahnreif) {
    // Sicherheitsnetz — die Route prüft vorher und liefert das strukturierte 409
    throw conflict('Kontakt ist nicht mahnreif');
  }

  const kontakt = await prisma.kontakt.findUnique({ where: { id: kontaktID } });
  if (!kontakt) throw notFound('Kontakt');
  const absender = await ermittleAbsender(prisma, kontaktID);

  const mahnung = await prisma.mahnung.create({
    data: {
      kontaktID,
      stufe: v.stufe,
      zahlungsfrist: new Date(v.zahlungsfrist),
      gebuehr: v.gebuehr,
      gesamtbetrag: v.gesamtbetrag,
      positionen: {
        create: v.positionen.map((p) => ({
          typ: p.typ,
          beschreibung: p.beschreibung,
          offenerBetrag: p.offenerBetrag,
          mietzahlungID: p.typ === 'MIETE' ? p.referenzID : null,
          abrechnungID: p.typ === 'NEBENKOSTEN' ? p.referenzID : null,
          vorherigeMahnungID: p.typ === 'MAHNGEBUEHR' ? p.referenzID : null,
        })),
      },
    },
    include: listInclude,
  });

  const pdfPfad = await generiereMahnungPDF({
    mahnungID: mahnung.id,
    stufe: v.stufe,
    datum: mahnung.datum,
    zahlungsfrist: mahnung.zahlungsfrist,
    gebuehr: v.gebuehr,
    gesamtbetrag: v.gesamtbetrag,
    positionen: v.positionen.map((p) => ({ beschreibung: p.beschreibung, offenerBetrag: p.offenerBetrag })),
    empfaenger: { name: kontaktName(kontakt), strasse: kontakt.strasse, hausnummer: kontakt.hausnummer, plz: kontakt.plz, ort: kontakt.ort },
    absender: { name: kontaktName(absender), strasse: absender.strasse, hausnummer: absender.hausnummer, plz: absender.plz, ort: absender.ort },
  });

  const aktualisiert = await prisma.mahnung.update({
    where: { id: mahnung.id },
    data: { pdfPfad },
    include: listInclude,
  });
  return ohnePfad(aktualisiert);
}

export async function listMahnungen(prisma: PrismaClient, kontaktID?: number) {
  const mahnungen = await prisma.mahnung.findMany({
    where: kontaktID ? { kontaktID } : undefined,
    include: listInclude,
    orderBy: { datum: 'desc' },
  });
  return mahnungen.map(ohnePfad);
}

export async function getMahnungIntern(prisma: PrismaClient, id: number) {
  const m = await prisma.mahnung.findUnique({ where: { id }, include: listInclude });
  if (!m) throw notFound('Mahnung');
  return m; // intern: mit pdfPfad (für Download/Versand)
}

export async function setzeGebuehrBeglichen(prisma: PrismaClient, id: number, beglichen: boolean) {
  await getMahnungIntern(prisma, id);
  const m = await prisma.mahnung.update({
    where: { id },
    data: { gebuehrBeglichenAm: beglichen ? new Date() : null },
    include: listInclude,
  });
  return ohnePfad(m);
}

export async function deleteMahnung(prisma: PrismaClient, id: number) {
  const m = await getMahnungIntern(prisma, id);
  const juengste = await prisma.mahnung.findFirst({
    where: { kontaktID: m.kontaktID },
    orderBy: { datum: 'desc' },
    select: { id: true },
  });
  if (juengste && juengste.id !== id) {
    throw conflict('Nur die jüngste Mahnung eines Kontakts kann gelöscht werden');
  }
  const referenziert = await prisma.mahnungPosition.count({ where: { vorherigeMahnungID: id } });
  if (referenziert > 0) {
    throw conflict('Mahnung wird von einer späteren Mahnung als Gebührenposten referenziert');
  }
  await prisma.mahnung.delete({ where: { id } }); // Positionen fallen per Cascade
  if (m.pdfPfad && fs.existsSync(m.pdfPfad)) fs.unlinkSync(m.pdfPfad);
  return { message: 'Mahnung gelöscht' };
}

export async function markiereVersendet(prisma: PrismaClient, id: number) {
  return prisma.mahnung.update({
    where: { id },
    data: { versandtAm: new Date(), versandFehlerlog: null, versandVersuche: { increment: 1 } },
  });
}

export async function protokolliereVersandFehler(prisma: PrismaClient, id: number, fehler: string) {
  return prisma.mahnung.update({
    where: { id },
    data: { versandFehlerlog: fehler, versandVersuche: { increment: 1 } },
  });
}
