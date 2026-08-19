export type DokumentKategorieTyp =
  | 'MIETVERTRAG' | 'NACHTRAG' | 'KUENDIGUNG' | 'UEBERGABEPROTOKOLL' | 'RECHNUNG'
  | 'ABRECHNUNG' | 'GRUNDRISS' | 'ENERGIEAUSWEIS' | 'VERSICHERUNG' | 'FOTO'
  | 'AUSWEIS' | 'SCHUFA' | 'SELBSTAUSKUNFT' | 'SCHRIFTWECHSEL' | 'SONSTIGES';

export interface KategorieMeta {
  label: string;
  sensibel: boolean;               // nur fuer alle ausser KOSTENBUCHER sichtbar
  aufbewahrungspflichtig: boolean; // §147 AO: bleibt bei DSGVO-Loeschung erhalten
}

export const KATEGORIE_META: Record<DokumentKategorieTyp, KategorieMeta> = {
  MIETVERTRAG:        { label: 'Mietvertrag',       sensibel: false, aufbewahrungspflichtig: true },
  NACHTRAG:           { label: 'Nachtrag',          sensibel: false, aufbewahrungspflichtig: true },
  KUENDIGUNG:         { label: 'Kündigung',         sensibel: false, aufbewahrungspflichtig: true },
  UEBERGABEPROTOKOLL: { label: 'Übergabeprotokoll', sensibel: false, aufbewahrungspflichtig: true },
  RECHNUNG:           { label: 'Rechnung',          sensibel: false, aufbewahrungspflichtig: true },
  ABRECHNUNG:         { label: 'Abrechnung',        sensibel: false, aufbewahrungspflichtig: true },
  GRUNDRISS:          { label: 'Grundriss',         sensibel: false, aufbewahrungspflichtig: false },
  ENERGIEAUSWEIS:     { label: 'Energieausweis',    sensibel: false, aufbewahrungspflichtig: false },
  VERSICHERUNG:       { label: 'Versicherung',      sensibel: false, aufbewahrungspflichtig: false },
  FOTO:               { label: 'Foto',              sensibel: false, aufbewahrungspflichtig: false },
  SONSTIGES:          { label: 'Sonstiges',         sensibel: false, aufbewahrungspflichtig: false },
  AUSWEIS:            { label: 'Ausweis',           sensibel: true,  aufbewahrungspflichtig: false },
  SCHUFA:             { label: 'SCHUFA-Auskunft',   sensibel: true,  aufbewahrungspflichtig: false },
  SELBSTAUSKUNFT:     { label: 'Selbstauskunft',    sensibel: true,  aufbewahrungspflichtig: false },
  SCHRIFTWECHSEL:     { label: 'Schriftwechsel',    sensibel: true,  aufbewahrungspflichtig: false },
};

export const MAX_GROESSE_BYTES = 25 * 1024 * 1024;

export const ERLAUBTE_TYPEN: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

// Rollen, die auch sensible Kategorien sehen duerfen: alle ausser KOSTENBUCHER.
// Bewusst als Positivliste — eine unbekannte Rolle sieht damit nichts Sensibles.
const SENSIBEL_ROLLEN = ['ADMIN', 'VOLLZUGRIFF', 'VERTRAGSVERWALTER', 'VERWALTER'];

export function endungFuerMime(mime: string): string | null {
  return ERLAUBTE_TYPEN[mime] ?? null;
}

// Der vom Browser gemeldete Typ ist manipulierbar — Signatur der ersten Bytes pruefen
export function pruefeMagicBytes(mime: string, kopf: Buffer): boolean {
  // Nicht erlaubte Typen fallen hier durch, statt in den signaturlosen Zweig zu rutschen
  if (!(mime in ERLAUBTE_TYPEN)) return false;
  switch (mime) {
    case 'application/pdf':
      return kopf.length >= 4 && kopf.subarray(0, 4).toString('latin1') === '%PDF';
    case 'image/jpeg':
      return kopf.length >= 3 && kopf[0] === 0xff && kopf[1] === 0xd8 && kopf[2] === 0xff;
    case 'image/png':
      return (
        kopf.length >= 8 &&
        kopf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case 'image/webp':
      return (
        kopf.length >= 12 &&
        kopf.subarray(0, 4).toString('latin1') === 'RIFF' &&
        kopf.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    // DOCX/XLSX sind OOXML — technisch ZIP-Container mit der ueblichen ZIP-Signatur
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return (
        kopf.length >= 4 &&
        kopf[0] === 0x50 && kopf[1] === 0x4b && kopf[2] === 0x03 && kopf[3] === 0x04
      );
    default:
      return true; // txt hat keine verlaessliche Signatur
  }
}

export function erzeugeSpeicherName(mime: string, jetzt: Date, uuid: string): string {
  const jahr = jetzt.getUTCFullYear();
  const monat = String(jetzt.getUTCMonth() + 1).padStart(2, '0');
  return `${jahr}/${monat}/${uuid}.${endungFuerMime(mime) ?? 'bin'}`;
}

export function darfKategorieSehen(kategorie: DokumentKategorieTyp, rolle: string): boolean {
  return !KATEGORIE_META[kategorie].sensibel || SENSIBEL_ROLLEN.includes(rolle);
}

export function sichtbareKategorien(rolle: string): DokumentKategorieTyp[] {
  return (Object.keys(KATEGORIE_META) as DokumentKategorieTyp[]).filter((k) =>
    darfKategorieSehen(k, rolle),
  );
}

export function dsgvoAktion(kategorie: DokumentKategorieTyp): 'LOESCHEN' | 'ENTKOPPELN' {
  return KATEGORIE_META[kategorie].aufbewahrungspflichtig ? 'ENTKOPPELN' : 'LOESCHEN';
}
