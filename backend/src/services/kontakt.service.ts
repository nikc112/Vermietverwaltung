import { PrismaClient, Prisma, KontaktRollenTyp } from '@prisma/client';
import { CreateKontaktInput, UpdateKontaktInput } from '../schemas/kontakt.schema';
import { notFound, conflict, AppError } from '../utils/errors';
import { ermittleLoeschfall, LoeschfallErgebnis } from '../utils/aufbewahrung';
import { bereinigeKontaktDokumente } from './dokument.service';

const detailInclude = {
  rollen: true,
  kommunikation: { orderBy: { id: 'asc' } },
  ansprechpartner: { orderBy: { id: 'asc' } },
  mietvertraege: {
    include: {
      mieteinheit: {
        include: { mietobjekt: { select: { bezeichnung: true } } },
      },
    },
    orderBy: { beginn: 'desc' },
  },
  mietobjekte: { include: { _count: { select: { mieteinheiten: true } } } },
  _count: { select: { mietvertraege: true, mietobjekte: true } },
} satisfies Prisma.KontaktInclude;

/** Höchstens eine Standard-EMAIL; falls EMAILs existieren aber keine Standard ist, wird die erste Standard. */
function normalisiereKommunikation(kommunikation: CreateKontaktInput['kommunikation']) {
  const emails = kommunikation.filter((k) => k.typ === 'EMAIL');
  if (emails.length > 0 && !emails.some((k) => k.istStandard)) {
    emails[0].istStandard = true;
  }
  return kommunikation;
}

export async function listKontakte(
  prisma: PrismaClient,
  filter: { suche?: string; rolle?: KontaktRollenTyp; inaktive?: boolean },
) {
  return prisma.kontakt.findMany({
    where: {
      ...(filter.inaktive ? {} : { aktiv: true }),
      ...(filter.rolle ? { rollen: { some: { rolle: filter.rolle } } } : {}),
      ...(filter.suche
        ? {
            OR: [
              { vorname: { contains: filter.suche, mode: 'insensitive' } },
              { nachname: { contains: filter.suche, mode: 'insensitive' } },
              { firma: { contains: filter.suche, mode: 'insensitive' } },
              { ort: { contains: filter.suche, mode: 'insensitive' } },
              { kommunikation: { some: { wert: { contains: filter.suche, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    include: {
      rollen: true,
      kommunikation: true,
      _count: { select: { mietvertraege: true, mietobjekte: true } },
    },
    orderBy: [{ nachname: 'asc' }, { firma: 'asc' }, { vorname: 'asc' }],
  });
}

export async function getKontakt(prisma: PrismaClient, id: number) {
  const k = await prisma.kontakt.findUnique({ where: { id }, include: detailInclude });
  if (!k) throw notFound('Kontakt');
  return k;
}

export async function createKontakt(prisma: PrismaClient, data: CreateKontaktInput) {
  const kommunikation = normalisiereKommunikation(data.kommunikation);
  return prisma.kontakt.create({
    data: {
      anrede: data.anrede,
      vorname: data.vorname,
      nachname: data.nachname,
      firma: data.firma,
      strasse: data.strasse,
      hausnummer: data.hausnummer,
      plz: data.plz,
      ort: data.ort,
      geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : undefined,
      iban: data.iban,
      steuernummer: data.steuernummer,
      notizen: data.notizen,
      rollen: { create: [...new Set(data.rollen)].map((rolle) => ({ rolle })) },
      kommunikation: { create: kommunikation },
      ansprechpartner: { create: data.ansprechpartner },
    },
    include: detailInclude,
  });
}

export async function updateKontakt(prisma: PrismaClient, id: number, data: UpdateKontaktInput) {
  const bestehend = await prisma.kontakt.findUnique({ where: { id } });
  if (!bestehend) throw notFound('Kontakt');
  if (bestehend.anonymisiertAm) {
    throw conflict('Anonymisierte Kontakte können nicht bearbeitet werden');
  }

  const kommunikation = normalisiereKommunikation(data.kommunikation);
  await prisma.$transaction([
    prisma.kontaktRolle.deleteMany({ where: { kontaktID: id } }),
    prisma.kontaktKommunikation.deleteMany({ where: { kontaktID: id } }),
    prisma.ansprechpartner.deleteMany({ where: { kontaktID: id } }),
    prisma.kontakt.update({
      where: { id },
      data: {
        anrede: data.anrede,
        vorname: data.vorname,
        nachname: data.nachname,
        firma: data.firma ?? null,
        strasse: data.strasse ?? null,
        hausnummer: data.hausnummer ?? null,
        plz: data.plz ?? null,
        ort: data.ort ?? null,
        geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : null,
        iban: data.iban ?? null,
        steuernummer: data.steuernummer ?? null,
        notizen: data.notizen ?? null,
        rollen: { create: [...new Set(data.rollen)].map((rolle) => ({ rolle })) },
        kommunikation: { create: kommunikation },
        ansprechpartner: { create: data.ansprechpartner },
      },
    }),
  ]);
  return getKontakt(prisma, id);
}

export type LoeschpruefungErgebnis = LoeschfallErgebnis & {
  vertragAnzahl: number;
  objektAnzahl: number;
};

export async function loeschpruefung(
  prisma: PrismaClient,
  id: number,
): Promise<LoeschpruefungErgebnis> {
  const kontakt = await prisma.kontakt.findUnique({
    where: { id },
    include: {
      mietobjekte: { select: { id: true } },
      mietvertraege: {
        select: {
          ende: true,
          nebenkostenabrechnungen: {
            select: { abrechnungsjahr: true },
            orderBy: { abrechnungsjahr: 'desc' },
            take: 1,
          },
          mietzahlungen: {
            select: { monat: true, jahr: true },
            orderBy: [{ jahr: 'desc' }, { monat: 'desc' }],
            take: 1,
          },
        },
      },
      mahnungen: { select: { id: true } },
    },
  });
  if (!kontakt) throw notFound('Kontakt');

  const abrechnungsjahre = kontakt.mietvertraege
    .flatMap((v) => v.nebenkostenabrechnungen)
    .map((a) => a.abrechnungsjahr);
  const zahlungen = kontakt.mietvertraege
    .flatMap((v) => v.mietzahlungen)
    .sort((a, b) => b.jahr - a.jahr || b.monat - a.monat);

  const ergebnis = ermittleLoeschfall({
    objektAnzahl: kontakt.mietobjekte.length,
    vertraege: kontakt.mietvertraege.map((v) => ({ ende: v.ende })),
    letztesAbrechnungsjahr: abrechnungsjahre.length > 0 ? Math.max(...abrechnungsjahre) : null,
    letzteZahlung: zahlungen[0] ?? null,
    mahnungAnzahl: kontakt.mahnungen.length,
    heute: new Date(),
  });

  return {
    ...ergebnis,
    vertragAnzahl: kontakt.mietvertraege.length,
    objektAnzahl: kontakt.mietobjekte.length,
  };
}

export async function deleteKontakt(prisma: PrismaClient, id: number) {
  const ergebnis = await loeschpruefung(prisma, id);

  if (ergebnis.fall === 'LOESCHEN') {
    // Dokumente zuerst: aufbewahrungspflichtige entkoppeln, uebrige samt Datei loeschen
    await bereinigeKontaktDokumente(prisma, id);
    // Kommunikation, Ansprechpartner und Rollen fallen per ON DELETE CASCADE mit
    await prisma.kontakt.delete({ where: { id } });
    return ergebnis;
  }

  if (ergebnis.fall === 'ANONYMISIEREN') {
    await bereinigeKontaktDokumente(prisma, id);
    await prisma.$transaction([
      prisma.kontaktKommunikation.deleteMany({ where: { kontaktID: id } }),
      prisma.ansprechpartner.deleteMany({ where: { kontaktID: id } }),
      prisma.kontakt.update({
        where: { id },
        data: {
          vorname: '',
          nachname: `Gelöschter Kontakt #${id}`,
          firma: null,
          strasse: null,
          hausnummer: null,
          plz: null,
          ort: null,
          geburtsdatum: null,
          iban: null,
          steuernummer: null,
          notizen: null,
          aktiv: false,
          anonymisiertAm: new Date(),
        },
      }),
    ]);
    return ergebnis;
  }

  // GESPERRT: nichts verändern, Ergebnis zurückgeben
  return ergebnis;
}

export async function sammleDsgvoDaten(prisma: PrismaClient, id: number) {
  const kontakt = await prisma.kontakt.findUnique({
    where: { id },
    include: {
      rollen: true,
      kommunikation: true,
      ansprechpartner: true,
      mietvertraege: {
        include: {
          mieteinheit: { include: { mietobjekt: { select: { bezeichnung: true } } } },
          mietzahlungen: { orderBy: [{ jahr: 'asc' }, { monat: 'asc' }] },
          nebenkostenabrechnungen: {
            select: { abrechnungsjahr: true, gesamtkosten: true, mieterAnteil: true, saldo: true, erstelltAm: true },
            orderBy: { abrechnungsjahr: 'asc' },
          },
        },
      },
      mietobjekte: { select: { bezeichnung: true, strasse: true, hausnummer: true, plz: true, ort: true } },
      mahnungen: {
        select: { datum: true, stufe: true, gesamtbetrag: true, gebuehr: true, versandtAm: true },
        orderBy: { datum: 'asc' },
      },
    },
  });
  if (!kontakt) throw notFound('Kontakt');
  if (kontakt.anonymisiertAm) {
    throw new AppError(410, 'Kontakt ist anonymisiert — keine personenbezogenen Daten mehr vorhanden');
  }
  return { exportiertAm: new Date().toISOString(), kontakt };
}

export type DsgvoDaten = Awaited<ReturnType<typeof sammleDsgvoDaten>>;
