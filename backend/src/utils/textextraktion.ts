// Reine Logik der Texterkennung: keine Datenbank, kein Dateizugriff, keine
// Kindprozesse. Muster von utils/dokument.ts — dadurch ohne installierte
// Programme testbar.

export type TextStatusTyp = 'WARTEND' | 'IN_ARBEIT' | 'FERTIG' | 'FEHLGESCHLAGEN' | 'UEBERSPRUNGEN';
export type TextQuelleTyp = 'TEXTEBENE' | 'OCR';
export type Verfahren = 'TEXT' | 'DOCX' | 'XLSX' | 'PDF' | 'BILD';

export const MAX_SEITEN = 30;                       // Seiten je Dokument fuer die Bilderkennung
export const MAX_ZEICHEN = 500_000;                 // Postgres lehnt tsvector ueber 1 MB ab
export const MAX_VERSUCHE = 3;
export const RENDER_DPI = 200;
export const HAENGT_NACH_MS = 15 * 60 * 1000;
export const LEERE_WARTESCHLANGE_MS = 30 * 1000;
// Abstand zwischen zwei Versuchen am selben Dokument. Ohne ihn liefen die drei
// erlaubten Versuche in Millisekunden ab und waeren funktional einer -- eine
// voruebergehende Stoerung ueberlebte keine Wiederholung, die sofort folgt.
export const WIEDERHOLUNG_NACH_MS = 2 * 60 * 1000;
export const ZEITLIMIT_SEITE_MS = 60 * 1000;
export const ZEITLIMIT_DOKUMENT_MS = 10 * 60 * 1000;

// Neutrale Markierungen statt HTML: der Inhalt eines Dokuments ist nicht
// vertrauenswuerdig und darf nie als Auszeichnung interpretiert werden.
export const TREFFER_START = '[[[';
export const TREFFER_ENDE = ']]]';

const VERFAHREN: Record<string, Verfahren> = {
  'text/plain': 'TEXT',
  'application/pdf': 'PDF',
  'image/jpeg': 'BILD',
  'image/png': 'BILD',
  'image/webp': 'BILD',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
};

export function verfahrenFuerMime(mime: string): Verfahren | null {
  return VERFAHREN[mime] ?? null;
}

// Ein PDF kann eine Textebene haben, die nur aus Seitenzahlen besteht. Erst genug
// Zeichen insgesamt UND je Seite sprechen dafuer, dass der Inhalt wirklich drin steht.
export function textebeneBrauchbar(text: string, seiten: number): boolean {
  const zeichen = text.replace(/\s/g, '').length;
  if (zeichen < 100) return false;
  if (seiten <= 0) return true;
  return zeichen / seiten >= 20;
}

export function normalisiereText(roh: string): string {
  return roh
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n')
    .map((zeile) => zeile.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function kuerzeText(text: string): { text: string; gekuerzt: boolean } {
  if (text.length <= MAX_ZEICHEN) return { text, gekuerzt: false };
  const geschnitten = text.slice(0, MAX_ZEICHEN);
  // slice trennt nach UTF-16-Code-Einheiten. Faellt der Schnitt zwischen die
  // beiden Haelften eines Ersatzzeichenpaares (Emoji, seltene Schriftzeichen),
  // bleibt eine verwaiste erste Haelfte stehen -- das ist keine gueltige
  // Zeichenkette mehr, und beim Schreiben nach Postgres wird sie stillschweigend
  // durch U+FFFD ersetzt. Eine Code-Einheit weniger ist der guenstigere Preis.
  const letzte = geschnitten.charCodeAt(geschnitten.length - 1);
  const halbiert = letzte >= 0xd800 && letzte <= 0xdbff;
  return { text: halbiert ? geschnitten.slice(0, -1) : geschnitten, gekuerzt: true };
}

// DOCX und XLSX sind ZIP-Behaelter mit XML. Fuer die Suche genuegt der Wortlaut,
// deshalb reicht das Entfernen der Auszeichnung — kein XML-Parser noetig.
export function entferneMarkup(xml: string): string {
  const mitTrennern = xml.replace(/<\/(w:p|w:tr|si|row)>/g, ' ');
  const ohneTags = mitTrennern.replace(/<[^>]*>/g, '');
  // &amp; zuletzt, sonst wuerde '&amp;lt;' faelschlich doppelt entschluesselt
  const entschluesselt = ohneTags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return normalisiereText(entschluesselt);
}

export function statusNachFehler(versucheBisher: number): TextStatusTyp {
  return versucheBisher >= MAX_VERSUCHE ? 'FEHLGESCHLAGEN' : 'WARTEND';
}

// Ohne diese Pruefung bliebe ein Dokument nach einem Container-Neustart dauerhaft
// auf IN_ARBEIT stehen — der Upload hat ja funktioniert, es faellt niemandem auf.
export function istHaengengeblieben(
  status: string,
  aktualisiertAm: Date | null,
  jetzt: Date,
): boolean {
  if (status !== 'IN_ARBEIT') return false;
  if (!aktualisiertAm) return true;
  return jetzt.getTime() - aktualisiertAm.getTime() > HAENGT_NACH_MS;
}

export interface TextstellenTeil {
  text: string;
  treffer: boolean;
}

export function zerlegeTextstelle(roh: string | null): TextstellenTeil[] | null {
  if (!roh) return null;
  const teile: TextstellenTeil[] = [];
  let rest = roh;
  while (rest.length > 0) {
    const start = rest.indexOf(TREFFER_START);
    if (start === -1) {
      teile.push({ text: rest, treffer: false });
      break;
    }
    if (start > 0) teile.push({ text: rest.slice(0, start), treffer: false });
    const ende = rest.indexOf(TREFFER_ENDE, start);
    if (ende === -1) {
      // Unvollstaendige Markierung: Rest als gewoehnlichen Text ausgeben
      teile.push({ text: rest.slice(start + TREFFER_START.length), treffer: false });
      break;
    }
    teile.push({ text: rest.slice(start + TREFFER_START.length, ende), treffer: true });
    rest = rest.slice(ende + TREFFER_ENDE.length);
  }
  const gefiltert = teile.filter((teil) => teil.text.length > 0);
  // Ohne markierte Fundstelle KEINE Textstelle. ts_headline liefert, wenn der
  // Suchbegriff im uebergebenen Text gar nicht vorkommt, kommentarlos dessen
  // erste Woerter zurueck -- ohne Marken. Ein Treffer, der nur ueber den Titel
  // oder ein Schlagwort zustande kam, zeigte damit den Anfang des erkannten
  // Dokumentinhalts. Die Spec erlaubt die Textstelle ausdruecklich nur bei
  // inhaltlichen Treffern und verbietet das Anzeigen des Volltexts.
  return gefiltert.some((teil) => teil.treffer) ? gefiltert : null;
}
