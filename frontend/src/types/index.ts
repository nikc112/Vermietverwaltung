export type Rolle = 'ADMIN' | 'VOLLZUGRIFF' | 'VERTRAGSVERWALTER' | 'KOSTENBUCHER' | 'VERWALTER';
export type Anrede = 'HERR' | 'FRAU' | 'DIVERS' | 'FIRMA';
export type MahnStufe = 'ZAHLUNGSERINNERUNG' | 'MAHNUNG_1' | 'MAHNUNG_2';
export type ForderungsPostenTyp = 'MIETE' | 'NEBENKOSTEN' | 'MAHNGEBUEHR';
export type MietobjektTyp = 'MEHRFAMILIENHAUS' | 'EINFAMILIENHAUS' | 'GEWERBEGEBAEUDE' | 'GEMISCHT' | 'SONSTIGES';
export type HeizungsTyp = 'ZENTRALHEIZUNG' | 'ETAGENHEIZUNG' | 'FERNWAERME' | 'ELEKTRO' | 'SONSTIGE';
export type MieteinheitTyp = 'WOHNUNG' | 'GEWERBE' | 'GARAGE' | 'STELLPLATZ' | 'SONSTIGES';
export type VertragStatus = 'AKTIV' | 'BEENDET' | 'GEKUENDIGT';
export type Zahlungsart = 'UEBERWEISUNG' | 'LASTSCHRIFT' | 'BAR' | 'SONSTIGE';
export type UmlageSchluessel = 'FLAECHE' | 'PERSONEN' | 'EINHEIT' | 'VERBRAUCH';
export type UmlageArt = 'ALLE_EINHEITEN' | 'SPEZIFISCHE_EINHEITEN';
export type KostenKategorie =
  | 'GRUNDSTEUER' | 'KALTWASSER' | 'ABWASSER' | 'HEIZUNG' | 'WARMWASSER'
  | 'AUFZUG' | 'STRASSENREINIGUNG' | 'MUELLABFUHR' | 'GEBAEUDEREINIGUNG'
  | 'GARTENPFLEGE' | 'ALLGEMEINSTROM' | 'SCHORNSTEINREINIGUNG'
  | 'GEBAEUDEVERSICHERUNG' | 'HAFTPFLICHTVERSICHERUNG' | 'HAUSMEISTER'
  | 'KABELFERNSEHEN' | 'VERWALTUNGSKOSTEN' | 'INSTANDHALTUNG'
  | 'INSTANDSETZUNGSRUECKLAGE' | 'BANKGEBUEHREN' | 'RECHTSKOSTEN'
  | 'SONSTIGE_UMLAGEFAEHIG' | 'SONSTIGE_NICHT_UMLAGEFAEHIG';
export type KontaktRollenTyp = 'MIETER' | 'EIGENTUEMER' | 'DIENSTLEISTER' | 'VERSORGER' | 'BEHOERDE' | 'SONSTIGE';
export type KommunikationsTyp = 'EMAIL' | 'TELEFON' | 'MOBIL' | 'FAX' | 'SONSTIGE';
export interface KontaktKommunikation { id?: number; typ: KommunikationsTyp; wert: string; bezeichnung?: string; istStandard: boolean; }
export interface Ansprechpartner { id?: number; name: string; funktion?: string; email?: string; telefon?: string; }
export interface Kontakt { id: number; anrede: Anrede; vorname: string; nachname: string; firma?: string; strasse?: string; hausnummer?: string; plz?: string; ort?: string; geburtsdatum?: string; iban?: string; steuernummer?: string; notizen?: string; aktiv: boolean; anonymisiertAm?: string | null; erstelltAm: string; rollen: { rolle: KontaktRollenTyp }[]; kommunikation: KontaktKommunikation[]; ansprechpartner: Ansprechpartner[]; _count?: { mietvertraege: number; mietobjekte: number }; mietvertraege?: Mietvertrag[]; mietobjekte?: Mietobjekt[]; }
export interface KontaktPayload { anrede: Anrede; vorname: string; nachname: string; firma?: string; strasse?: string; hausnummer?: string; plz?: string; ort?: string; geburtsdatum?: string; iban?: string; steuernummer?: string; notizen?: string; rollen: KontaktRollenTyp[]; kommunikation: Omit<KontaktKommunikation, 'id'>[]; ansprechpartner: Omit<Ansprechpartner, 'id'>[]; }
export interface Loeschpruefung { fall: 'LOESCHEN' | 'ANONYMISIEREN' | 'GESPERRT'; grund?: string; sperrBis?: string | null; vertragAnzahl: number; objektAnzahl: number; }

export interface Benutzer {
  id: number;
  email: string;
  name: string;
  rolle: Rolle;
  aktiv: boolean;
}

export interface Eigentuemer {
  id: number;
  anrede: Anrede;
  vorname: string;
  nachname: string;
  firma?: string;
  email?: string;
  telefon?: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  iban?: string;
  steuernummer?: string;
  notizen?: string;
  aktiv: boolean;
  kommunikation?: KontaktKommunikation[];
  anonymisiertAm?: string | null;
  erstelltAm: string;
  _count?: { mietobjekte: number };
  mietobjekte?: Mietobjekt[];
}

export interface Mietobjekt {
  id: number;
  bezeichnung: string;
  typ: MietobjektTyp;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  baujahr?: number;
  heizungstyp?: HeizungsTyp;
  notizen?: string;
  aktiv: boolean;
  eigentuemerID: number;
  eigentuemer?: { id: number; vorname: string; nachname: string };
  mieteinheiten?: Mieteinheit[];
  _count?: { mieteinheiten: number };
}

export interface Mieteinheit {
  id: number;
  bezeichnung: string;
  typ: MieteinheitTyp;
  flaeche: number;
  zimmeranzahl?: number;
  etage?: string;
  notizen?: string;
  aktiv: boolean;
  mietobjektID: number;
  mietobjekt?: { id: number; bezeichnung: string };
  mietvertraege?: Mietvertrag[];
}

export interface Mieter {
  id: number;
  anrede: Anrede;
  vorname: string;
  nachname: string;
  firma?: string;
  email?: string;
  telefon?: string;
  geburtsdatum?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  notizen?: string;
  kommunikation?: KontaktKommunikation[];
  anonymisiertAm?: string | null;
  _count?: { mietvertraege: number };
  mietvertraege?: Mietvertrag[];
}

export interface Mietvertrag {
  id: number;
  vertragsnummer: string;
  beginn: string;
  ende?: string;
  kuendigungsfristMonate: number;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
  kaution: number;
  kautionBezahlt: boolean;
  zahlungstag: number;
  personenAnzahl: number;
  status: VertragStatus;
  notizen?: string;
  mieteinheitID: number;
  mieterID: number;
  mieteinheit?: Mieteinheit & { mietobjekt?: Mietobjekt };
  mieter?: Pick<Mieter, 'id' | 'vorname' | 'nachname' | 'email'>;
  mietzahlungen?: Mietzahlung[];
}

export interface Mietzahlung {
  id: number;
  monat: number;
  jahr: number;
  sollBetrag: number;
  istBetrag?: number;
  eingegangen: boolean;
  eingangsdat?: string;
  zahlungsart: Zahlungsart;
  notizen?: string;
  mietvertragID: number;
  mietvertrag?: Partial<Mietvertrag>;
}

export interface Kosten {
  id: number;
  bezeichnung: string;
  kategorie: KostenKategorie;
  betrag: number;
  datum: string;
  jahr: number;
  umlagefaehig: boolean;
  umlageSchluessel: UmlageSchluessel;
  umlageSchluessel2?: UmlageSchluessel;
  umlageGewicht1?: number;
  lohnanteil?: number;
  umlageArt: UmlageArt;
  verbrauchswert?: number;
  verbrauchEinheit?: string;
  belegNummer?: string;
  anbieter?: string;
  notizen?: string;
  mietobjektID: number;
  mietobjekt?: { bezeichnung: string };
}

export interface KategorieMeta {
  key: KostenKategorie;
  label: string;
  umlagefaehig: boolean;
  schluessel: UmlageSchluessel;
}

export interface NebenkostenPosition {
  id: number;
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

export interface NebenkostenAbrechnung {
  id: number;
  abrechnungsjahr: number;
  abrechnungStart?: string;
  abrechnungEnde?: string;
  gesamtkosten: number;
  mieterAnteil: number;
  geleisteteVZ: number;
  saldo: number;
  hatPdf?: boolean;
  nachzahlungBeglichenAm?: string | null;
  versandtAm?: string;
  versandFehlerlog?: string;
  versandVersuche?: number;
  notizen?: string;
  mietvertragID: number;
  mietvertrag?: Partial<Mietvertrag>;
  positionen?: NebenkostenPosition[];
}

export interface Einstellung {
  schluessel: string;
  wert: string;
}

export interface DashboardKennzahlen {
  mietobjekte: number;
  mieteinheiten: { gesamt: number; vermietet: number; leerstand: number };
  aktiveVertraege: number;
  monatlicheSollMiete: number;
  ausstehend: { anzahl: number; summe: number };
  teilzahlungen: { anzahl: number; fehlbetrag: number };
  fristen: { rot: number; gelb: number };
}

export interface OffenerPosten {
  typ: ForderungsPostenTyp;
  referenzID: number;
  beschreibung: string;
  offenerBetrag: number;
  faelligAm?: string | null;
  bisherigeStufe: MahnStufe | null;
  ueberfaellig: boolean;
  naechsteStufe: MahnStufe | null;
}

export type MahnVorschlag =
  | { mahnreif: false; grund: 'KEINE_UEBERFAELLIGEN' | 'WARTEFRIST' | 'KONTAKT_GESPERRT' | 'STUFEN_DECKEL'; wartefristBis?: string }
  | { mahnreif: true; stufe: MahnStufe; gebuehr: number; gesamtbetrag: number; zahlungsfrist: string; positionen: OffenerPosten[] };

export interface KontaktForderungen {
  kontakt: { id: number; vorname: string; nachname: string; firma?: string | null };
  posten: OffenerPosten[];
  summe: number;
  letzteMahnungAm?: string | null;
  vorschlag: MahnVorschlag;
}

export interface Mahnung {
  id: number;
  kontaktID: number;
  stufe: MahnStufe;
  datum: string;
  zahlungsfrist: string;
  gebuehr: number | string;
  gebuehrBeglichenAm?: string | null;
  gesamtbetrag: number | string;
  hatPdf: boolean;
  versandtAm?: string | null;
  versandFehlerlog?: string | null;
  versandVersuche: number;
  kontakt?: { id: number; vorname: string; nachname: string; firma?: string | null };
  positionen?: { id: number; typ: ForderungsPostenTyp; beschreibung: string; offenerBetrag: number | string }[];
}

export type FristTyp = 'MANUELL' | 'NKA_ABRECHNUNG' | 'VERTRAGSENDE';
export type FristStatus = 'OFFEN' | 'ERLEDIGT' | 'VERWORFEN';
export type FristAmpel = 'ROT' | 'GELB' | 'GRUEN';

export interface Frist {
  id: number | null; // null = Auto-Frist ohne Override
  typ: FristTyp;
  quelle: 'AUTO' | 'MANUELL';
  titel: string;
  faelligAm: string;
  notizen?: string | null;
  status: FristStatus;
  ampel: FristAmpel;
  mietvertragID?: number | null;
  referenzJahr?: number | null;
  mietobjektID?: number | null;
  kontaktID?: number | null;
  bezug?: string | null;
  aeltereOffen: number;
}

export interface FristPayload {
  titel: string;
  faelligAm: string;
  notizen?: string;
  mietvertragID?: number;
  mietobjektID?: number;
  kontaktID?: number;
}

export type DokumentKategorie =
  | 'MIETVERTRAG' | 'NACHTRAG' | 'KUENDIGUNG' | 'UEBERGABEPROTOKOLL' | 'RECHNUNG'
  | 'ABRECHNUNG' | 'GRUNDRISS' | 'ENERGIEAUSWEIS' | 'VERSICHERUNG' | 'FOTO'
  | 'AUSWEIS' | 'SCHUFA' | 'SELBSTAUSKUNFT' | 'SCHRIFTWECHSEL' | 'SONSTIGES';

export interface Dokument {
  id: number;
  dateiname: string;
  mimeTyp: string;
  groesseBytes: number;
  titel: string;
  beschreibung?: string | null;
  kategorie: DokumentKategorie;
  kategorieLabel: string;
  sensibel: boolean;
  schlagworte: string[];
  hochgeladenAm: string;
  hochgeladenVon?: string | null;
  mietvertragID?: number | null;
  mietobjektID?: number | null;
  mieteinheitID?: number | null;
  kontaktID?: number | null;
  kostenID?: number | null;
  abrechnungID?: number | null;
  bezug?: string | null;
  textStatus: TextStatus;
  textQuelle: 'TEXTEBENE' | 'OCR' | null;
  textHinweis: string | null;
  textstelle: TextstellenTeil[] | null;
}

export type TextStatus = 'WARTEND' | 'IN_ARBEIT' | 'FERTIG' | 'FEHLGESCHLAGEN' | 'UEBERSPRUNGEN';

// Serverseitig zerlegt — das Frontend bekommt nie eine markierte Zeichenkette und
// setzt damit auch nie Dokumentinhalt als HTML ein.
export interface TextstellenTeil {
  text: string;
  treffer: boolean;
}

// Nutzlast von PUT /dokumente/:id — bewusst enger als Dokument, denn das Backend
// nimmt nur diese Felder an. null bei einem Bezug entkoppelt, undefined laesst ihn stehen.
export interface DokumentUpdate {
  titel?: string;
  beschreibung?: string | null;
  kategorie?: DokumentKategorie;
  schlagworte?: string[];
  mietvertragID?: number | null;
  mietobjektID?: number | null;
  mieteinheitID?: number | null;
  kontaktID?: number | null;
  kostenID?: number | null;
  abrechnungID?: number | null;
}

export interface DokumentFilter {
  suche?: string;
  kategorie?: DokumentKategorie;
  schlagwort?: string;
  ohneBezug?: boolean;
  mietvertragID?: number;
  mietobjektID?: number;
  mieteinheitID?: number;
  kontaktID?: number;
  kostenID?: number;
  abrechnungID?: number;
}
