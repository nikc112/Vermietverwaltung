export type MahnStufeTyp = 'ZAHLUNGSERINNERUNG' | 'MAHNUNG_1' | 'MAHNUNG_2';
export type ForderungsTypTyp = 'MIETE' | 'NEBENKOSTEN' | 'MAHNGEBUEHR';

export const STUFEN: MahnStufeTyp[] = ['ZAHLUNGSERINNERUNG', 'MAHNUNG_1', 'MAHNUNG_2'];
const NKA_FAELLIG_TAGE = 30;

export interface MahnEinstellungen {
  gebuehr: number;
  karenzTage: number;
  wartefristTage: number;
  zahlungsfristTage: number;
}

export interface PostenInput {
  typ: ForderungsTypTyp;
  referenzID: number;
  beschreibung: string;
  offenerBetrag: number;
  faelligAm: Date | null;
  bisherigeStufe: MahnStufeTyp | null;
}

export interface OffenerPosten extends PostenInput {
  ueberfaellig: boolean;
  naechsteStufe: MahnStufeTyp | null;
}

export type MahnVorschlag =
  | { mahnreif: false; grund: 'KEINE_UEBERFAELLIGEN' | 'WARTEFRIST' | 'KONTAKT_GESPERRT' | 'STUFEN_DECKEL'; wartefristBis?: string }
  | { mahnreif: true; stufe: MahnStufeTyp; gebuehr: number; gesamtbetrag: number; zahlungsfrist: string; positionen: OffenerPosten[] };

function plusTage(d: Date, tage: number): Date {
  return new Date(d.getTime() + tage * 24 * 60 * 60 * 1000);
}

export function mietFaelligkeit(jahr: number, monat: number, zahlungstag: number): Date {
  return new Date(Date.UTC(jahr, monat - 1, zahlungstag));
}

function naechsteStufe(bisherige: MahnStufeTyp | null): MahnStufeTyp | null {
  if (bisherige === null) return STUFEN[0];
  const idx = STUFEN.indexOf(bisherige);
  return idx + 1 < STUFEN.length ? STUFEN[idx + 1] : null;
}

function istUeberfaellig(p: PostenInput, heute: Date, e: MahnEinstellungen): boolean {
  if (p.typ === 'MAHNGEBUEHR') return true;
  if (p.faelligAm === null) return false;
  const frist = p.typ === 'MIETE' ? e.karenzTage : NKA_FAELLIG_TAGE;
  return heute.getTime() > plusTage(p.faelligAm, frist).getTime();
}

export function bewertePosten(posten: PostenInput[], heute: Date, e: MahnEinstellungen): OffenerPosten[] {
  return posten.map((p) => ({
    ...p,
    ueberfaellig: istUeberfaellig(p, heute, e),
    naechsteStufe: naechsteStufe(p.bisherigeStufe),
  }));
}

export function erstelleMahnVorschlag(
  posten: OffenerPosten[],
  letzteMahnungAm: Date | null,
  kontaktGesperrt: boolean,
  heute: Date,
  e: MahnEinstellungen,
): MahnVorschlag {
  if (kontaktGesperrt) return { mahnreif: false, grund: 'KONTAKT_GESPERRT' };

  const ueberfaellige = posten.filter((p) => p.ueberfaellig);
  if (ueberfaellige.length === 0) return { mahnreif: false, grund: 'KEINE_UEBERFAELLIGEN' };

  const eskalierbare = ueberfaellige.filter((p) => p.naechsteStufe !== null);
  if (eskalierbare.length === 0) return { mahnreif: false, grund: 'STUFEN_DECKEL' };

  if (letzteMahnungAm !== null) {
    const wartefristBis = plusTage(letzteMahnungAm, e.wartefristTage);
    if (heute.getTime() < wartefristBis.getTime()) {
      return { mahnreif: false, grund: 'WARTEFRIST', wartefristBis: wartefristBis.toISOString() };
    }
  }

  const stufe = eskalierbare
    .map((p) => p.naechsteStufe as MahnStufeTyp)
    .reduce((max, s) => (STUFEN.indexOf(s) > STUFEN.indexOf(max) ? s : max));
  const gebuehr = stufe === 'ZAHLUNGSERINNERUNG' ? 0 : e.gebuehr;
  const summe = ueberfaellige.reduce((s, p) => s + p.offenerBetrag, 0);

  return {
    mahnreif: true,
    stufe,
    gebuehr,
    gesamtbetrag: Math.round((summe + gebuehr) * 100) / 100,
    zahlungsfrist: plusTage(heute, e.zahlungsfristTage).toISOString(),
    positionen: ueberfaellige,
  };
}
