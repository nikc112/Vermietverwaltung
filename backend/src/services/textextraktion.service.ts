import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../config';
import {
  LEERE_WARTESCHLANGE_MS, MAX_SEITEN, MAX_ZEICHEN, RENDER_DPI, TextQuelleTyp, WIEDERHOLUNG_NACH_MS,
  ZEITLIMIT_DOKUMENT_MS,
  ZEITLIMIT_SEITE_MS, entferneMarkup, istHaengengeblieben, kuerzeText, normalisiereText,
  statusNachFehler, textebeneBrauchbar, verfahrenFuerMime,
} from '../utils/textextraktion';

// Nur die Protokollfunktionen, die hier gebraucht werden — so bleibt der Dienst
// unabhaengig von Fastify und laesst sich spaeter in einen eigenen Worker heben.
interface Logger {
  info: (nachricht: string) => void;
  error: (nachricht: string) => void;
}

interface Auftrag {
  id: number;
  speicherName: string;
  mimeTyp: string;
  textVersuche: number;
}

interface Ergebnis {
  text: string;
  quelle: TextQuelleTyp | null;
  hinweis: string | null;
}

function absoluterPfad(speicherName: string): string {
  return path.join(config.DOKUMENT_STORAGE_PATH, speicherName);
}

// Alle Erkennungsprogramme laufen als eigene Betriebssystemprozesse. Dadurch
// blockieren sie die Ereignisschleife nicht; nice senkt zusaetzlich die Prioritaet,
// damit die Bedienung der Anwendung waehrend einer Erkennung fluessig bleibt.
interface ProgrammFehler extends Error {
  exitCode: number | null;
  abgebrochen: boolean;
  ausgabe: string;
}

function fuehreAus(programm: string, argumente: string[], zeitlimitMs: number): Promise<string> {
  return new Promise((aufloesen, ablehnen) => {
    execFile(
      'nice',
      ['-n', '10', programm, ...argumente],
      { timeout: zeitlimitMs, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (fehler, stdout, stderr) => {
        if (fehler) {
          // fehler.message enthaelt die vollstaendige Befehlszeile und damit den
          // Speicherpfad des Dokuments. Der steht bewusst nicht in DokumentAnzeige
          // (wie speicherName und sha256) -- ueber textHinweis, das dem Frontend
          // ausgeliefert wird, darf er nicht doch nach aussen gelangen.
          //
          // Die erste Zeile der Fehlerausgabe sagt dagegen, WORAN es lag
          // ("Couldn't find trailer dictionary" statt "Abbruch mit Code 1"), und
          // die gehoert in den Hinweis. Der Speicherpfad wird darin gezielt
          // ersetzt -- gezielt, weil wir das Verzeichnis aus der Konfiguration
          // kennen und nicht raten muessen. Die vollstaendige Ausgabe reicht der
          // Aufrufer ins Serverlog weiter.
          const abgebrochen = fehler.killed === true;
          const exitCode = typeof fehler.code === 'number' ? fehler.code : null;
          const ausgabe = (stderr ?? '').toString();
          const ersteZeile = ausgabe.split('\n').map((z) => z.trim()).find(Boolean) ?? '';
          const ohnePfad = ersteZeile.split(config.DOKUMENT_STORAGE_PATH).join('[Datei]');
          const grund = abgebrochen
            ? 'Zeitlimit ueberschritten'
            : ohnePfad || `Abbruch mit Code ${exitCode ?? 'unbekannt'}`;
          const eigener = Object.assign(new Error(`${programm}: ${grund}`), {
            exitCode,
            abgebrochen,
            ausgabe: ausgabe.slice(0, 2000),
          }) as ProgrammFehler;
          return ablehnen(eigener);
        }
        aufloesen(stdout);
      },
    );
  });
}

// Verbleibende Zeit bis zur Dokumentgrenze, hoechstens die uebergebene Spanne.
// Ohne diese Klammer haette jede der bis zu 30 Seiten ihr eigenes Seitenlimit,
// und ein Dokument koennte den einzigen Arbeiter eine halbe Stunde belegen --
// die Spec setzt zehn Minuten je Dokument.
function restzeit(endeUm: number, hoechstens: number): number {
  const rest = endeUm - Date.now();
  if (rest <= 0) throw new Error('Zeitlimit fuer das Dokument ueberschritten');
  return Math.min(hoechstens, rest);
}

async function seitenAnzahl(pfad: string, endeUm: number): Promise<number> {
  const ausgabe = await fuehreAus('pdfinfo', [pfad], restzeit(endeUm, ZEITLIMIT_SEITE_MS));
  const treffer = ausgabe.match(/^Pages:\s+(\d+)/m);
  return treffer ? parseInt(treffer[1], 10) : 0;
}

async function erkenneBild(pfad: string, zeitlimitMs: number): Promise<string> {
  // 'stdout' als Ziel, -l deu fuer das deutsche Sprachmodell
  return fuehreAus('tesseract', [pfad, 'stdout', '-l', 'deu'], zeitlimitMs);
}

async function erkennePdfSeiten(
  pfad: string,
  seiten: number,
  endeUm: number,
): Promise<{ text: string; hinweis: string | null }> {
  const bis = Math.min(seiten || MAX_SEITEN, MAX_SEITEN);
  const ordner = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ocr-'));
  try {
    await fuehreAus(
      'pdftoppm',
      ['-r', String(RENDER_DPI), '-png', '-f', '1', '-l', String(bis), pfad, path.join(ordner, 'seite')],
      restzeit(endeUm, ZEITLIMIT_DOKUMENT_MS),
    );
    const dateien = (await fs.promises.readdir(ordner)).filter((n) => n.endsWith('.png')).sort();
    const teile: string[] = [];
    for (const datei of dateien) {
      // Bricht die Frist mitten in der Erkennung ab, behalten wir die bereits
      // gelesenen Seiten. Ein halb erfasstes Dokument ist auffindbar; ein
      // verworfenes waere es nicht, und der Aufwand waere trotzdem angefallen.
      if (Date.now() >= endeUm) break;
      teile.push(await erkenneBild(path.join(ordner, datei), restzeit(endeUm, ZEITLIMIT_SEITE_MS)));
    }
    const hinweise = [
      seiten > MAX_SEITEN ? `Nur die ersten ${MAX_SEITEN} von ${seiten} Seiten erfasst` : null,
      teile.length < dateien.length
        ? `Zeitlimit erreicht, nur ${teile.length} von ${dateien.length} Seiten erfasst`
        : null,
    ].filter(Boolean).join('; ');
    return { text: teile.join('\n'), hinweis: hinweise.length > 0 ? hinweise : null };
  } finally {
    await fs.promises.rm(ordner, { recursive: true, force: true }).catch(() => {});
  }
}

async function leseTextdatei(pfad: string): Promise<string> {
  const roh = await fs.promises.readFile(pfad);
  // Byte Order Mark zuerst: eine als UTF-16 gespeicherte Textdatei laesst sich
  // ohne Fehler als UTF-8 lesen, weil das Nullbyte dort gueltig ist. Das Ergebnis
  // waere Text mit eingestreuten Nullzeichen -- und die lehnt PostgreSQL beim
  // Schreiben ab, das Dokument liefe dreimal in den Fehler. Windows-Editoren
  // schreiben diese Marke.
  if (roh.length >= 2 && roh[0] === 0xff && roh[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(roh);
  }
  if (roh.length >= 2 && roh[0] === 0xfe && roh[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(roh);
  }
  try {
    // fatal meldet ungueltige Bytefolgen, statt sie stillschweigend durch das
    // Ersatzzeichen zu verdraengen. Die vorherige Fassung suchte dieses Zeichen
    // im Ergebnis und hielt jede Datei, die es legitim enthaelt, faelschlich fuer
    // Latin-1 -- das Neudekodieren zerstoerte dann saemtliche Umlaute, und der
    // Text landete unauffaellig als FERTIG in der Datenbank.
    return new TextDecoder('utf-8', { fatal: true }).decode(roh);
  } catch {
    return roh.toString('latin1');
  }
}

async function gewinneText(pfad: string, mimeTyp: string): Promise<Ergebnis> {
  // Eine Frist fuer das GANZE Dokument, nicht je Kindprozess. Sie wird an jeden
  // Schritt durchgereicht, damit die Summe der Einzelschritte sie nicht sprengt.
  const endeUm = Date.now() + ZEITLIMIT_DOKUMENT_MS;
  const verfahren = verfahrenFuerMime(mimeTyp);
  if (!verfahren) return { text: '', quelle: null, hinweis: `Dateityp ${mimeTyp} wird nicht ausgewertet` };

  if (verfahren === 'TEXT') {
    return { text: await leseTextdatei(pfad), quelle: 'TEXTEBENE', hinweis: null };
  }
  if (verfahren === 'DOCX' || verfahren === 'XLSX') {
    const eintrag = verfahren === 'DOCX' ? 'word/document.xml' : 'xl/sharedStrings.xml';
    try {
      const xml = await fuehreAus('unzip', ['-p', pfad, eintrag], restzeit(endeUm, ZEITLIMIT_SEITE_MS));
      return { text: entferneMarkup(xml), quelle: 'TEXTEBENE', hinweis: null };
    } catch (fehler) {
      // unzip meldet 11, wenn der gesuchte Eintrag im Behaelter fehlt. Eine
      // Tabelle ohne Textzellen enthaelt gar keine sharedStrings.xml — das ist
      // kein Fehler, sondern schlicht kein Text. Jeder ANDERE Code bedeutet
      // einen echten Fehlschlag: ein beschaedigtes Archiv oder ein Zeitlimit.
      // Faengt man den mit ab, sieht eine kaputte DOCX aus wie ein erfolgreich
      // verarbeitetes leeres Dokument, erreicht die Wiederholungsgrenze nie,
      // und niemand erfaehrt vom Schaden.
      if ((fehler as { exitCode?: number | null }).exitCode !== 11) throw fehler;
      return { text: '', quelle: null, hinweis: `${eintrag} nicht vorhanden — kein Text enthalten` };
    }
  }
  if (verfahren === 'BILD') {
    return {
      text: await erkenneBild(pfad, restzeit(endeUm, ZEITLIMIT_SEITE_MS)),
      quelle: 'OCR',
      hinweis: null,
    };
  }

  // PDF: erst die vorhandene Textebene versuchen — das kostet Millisekunden
  const seiten = await seitenAnzahl(pfad, endeUm);
  const ausTextebene = await fuehreAus(
    'pdftotext', ['-layout', pfad, '-'], restzeit(endeUm, ZEITLIMIT_DOKUMENT_MS),
  );
  if (textebeneBrauchbar(ausTextebene, seiten)) {
    return { text: ausTextebene, quelle: 'TEXTEBENE', hinweis: null };
  }
  const erkannt = await erkennePdfSeiten(pfad, seiten, endeUm);
  return { text: erkannt.text, quelle: 'OCR', hinweis: erkannt.hinweis };
}

// Entfernt liegengebliebene Renderordner. Waehrend der Bilderkennung liegen die
// gerenderten Seiten in einem eigenen Ordner unter dem Temporaerverzeichnis; das
// finally in erkennePdfSeiten raeumt ihn wieder ab. Reisst der Prozess vorher ab
// -- Deploy, Speichermangel, harter Neustart --, bleibt er liegen: bis zu 30
// Seiten in 200 dpi, bei einer Ausweiskopie also deren Klarbild. Danach fasst ihn
// nichts mehr an; auch das Loeschen des Dokuments entfernt nur die Originaldatei.
// Setzt voraus, dass nur ein Prozess arbeitet -- bei mehreren wuerde der startende
// die Ordner der laufenden mitnehmen.
export async function raeumeReste(log: Logger): Promise<number> {
  const eintraege = await fs.promises.readdir(os.tmpdir()).catch(() => [] as string[]);
  let entfernt = 0;
  for (const name of eintraege.filter((n) => n.startsWith('ocr-'))) {
    try {
      await fs.promises.rm(path.join(os.tmpdir(), name), { recursive: true, force: true });
      entfernt += 1;
    } catch (fehler) {
      const grund = fehler instanceof Error ? fehler.message : String(fehler);
      log.error(`Renderordner ${name} liess sich nicht entfernen: ${grund}`);
    }
  }
  return entfernt;
}

// Setzt beim Start alles zurueck, was zu lange auf IN_ARBEIT steht — sonst bliebe
// ein Dokument nach einem Abbruch fuer immer in diesem Zustand haengen.
// Die Entscheidung trifft bewusst die getestete Funktion istHaengengeblieben und
// nicht eine zweite Fassung derselben Regel in SQL; bei einem einzigen Arbeiter
// steht ohnehin hoechstens eine Handvoll Zeilen auf IN_ARBEIT.
export async function setzeHaengendeZurueck(prisma: PrismaClient): Promise<number> {
  const laufende = await prisma.dokument.findMany({
    where: { textStatus: 'IN_ARBEIT' },
    select: { id: true, textStatus: true, textVersuche: true, textAktualisiertAm: true },
  });
  const jetzt = new Date();
  const haengend = laufende.filter((d) =>
    istHaengengeblieben(d.textStatus, d.textAktualisiertAm, jetzt),
  );
  if (haengend.length === 0) return 0;

  // Ueber die Wiederholung entscheidet dieselbe getestete Funktion wie im
  // Fehlerfall. Wuerde hier pauschal auf WARTEND zurueckgesetzt, kaeme ein
  // Dokument, das den Prozess jedes Mal mitreisst, unbegrenzt oft zurueck.
  const wieder = haengend.filter((d) => statusNachFehler(d.textVersuche) === 'WARTEND');
  const aufgeben = haengend.filter((d) => statusNachFehler(d.textVersuche) !== 'WARTEND');

  if (wieder.length > 0) {
    await prisma.dokument.updateMany({
      where: { id: { in: wieder.map((d) => d.id) } },
      data: { textStatus: 'WARTEND', textAktualisiertAm: jetzt },
    });
  }
  if (aufgeben.length > 0) {
    await prisma.dokument.updateMany({
      where: { id: { in: aufgeben.map((d) => d.id) } },
      data: {
        textStatus: 'FEHLGESCHLAGEN',
        textHinweis: 'Verarbeitung wurde mehrfach abgebrochen, ohne ein Ergebnis zu liefern',
        textAktualisiertAm: jetzt,
      },
    });
  }
  return haengend.length;
}

// FOR UPDATE SKIP LOCKED ist auch bei einem einzigen Arbeiter das richtige Muster:
// es macht einen zweiten spaeter gefahrlos moeglich, ohne dass zwei dasselbe Dokument greifen.
//
// Ein Dokument, das schon einmal gescheitert ist, wird erst nach
// WIEDERHOLUNG_NACH_MS wieder aufgenommen. Ohne diese Bedingung liefen die drei
// erlaubten Versuche in Millisekunden ab: der Fehlerzweig setzt auf WARTEND
// zurueck, und die Schleife greift dieselbe Zeile sofort erneut. Damit haette
// eine voruebergehende Stoerung dieselbe Wirkung wie eine dauerhafte.
//
// Der Zaehler wird BEIM UEBERNEHMEN erhoeht, nicht erst im Fehlerfall. Sonst zaehlte
// nur, was der Fehlerzweig auch wegschreiben konnte -- ein Dokument, das den Prozess
// mitreisst, kaeme nach jedem Neustart mit unveraendertem Zaehler zurueck und koennte
// das Backend endlos in den Absturz treiben. RETURNING liefert den erhoehten Wert.
async function uebernimmNaechstes(prisma: PrismaClient): Promise<Auftrag | null> {
  const zeilen = await prisma.$queryRaw<Auftrag[]>`
    UPDATE "dokumente"
       SET "textStatus" = 'IN_ARBEIT',
           "textVersuche" = "textVersuche" + 1,
           "textAktualisiertAm" = now()
     WHERE id = (
       SELECT id FROM "dokumente"
        WHERE "textStatus" = 'WARTEND'
          AND ("textVersuche" = 0
               OR "textAktualisiertAm" IS NULL
               OR "textAktualisiertAm" < now() - make_interval(secs => ${WIEDERHOLUNG_NACH_MS / 1000}))
        ORDER BY "textVersuche" ASC, "hochgeladenAm" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING id, "speicherName", "mimeTyp", "textVersuche"`;
  return zeilen[0] ?? null;
}

export async function verarbeiteNaechstes(prisma: PrismaClient, log: Logger): Promise<boolean> {
  const auftrag = await uebernimmNaechstes(prisma);
  if (!auftrag) return false;

  try {
    const ergebnis = await gewinneText(absoluterPfad(auftrag.speicherName), auftrag.mimeTyp);
    // Vor dem Normalisieren grob beschneiden. normalisiereText arbeitet synchron
    // mit regulaeren Ausdruecken, und execFile laesst bis zu 64 MB Ausgabe durch;
    // ueber so viel Text zu laufen haelt die Ereignisschleife spuerbar an, obwohl
    // am Ende ohnehin nur MAX_ZEICHEN uebrig bleiben. Der Faktor vier laesst Raum
    // fuer Leerraum, den erst das Normalisieren entfernt.
    const zuLang = ergebnis.text.length > MAX_ZEICHEN * 4;
    const roh = zuLang ? ergebnis.text.slice(0, MAX_ZEICHEN * 4) : ergebnis.text;
    const normalisiert = normalisiereText(roh);
    const { text, gekuerzt } = kuerzeText(normalisiert);
    const hinweise = [ergebnis.hinweis, gekuerzt || zuLang ? 'Text war zu lang und wurde gekürzt' : null]
      .filter(Boolean)
      .join('; ');

    await prisma.dokument.update({
      where: { id: auftrag.id },
      data: {
        // Kein Text gefunden ist kein Fehler — etwa ein Foto ohne Schrift
        textStatus: text.length > 0 ? 'FERTIG' : 'UEBERSPRUNGEN',
        textInhalt: text.length > 0 ? text : null,
        textQuelle: text.length > 0 ? ergebnis.quelle : null,
        textHinweis: hinweise.length > 0 ? hinweise : null,
        textAktualisiertAm: new Date(),
      },
    });
    log.info(`Dokument ${auftrag.id}: ${text.length} Zeichen über ${ergebnis.quelle ?? 'kein Verfahren'}`);
  } catch (fehler) {
    // textVersuche steht bereits: uebernimmNaechstes hat den Zaehler erhoeht.
    const versuche = auftrag.textVersuche;
    // Der Speichername wird hier entfernt, nicht schon in fuehreAus: dort ist nur
    // das Wurzelverzeichnis bekannt, und die Fehlerausgabe der Programme nennt den
    // vollstaendigen Pfad. Der Teil dahinter -- JJJJ/MM/<uuid>.<endung> -- IST der
    // speicherName, der aus DokumentAnzeige bewusst herausgehalten wird und ueber
    // textHinweis nicht doch in jede Antwort geraten darf.
    const grund = (fehler instanceof Error ? fehler.message : String(fehler))
      .split(auftrag.speicherName).join('[Datei]');
    await prisma.dokument.update({
      where: { id: auftrag.id },
      data: {
        textStatus: statusNachFehler(versuche),
        textHinweis: grund.slice(0, 500),
        textAktualisiertAm: new Date(),
      },
    });
    // Die vollstaendige Fehlerausgabe gehoert ins Log, nicht in textHinweis:
    // dort darf der Speicherpfad nicht auftauchen, hier ist er zur Diagnose gerade
    // das Nuetzliche.
    const ausgabe = (fehler as { ausgabe?: string }).ausgabe;
    const anhang = ausgabe ? ` | Ausgabe: ${ausgabe.replace(/\s+/g, ' ').trim()}` : '';
    log.error(`Dokument ${auftrag.id}: Versuch ${versuche} fehlgeschlagen — ${grund}${anhang}`);
  }
  return true;
}

function warte(ms: number): Promise<void> {
  return new Promise((aufloesen) => setTimeout(aufloesen, ms));
}

export function starteWarteschlange(prisma: PrismaClient, log: Logger): () => void {
  let laeuft = true;
  const schleife = async () => {
    while (laeuft) {
      try {
        const bearbeitet = await verarbeiteNaechstes(prisma, log);
        if (!bearbeitet) {
          // Auch im laufenden Betrieb nachsehen, nicht nur beim Start: schlaegt
          // der abschliessende Schreibvorgang fehl, bliebe das Dokument sonst bis
          // zum naechsten Neustart auf IN_ARBEIT stehen -- fuer den Nutzer
          // dauerhaft "wird verarbeitet". Die leere Warteschlange ist der
          // richtige Moment dafuer, weil gerade nichts anderes ansteht.
          const zurueckgesetzt = await setzeHaengendeZurueck(prisma);
          if (zurueckgesetzt > 0) {
            log.info(`${zurueckgesetzt} haengengebliebene Dokumente erneut vorgemerkt`);
          }
          await warte(LEERE_WARTESCHLANGE_MS);
        }
      } catch (fehler) {
        log.error(`Warteschlange: ${fehler instanceof Error ? fehler.message : String(fehler)}`);
        await warte(LEERE_WARTESCHLANGE_MS);
      }
    }
  };
  void schleife();
  return () => {
    laeuft = false;
  };
}
