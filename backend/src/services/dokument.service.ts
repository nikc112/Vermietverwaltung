import { PrismaClient, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import {
  DokumentKategorieTyp, KATEGORIE_META, MAX_GROESSE_BYTES,
  darfKategorieSehen, dsgvoAktion, endungFuerMime, erzeugeSpeicherName, pruefeMagicBytes,
  sichtbareKategorien,
} from '../utils/dokument';
import { ListDokumenteQuery, UpdateDokumentInput, UploadMetaInput } from '../schemas/dokument.schema';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { kontaktName } from '../utils/kontakt';
import { TREFFER_ENDE, TREFFER_START, TextstellenTeil, zerlegeTextstelle } from '../utils/textextraktion';

// Bewusst select statt include: include liefert ALLE Skalarfelder, seit
// Migration 010 also auch textInhalt mit bis zu 500.000 Zeichen je Zeile. Bei
// jedem Aufruf von GET /dokumente kaeme der gesamte erkannte Text des Bestands
// ueber die Leitung, nur um in toAnzeige verworfen zu werden -- unsichtbar in
// der Antwort und mit dem Bestand wachsend. Prisma kennt kein "alles ausser
// einem Feld", die Felder muessen also einzeln stehen.
// Steht nach einer Bereinigung in textHinweis und ist zugleich das Merkmal,
// an dem textErneutVersuchen erkennt, dass dieses Dokument nicht noch einmal
// erschlossen werden darf.
export const DSGVO_TEXT_ENTFERNT = 'Inhalt wurde auf ein Löschersuchen hin entfernt';

const DOKUMENT_SELECT = {
  id: true,
  dateiname: true,
  speicherName: true,
  mimeTyp: true,
  groesseBytes: true,
  sha256: true,
  titel: true,
  beschreibung: true,
  kategorie: true,
  schlagworte: true,
  hochgeladenAm: true,
  aktualisiertAm: true,
  textStatus: true,
  textQuelle: true,
  textVersuche: true,
  textHinweis: true,
  textAktualisiertAm: true,
  hochgeladenVonID: true,
  mietvertragID: true,
  mietobjektID: true,
  mieteinheitID: true,
  kontaktID: true,
  kostenID: true,
  abrechnungID: true,
  hochgeladenVon: { select: { name: true } },
  mietvertrag: { select: { vertragsnummer: true } },
  mietobjekt: { select: { bezeichnung: true } },
  mieteinheit: { select: { bezeichnung: true } },
  kontakt: { select: { vorname: true, nachname: true, firma: true } },
  kosten: { select: { bezeichnung: true } },
  abrechnung: { select: { abrechnungsjahr: true } },
} as const;

type DokumentMitBezug = Prisma.DokumentGetPayload<{ select: typeof DOKUMENT_SELECT }>;

export interface DokumentAnzeige {
  id: number;
  dateiname: string;
  mimeTyp: string;
  groesseBytes: number;
  titel: string;
  beschreibung: string | null;
  kategorie: DokumentKategorieTyp;
  kategorieLabel: string;
  sensibel: boolean;
  schlagworte: string[];
  hochgeladenAm: string;
  hochgeladenVon: string | null;
  mietvertragID: number | null;
  mietobjektID: number | null;
  mieteinheitID: number | null;
  kontaktID: number | null;
  kostenID: number | null;
  abrechnungID: number | null;
  bezug: string | null;
  textStatus: string;
  textQuelle: string | null;
  textHinweis: string | null;
  textstelle: TextstellenTeil[] | null;
}

// speicherName, sha256 und textInhalt verlassen den Server nie (Muster hatPdf)
function toAnzeige(d: DokumentMitBezug, textstelle: string | null = null): DokumentAnzeige {
  const kategorie = d.kategorie as DokumentKategorieTyp;
  const meta = KATEGORIE_META[kategorie];
  return {
    id: d.id,
    dateiname: d.dateiname,
    mimeTyp: d.mimeTyp,
    groesseBytes: d.groesseBytes,
    titel: d.titel,
    beschreibung: d.beschreibung,
    kategorie,
    kategorieLabel: meta.label,
    sensibel: meta.sensibel,
    schlagworte: d.schlagworte,
    hochgeladenAm: d.hochgeladenAm.toISOString(),
    hochgeladenVon: d.hochgeladenVon?.name ?? null,
    mietvertragID: d.mietvertragID,
    mietobjektID: d.mietobjektID,
    mieteinheitID: d.mieteinheitID,
    kontaktID: d.kontaktID,
    kostenID: d.kostenID,
    abrechnungID: d.abrechnungID,
    bezug:
      d.mietvertrag?.vertragsnummer ??
      d.mietobjekt?.bezeichnung ??
      d.mieteinheit?.bezeichnung ??
      (d.kontakt ? kontaktName(d.kontakt) : null) ??
      d.kosten?.bezeichnung ??
      (d.abrechnung ? `NKA ${d.abrechnung.abrechnungsjahr}` : null),
    textStatus: d.textStatus,
    textQuelle: d.textQuelle,
    textHinweis: d.textHinweis,
    textstelle: zerlegeTextstelle(textstelle),
  };
}

function absoluterPfad(speicherName: string): string {
  return path.join(config.DOKUMENT_STORAGE_PATH, speicherName);
}

// Loescht eine Datei verbindlich: ENOENT (Datei bereits weg) gilt als Erfolg, jeder andere
// Fehler wird mit einer sprechenden Meldung weitergereicht. So kann der Aufrufer VOR dem
// zugehoerigen DB-Schritt abbrechen, statt faelschlich Erfolg zu melden, waehrend eine
// personenbezogene Datei (z.B. eine Ausweiskopie) noch auf dem Host liegt.
async function loescheDateiVerbindlich(pfad: string): Promise<void> {
  try {
    await fs.promises.unlink(pfad);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error(`Datei konnte nicht gelöscht werden (${pfad}): ${(err as Error).message}`);
  }
}

// Wie in frist.service.ts: gesetzte Bezugs-IDs vor dem Schreiben pruefen, statt Prisma bei einer
// unbekannten ID mit P2003 (Fremdschluessel-Verletzung) in den generischen 500er-Zweig laufen zu
// lassen. null bedeutet "Bezug wird geloescht" und wird bewusst nicht geprueft.
async function pruefeBezuege(
  prisma: PrismaClient,
  data: {
    mietvertragID?: number | null; mietobjektID?: number | null; mieteinheitID?: number | null;
    kontaktID?: number | null; kostenID?: number | null; abrechnungID?: number | null;
  },
) {
  if (data.mietvertragID != null) {
    const v = await prisma.mietvertrag.findUnique({ where: { id: data.mietvertragID }, select: { id: true } });
    if (!v) throw notFound('Mietvertrag');
  }
  if (data.mietobjektID != null) {
    const o = await prisma.mietobjekt.findUnique({ where: { id: data.mietobjektID }, select: { id: true } });
    if (!o) throw notFound('Mietobjekt');
  }
  if (data.mieteinheitID != null) {
    const e = await prisma.mieteinheit.findUnique({ where: { id: data.mieteinheitID }, select: { id: true } });
    if (!e) throw notFound('Mieteinheit');
  }
  if (data.kontaktID != null) {
    const k = await prisma.kontakt.findUnique({ where: { id: data.kontaktID }, select: { id: true } });
    if (!k) throw notFound('Kontakt');
  }
  if (data.kostenID != null) {
    const ko = await prisma.kosten.findUnique({ where: { id: data.kostenID }, select: { id: true } });
    if (!ko) throw notFound('Kosten');
  }
  if (data.abrechnungID != null) {
    const a = await prisma.nebenkostenAbrechnung.findUnique({ where: { id: data.abrechnungID }, select: { id: true } });
    if (!a) throw notFound('Nebenkostenabrechnung');
  }
}

interface VolltextTreffer {
  id: number;
  rang: number;
  textstelle: string | null;
}

// Liefert bewusst NUR IDs, Rang und Textstelle. Die Dokumente selbst laedt der
// Prisma-Pfad unten — mit dem Rollenfilter fuer sensible Kategorien. Gaebe es zwei
// Wege, auf denen Dokumente die Anwendung verlassen, muessten beide den Filter
// korrekt anwenden; so kann ein Fehler hier keine Ausweiskopie preisgeben.
async function volltextTreffer(prisma: PrismaClient, suche: string): Promise<VolltextTreffer[]> {
  const optionen = `StartSel=${TREFFER_START},StopSel=${TREFFER_ENDE},MaxWords=28,MinWords=12,MaxFragments=1`;
  return prisma.$queryRaw<VolltextTreffer[]>`
    SELECT d.id,
           ts_rank_cd(d."suchIndex", frage)::float8 AS rang,
           CASE WHEN d."textInhalt" IS NOT NULL AND d."textInhalt" <> ''
                THEN ts_headline('german', d."textInhalt", frage, ${optionen})
                ELSE NULL
           END AS textstelle
      FROM "dokumente" d, websearch_to_tsquery('german', ${suche}) AS frage
     WHERE d."suchIndex" @@ frage
     ORDER BY rang DESC
     LIMIT 500`;
}

export async function listeDokumente(
  prisma: PrismaClient,
  query: ListDokumenteQuery,
  rolle: string,
): Promise<DokumentAnzeige[]> {
  const where: Prisma.DokumentWhereInput = {
    kategorie: { in: sichtbareKategorien(rolle) as unknown as Prisma.EnumDokumentKategorieFilter['in'] },
  };
  if (query.kategorie) {
    if (!darfKategorieSehen(query.kategorie as DokumentKategorieTyp, rolle)) throw forbidden();
    where.kategorie = query.kategorie;
  }
  if (query.schlagwort) where.schlagworte = { has: query.schlagwort };
  let treffer = new Map<number, VolltextTreffer>();
  if (query.suche) {
    const suche = query.suche;
    const gefunden = await volltextTreffer(prisma, suche);
    treffer = new Map(gefunden.map((t) => [t.id, t]));
    where.OR = [
      { titel: { contains: suche, mode: 'insensitive' } },
      { dateiname: { contains: suche, mode: 'insensitive' } },
      { beschreibung: { contains: suche, mode: 'insensitive' } },
      { schlagworte: { has: suche } },
      ...(gefunden.length > 0 ? [{ id: { in: gefunden.map((t) => t.id) } }] : []),
    ];
  }
  for (const feld of ['mietvertragID', 'mietobjektID', 'mieteinheitID', 'kontaktID', 'kostenID', 'abrechnungID'] as const) {
    if (query[feld] !== undefined) where[feld] = query[feld];
  }
  if (query.ohneBezug) {
    where.AND = [
      { mietvertragID: null }, { mietobjektID: null }, { mieteinheitID: null },
      { kontaktID: null }, { kostenID: null }, { abrechnungID: null },
    ];
  }

  const dokumente = await prisma.dokument.findMany({
    where,
    select: DOKUMENT_SELECT,
    orderBy: { hochgeladenAm: 'desc' },
  });

  if (treffer.size === 0) return dokumente.map((d) => toAnzeige(d));

  // Inhaltstreffer nach Rang; Dokumente, die nur ueber die Metadaten gefunden
  // wurden, haben keinen Rang und behalten die Reihenfolge nach Datum dahinter.
  return dokumente
    .map((d) => ({ dokument: d, rang: treffer.get(d.id)?.rang ?? 0 }))
    .sort((a, b) => b.rang - a.rang)
    .map(({ dokument }) => toAnzeige(dokument, treffer.get(dokument.id)?.textstelle ?? null));
}

export async function getDokumentIntern(prisma: PrismaClient, id: number, rolle: string) {
  const dokument = await prisma.dokument.findUnique({ where: { id }, select: DOKUMENT_SELECT });
  if (!dokument) throw notFound('Dokument');
  // Bewusst 404 statt 403: sonst liesse sich durch Durchprobieren von IDs herausfinden, dass an
  // dieser ID ein sensibles Dokument (Ausweis, SCHUFA, ...) liegt, obwohl die Rolle es gar nicht
  // sehen darf. "Nicht gefunden" und "existiert, aber nicht sichtbar" muessen ununterscheidbar sein.
  if (!darfKategorieSehen(dokument.kategorie as DokumentKategorieTyp, rolle)) throw notFound('Dokument');
  return dokument;
}

export async function getDokument(prisma: PrismaClient, id: number, rolle: string): Promise<DokumentAnzeige> {
  return toAnzeige(await getDokumentIntern(prisma, id, rolle));
}

export async function listeSchlagworte(prisma: PrismaClient, rolle: string): Promise<string[]> {
  const zeilen = await prisma.dokument.findMany({
    where: { kategorie: { in: sichtbareKategorien(rolle) as unknown as Prisma.EnumDokumentKategorieFilter['in'] } },
    select: { schlagworte: true },
  });
  return [...new Set(zeilen.flatMap((z) => z.schlagworte))].sort();
}

export async function speichereDokument(
  prisma: PrismaClient,
  datei: { dateiname: string; mimeTyp: string; inhalt: Buffer; abgeschnitten: boolean },
  meta: UploadMetaInput,
  benutzerID: number,
): Promise<{ dokument: DokumentAnzeige; dublette: number | null }> {
  if (datei.abgeschnitten || datei.inhalt.length > MAX_GROESSE_BYTES) {
    throw badRequest('Datei ist größer als 25 MB');
  }
  if (datei.inhalt.length === 0) {
    throw badRequest('Datei ist leer');
  }
  if (endungFuerMime(datei.mimeTyp) === null) {
    throw badRequest(`Dateityp ${datei.mimeTyp} ist nicht erlaubt`);
  }
  if (!pruefeMagicBytes(datei.mimeTyp, datei.inhalt.subarray(0, 12))) {
    throw badRequest('Dateiinhalt passt nicht zum angegebenen Dateityp');
  }

  const sha256 = createHash('sha256').update(datei.inhalt).digest('hex');
  const vorhandene = await prisma.dokument.findFirst({ where: { sha256 }, select: { id: true } });

  // Auf 255 Zeichen begrenzt, damit ein ueberlanger Original-Dateiname nicht unkontrolliert
  // in DB-Spalte und Content-Disposition-Header landet
  const dateiname = datei.dateiname.slice(0, 255);

  const speicherName = erzeugeSpeicherName(datei.mimeTyp, new Date(), randomUUID());
  const ziel = absoluterPfad(speicherName);
  await fs.promises.mkdir(path.dirname(ziel), { recursive: true });
  await fs.promises.writeFile(ziel, datei.inhalt);

  try {
    // Erst hier pruefen (nicht vor dem Schreiben): die Datei liegt zu diesem Zeitpunkt bereits
    // auf der Platte und wird im catch-Zweig zuverlaessig wieder entfernt, egal ob die Pruefung
    // selbst oder das anschliessende create() fehlschlaegt.
    await pruefeBezuege(prisma, meta);
    const dokument = await prisma.dokument.create({
      data: {
        dateiname,
        speicherName,
        mimeTyp: datei.mimeTyp,
        groesseBytes: datei.inhalt.length,
        sha256,
        titel: meta.titel?.trim() || dateiname.replace(/\.[^.]+$/, ''),
        beschreibung: meta.beschreibung || null,
        kategorie: meta.kategorie,
        schlagworte: meta.schlagworte,
        hochgeladenVonID: benutzerID,
        mietvertragID: meta.mietvertragID ?? null,
        mietobjektID: meta.mietobjektID ?? null,
        mieteinheitID: meta.mieteinheitID ?? null,
        kontaktID: meta.kontaktID ?? null,
        kostenID: meta.kostenID ?? null,
        abrechnungID: meta.abrechnungID ?? null,
      },
      select: DOKUMENT_SELECT,
    });
    return { dokument: toAnzeige(dokument), dublette: vorhandene?.id ?? null };
  } catch (err) {
    // Bezugspruefung oder Datenbankzeile fehlgeschlagen — Datei nicht verwaist zuruecklassen.
    // Das Aufraeum-unlink wird bewusst separat abgesichert: schlaegt es fehl, darf das den
    // eigentlichen Fehler (z.B. notFound aus pruefeBezuege) nicht verdecken.
    try {
      await fs.promises.unlink(ziel);
    } catch {
      // Datei war evtl. schon weg oder nicht loeschbar — fuer die Fehlerbehandlung irrelevant
    }
    throw err;
  }
}

export async function updateDokument(
  prisma: PrismaClient,
  id: number,
  data: UpdateDokumentInput,
  rolle: string,
): Promise<DokumentAnzeige> {
  await getDokumentIntern(prisma, id, rolle);
  await pruefeBezuege(prisma, data);
  const dokument = await prisma.dokument.update({
    where: { id },
    data: { ...data },
    select: DOKUMENT_SELECT,
  });
  return toAnzeige(dokument);
}

export async function deleteDokument(prisma: PrismaClient, id: number, rolle: string) {
  const dokument = await getDokumentIntern(prisma, id, rolle);
  // Erst die Datei loeschen, dann die DB-Zeile: schlaegt das Datei-Loeschen fehl (ausser
  // ENOENT), bleibt die DB-Zeile erhalten. So gibt es keine falsche Erfolgsmeldung, waehrend
  // eine personenbezogene Datei (z.B. eine Ausweiskopie) noch auf dem Host liegt, und der
  // Vorgang laesst sich gefahrlos wiederholen.
  await loescheDateiVerbindlich(absoluterPfad(dokument.speicherName));
  await prisma.dokument.delete({ where: { id } });
  return { message: 'Dokument gelöscht' };
}

export function leseStream(speicherName: string) {
  const datei = absoluterPfad(speicherName);
  if (!fs.existsSync(datei)) throw notFound('Datei');
  return fs.createReadStream(datei);
}

// DSGVO (Teilprojekt 1): aufbewahrungspflichtige Dokumente behalten, uebrige loeschen. Bezieht
// neben Dokumenten direkt am Kontakt auch die an dessen Mietvertraegen haengenden Dokumente ein:
// Ausweiskopie, Selbstauskunft und SCHUFA werden im Vermietungsprozess oft mit mietvertragID statt
// kontaktID hochgeladen (siehe Vertrags-Detailseite), ueberleben beendete Vertraege sonst aber
// unveraendert. Ein Mietvertrag hat genau ein mieterID-Feld (kein Mehrfachbezug moeglich) — die
// Zuordnung ist daher eindeutig und reisst keine Dokumente eines anderen Kontakts mit.
export async function bereinigeKontaktDokumente(prisma: PrismaClient, kontaktID: number) {
  const vertraege = await prisma.mietvertrag.findMany({ where: { mieterID: kontaktID }, select: { id: true } });
  const vertragIDs = vertraege.map((v) => v.id);

  const dokumente = await prisma.dokument.findMany({
    where: {
      OR: [
        { kontaktID },
        ...(vertragIDs.length > 0 ? [{ mietvertragID: { in: vertragIDs } }] : []),
      ],
    },
    // Nur die drei Felder, die hier gebraucht werden. Ohne select kaeme auch
    // textInhalt mit, und zwar fuer jedes Dokument des Kontakts.
    select: { id: true, kategorie: true, speicherName: true },
  });
  const zuLoeschen = dokumente.filter((d) => dsgvoAktion(d.kategorie as DokumentKategorieTyp) === 'LOESCHEN');

  // Erst alle Dateien loeschen, dann erst die DB-Zeilen: schlaegt eine Dateiloeschung fehl
  // (ausser ENOENT), bricht die Bereinigung ab, BEVOR die DB-Zeilen verschwinden. Die
  // Kontaktloeschung darf nicht als erfolgreich gelten, waehrend personenbezogene Dateien noch
  // auf dem Host liegen. Ein zweiter Versuch ist dank ENOENT-Toleranz gefahrlos.
  for (const d of zuLoeschen) {
    await loescheDateiVerbindlich(absoluterPfad(d.speicherName));
  }
  if (zuLoeschen.length > 0) {
    await prisma.dokument.deleteMany({ where: { id: { in: zuLoeschen.map((d) => d.id) } } });
  }
  // Bei den verbleibenden (aufbewahrungspflichtigen) Dokumenten nur die Kontakt-Zuordnung loesen;
  // mietvertragID bleibt bestehen, denn das Dokument gehoert weiterhin zum Vertrag
  await prisma.dokument.updateMany({ where: { kontaktID }, data: { kontaktID: null } });

  // Der erkannte Text wird ebenfalls entfernt. Ohne diesen Schritt bliebe ein
  // entkoppeltes Dokument ueber den Namen des Mieters auffindbar -- die
  // Volltextsuche haette einen Weg wiedereroeffnet, den das Loesen der
  // Zuordnung gerade schliessen soll. Betroffen sind BEIDE Gruppen: die vom
  // Kontakt geloesten Dokumente und die an seinen Vertraegen haengenden, denn
  // in beiden steht sein Name im Text. Die Datei bleibt, sie ist
  // aufbewahrungspflichtig; nur der Suchindex gibt sie nicht mehr preis.
  const zuEntkoppeln = dokumente.filter((d) => !zuLoeschen.includes(d));
  if (zuEntkoppeln.length > 0) {
    await prisma.dokument.updateMany({
      where: { id: { in: zuEntkoppeln.map((d) => d.id) } },
      data: {
        textInhalt: null,
        textQuelle: null,
        textStatus: 'UEBERSPRUNGEN',
        textHinweis: DSGVO_TEXT_ENTFERNT,
        textAktualisiertAm: new Date(),
      },
    });
  }
  return { geloescht: zuLoeschen.length, entkoppelt: zuEntkoppeln.length };
}

// Wird von Kosten- und Abrechnungs-Service unmittelbar vor deren hartem delete aufgerufen. Die
// Fremdschluessel kostenID/abrechnungID stehen auf ON DELETE SET NULL (nicht CASCADE), damit
// Postgres die Dokumentzeilen beim Loeschen der Kosten-/Abrechnungszeile nicht selbst entfernt —
// das wuerde kategorieblind auch aufbewahrungspflichtige Dokumente (RECHNUNG, ABRECHNUNG, §147 AO)
// vernichten und die auf ADMIN/VOLLZUGRIFF beschraenkte DELETE-/dokumente/:id-Rolle aushebeln,
// denn DELETE /kosten/:id ist fuer KOSTENBUCHER offen und DELETE /nebenkosten/abrechnungen/:id
// sogar fuer jede angemeldete Rolle. Diese Funktion trifft die Kategorie-Entscheidung stattdessen
// explizit wie bereinigeKontaktDokumente: aufbewahrungspflichtige Dokumente behalten Datei und
// Zeile und werden nur vom Bezugsfeld geloest, alle uebrigen werden samt Datei geloescht.
// Bewusst eng auf genau die zwei Bezugsfelder begrenzt, die einen tatsaechlichen Hard-Delete-
// Endpunkt haben: Mietvertrag hat gar keinen Loeschendpunkt, Mietobjekt/Mieteinheit haben nur
// einen Soft-Delete (setzt aktiv=false statt zu loeschen, siehe mietobjekt.service.ts /
// mieteinheit.service.ts) — in keinem der drei Faelle kann dort ueberhaupt etwas verwaisen. Keine
// generische Feldnamen-Reflexion, nur die zwei erlaubten Werte.
export async function loescheDokumenteFuerBezug(
  prisma: PrismaClient,
  feld: 'kostenID' | 'abrechnungID',
  id: number,
): Promise<void> {
  const where: Prisma.DokumentWhereInput = feld === 'kostenID' ? { kostenID: id } : { abrechnungID: id };
  const dokumente = await prisma.dokument.findMany({ where, select: { id: true, speicherName: true, kategorie: true } });
  if (dokumente.length === 0) return;

  const zuLoeschen = dokumente.filter((d) => dsgvoAktion(d.kategorie as DokumentKategorieTyp) === 'LOESCHEN');

  // Wie bei deleteDokument/bereinigeKontaktDokumente: erst Dateien, dann DB-Zeilen
  for (const d of zuLoeschen) {
    await loescheDateiVerbindlich(absoluterPfad(d.speicherName));
  }
  if (zuLoeschen.length > 0) {
    await prisma.dokument.deleteMany({ where: { id: { in: zuLoeschen.map((d) => d.id) } } });
  }
  // Verbleibende (aufbewahrungspflichtige) Dokumente nur vom Bezugsfeld loesen, Zeile und Datei
  // bleiben erhalten
  if (feld === 'kostenID') {
    await prisma.dokument.updateMany({ where, data: { kostenID: null } });
  } else {
    await prisma.dokument.updateMany({ where, data: { abrechnungID: null } });
  }
}

// Ohne diese Moeglichkeit bliebe ein Dokument nach einem behobenen Problem
// dauerhaft unauffindbar — der Zaehler haette die Grenze ja bereits erreicht.
export async function textErneutVersuchen(prisma: PrismaClient, id: number, rolle: string) {
  const dokument = await getDokumentIntern(prisma, id, rolle);
  // Ein Dokument, dessen Text auf ein Loeschersuchen hin entfernt wurde, wird
  // nicht erneut erschlossen. Sonst stellte ein einzelner Klick genau die
  // Auffindbarkeit ueber den Namen wieder her, welche die Bereinigung beendet
  // hat -- und niemand haette einen Grund, das zu bemerken.
  if (dokument.textHinweis === DSGVO_TEXT_ENTFERNT) {
    throw badRequest('Der Inhalt dieses Dokuments wurde auf ein Löschersuchen hin entfernt und wird nicht erneut erschlossen');
  }
  await prisma.dokument.update({
    where: { id },
    data: { textStatus: 'WARTEND', textVersuche: 0, textHinweis: null, textAktualisiertAm: new Date() },
  });
  return { message: 'Texterkennung erneut vorgemerkt' };
}
