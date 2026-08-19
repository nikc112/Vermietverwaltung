import { PrismaClient } from '@prisma/client';
import {
  bewertePosten, erstelleMahnVorschlag, mietFaelligkeit,
  MahnStufeTyp, OffenerPosten, PostenInput, MahnVorschlag, MahnEinstellungen, STUFEN,
} from '../utils/mahnstufen';
import { ladeMahnEinstellungen } from './einstellung.service';
import { toNumber } from '../utils/currency';
import { formatDatum } from '../utils/date';
import { notFound } from '../utils/errors';

export interface KontaktForderungen {
  kontakt: { id: number; vorname: string; nachname: string; firma: string | null };
  posten: OffenerPosten[];
  summe: number;
  letzteMahnungAm: string | null;
  vorschlag: MahnVorschlag;
}

function hoechsteStufe(stufen: MahnStufeTyp[]): MahnStufeTyp | null {
  if (stufen.length === 0) return null;
  return stufen.reduce((max, s) => (STUFEN.indexOf(s) > STUFEN.indexOf(max) ? s : max));
}

/** Sammelt alle offenen Posten eines Kontakts und bewertet sie. */
async function ladePostenFuerKontakt(prisma: PrismaClient, kontaktID: number): Promise<PostenInput[]> {
  const [zahlungen, abrechnungen, gebuehrMahnungen] = await Promise.all([
    prisma.mietzahlung.findMany({
      where: { eingegangen: false, mietvertrag: { mieterID: kontaktID } },
      include: {
        mietvertrag: { select: { zahlungstag: true } },
        mahnungPositionen: { select: { mahnung: { select: { stufe: true } } } },
      },
    }),
    prisma.nebenkostenAbrechnung.findMany({
      where: {
        saldo: { gt: 0 },
        versandtAm: { not: null },
        nachzahlungBeglichenAm: null,
        mietvertrag: { mieterID: kontaktID },
      },
      include: {
        mahnungPositionen: { select: { mahnung: { select: { stufe: true } } } },
      },
    }),
    prisma.mahnung.findMany({
      where: { kontaktID, gebuehr: { gt: 0 }, gebuehrBeglichenAm: null },
      include: {
        folgePositionen: { select: { mahnung: { select: { stufe: true } } } },
      },
    }),
  ]);

  const posten: PostenInput[] = [];

  for (const z of zahlungen) {
    const rest = toNumber(z.sollBetrag) - (z.istBetrag ? toNumber(z.istBetrag) : 0);
    if (rest <= 0) continue;
    posten.push({
      typ: 'MIETE',
      referenzID: z.id,
      beschreibung: `Miete ${String(z.monat).padStart(2, '0')}/${z.jahr}`,
      offenerBetrag: rest,
      faelligAm: mietFaelligkeit(z.jahr, z.monat, z.mietvertrag.zahlungstag),
      bisherigeStufe: hoechsteStufe(z.mahnungPositionen.map((p) => p.mahnung.stufe)),
    });
  }

  for (const a of abrechnungen) {
    posten.push({
      typ: 'NEBENKOSTEN',
      referenzID: a.id,
      beschreibung: `Nebenkostenabrechnung ${a.abrechnungsjahr}`,
      offenerBetrag: toNumber(a.saldo),
      faelligAm: a.versandtAm,
      bisherigeStufe: hoechsteStufe(a.mahnungPositionen.map((p) => p.mahnung.stufe)),
    });
  }

  for (const m of gebuehrMahnungen) {
    posten.push({
      typ: 'MAHNGEBUEHR',
      referenzID: m.id,
      beschreibung: `Mahngebühr vom ${formatDatum(m.datum)}`,
      offenerBetrag: toNumber(m.gebuehr),
      faelligAm: m.datum,
      bisherigeStufe: hoechsteStufe(m.folgePositionen.map((p) => p.mahnung.stufe)),
    });
  }

  return posten;
}

export async function sammleKontaktForderungen(
  prisma: PrismaClient,
  kontaktID: number,
  heute: Date = new Date(),
  einstellungen?: MahnEinstellungen,
): Promise<KontaktForderungen> {
  const kontakt = await prisma.kontakt.findUnique({
    where: { id: kontaktID },
    select: { id: true, vorname: true, nachname: true, firma: true, aktiv: true, anonymisiertAm: true },
  });
  if (!kontakt) throw notFound('Kontakt');

  const e = einstellungen ?? await ladeMahnEinstellungen(prisma);
  const inputs = await ladePostenFuerKontakt(prisma, kontaktID);
  const bewertet = bewertePosten(inputs, heute, e);

  const letzte = await prisma.mahnung.findFirst({
    where: { kontaktID },
    orderBy: { datum: 'desc' },
    select: { datum: true },
  });

  const gesperrt = !kontakt.aktiv || kontakt.anonymisiertAm !== null;
  const vorschlag = erstelleMahnVorschlag(bewertet, letzte?.datum ?? null, gesperrt, heute, e);

  return {
    kontakt: { id: kontakt.id, vorname: kontakt.vorname, nachname: kontakt.nachname, firma: kontakt.firma },
    posten: bewertet,
    summe: Math.round(bewertet.reduce((s, p) => s + p.offenerBetrag, 0) * 100) / 100,
    letzteMahnungAm: letzte?.datum.toISOString() ?? null,
    vorschlag,
  };
}

export async function listeAlleForderungen(prisma: PrismaClient, heute: Date = new Date()): Promise<KontaktForderungen[]> {
  // Kontakte mit potenziellen Posten ermitteln (drei schmale Abfragen statt N+1 über alle Kontakte)
  const [mietKontakte, nkaKontakte, gebuehrKontakte, einstellungen] = await Promise.all([
    prisma.mietzahlung.findMany({
      where: { eingegangen: false },
      select: { mietvertrag: { select: { mieterID: true } } },
    }),
    prisma.nebenkostenAbrechnung.findMany({
      where: { saldo: { gt: 0 }, versandtAm: { not: null }, nachzahlungBeglichenAm: null },
      select: { mietvertrag: { select: { mieterID: true } } },
    }),
    prisma.mahnung.findMany({
      where: { gebuehr: { gt: 0 }, gebuehrBeglichenAm: null },
      select: { kontaktID: true },
    }),
    ladeMahnEinstellungen(prisma),
  ]);

  const ids = new Set<number>([
    ...mietKontakte.map((z) => z.mietvertrag.mieterID),
    ...nkaKontakte.map((a) => a.mietvertrag.mieterID),
    ...gebuehrKontakte.map((m) => m.kontaktID),
  ]);

  const ergebnisse = await Promise.all(
    [...ids].map((id) => sammleKontaktForderungen(prisma, id, heute, einstellungen)),
  );
  return ergebnisse
    .filter((e) => e.posten.length > 0)
    .sort((a, b) => b.summe - a.summe);
}
