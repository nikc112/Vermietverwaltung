export type FristTypTyp = 'MANUELL' | 'NKA_ABRECHNUNG' | 'VERTRAGSENDE';
export type FristStatusTyp = 'OFFEN' | 'ERLEDIGT' | 'VERWORFEN';
export type AmpelFarbe = 'ROT' | 'GELB' | 'GRUEN';

export interface FristEinstellungen {
  vorlaufNkaTage: number;
  vorlaufVertragsendeTage: number;
  vorlaufManuellTage: number;
}

export interface VertragInput {
  id: number;
  vertragsnummer: string;
  beginn: Date;
  ende: Date | null;
  status: string;
  abrechnungsjahre: number[];
  mieterName: string;
}

export interface AutoFristKandidat {
  typ: 'NKA_ABRECHNUNG' | 'VERTRAGSENDE';
  mietvertragID: number;
  referenzJahr: number; // NKA: Abrechnungsjahr; VERTRAGSENDE: 0 (Konvention fuer Unique-Index)
  titel: string;
  faelligAm: Date;
  aeltereOffen: number; // nur NKA: Anzahl aelterer, ebenfalls offener Abrechnungsjahre
}

export interface FristOverride {
  id: number;
  typ: FristTypTyp;
  mietvertragID: number | null;
  referenzJahr: number | null;
  titel: string;
  faelligAm: Date;
  notizen: string | null;
  status: FristStatusTyp;
}

export interface GemergteAutoFrist extends AutoFristKandidat {
  overrideID: number | null;
  status: FristStatusTyp;
  notizen: string | null;
}

const TAG_MS = 24 * 60 * 60 * 1000;

// Automatische Frist-Kandidaten aus den Bestandsdaten ableiten (Spec Abschnitt 2)
export function berechneAutoFristen(vertraege: VertragInput[], heute: Date): AutoFristKandidat[] {
  const kandidaten: AutoFristKandidat[] = [];
  const aktuellesJahr = heute.getUTCFullYear();

  for (const v of vertraege) {
    if (v.status !== 'AKTIV' && v.status !== 'GEKUENDIGT') continue;

    // § 556 BGB: jedes abgeschlossene Kalenderjahr ab Vertragsbeginn ohne Abrechnung
    const offeneJahre: number[] = [];
    for (let jahr = v.beginn.getUTCFullYear(); jahr < aktuellesJahr; jahr++) {
      if (!v.abrechnungsjahre.includes(jahr)) offeneJahre.push(jahr);
    }
    if (offeneJahre.length > 0) {
      const juengstes = offeneJahre[offeneJahre.length - 1];
      kandidaten.push({
        typ: 'NKA_ABRECHNUNG',
        mietvertragID: v.id,
        referenzJahr: juengstes,
        titel: `NKA ${juengstes} erstellen – ${v.vertragsnummer} / ${v.mieterName}`,
        faelligAm: new Date(Date.UTC(juengstes + 1, 11, 31)),
        aeltereOffen: offeneJahre.length - 1,
      });
    }

    if (v.ende !== null) {
      kandidaten.push({
        typ: 'VERTRAGSENDE',
        mietvertragID: v.id,
        referenzJahr: 0,
        titel: `Vertrag ${v.vertragsnummer} endet`,
        faelligAm: v.ende,
        aeltereOffen: 0,
      });
    }
  }
  return kandidaten;
}

export function ampelFuerFrist(
  typ: FristTypTyp,
  faelligAm: Date,
  heute: Date,
  e: FristEinstellungen,
): AmpelFarbe {
  const vorlaufTage =
    typ === 'NKA_ABRECHNUNG' ? e.vorlaufNkaTage :
    typ === 'VERTRAGSENDE' ? e.vorlaufVertragsendeTage :
    e.vorlaufManuellTage;
  // Tagesgranularitaet: heute traegt eine Uhrzeit, faelligAm ist UTC-Mitternacht;
  // ohne Normalisierung auf den Kalendertag waere eine heute faellige Frist faelschlich ROT.
  const heuteTag = Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate());
  if (faelligAm.getTime() < heuteTag) return 'ROT';
  return heuteTag >= faelligAm.getTime() - vorlaufTage * TAG_MS ? 'GELB' : 'GRUEN';
}

// Overrides (verschoben/erledigt/verworfen) auf die berechneten Kandidaten anwenden
export function mergeAutoFristen(
  kandidaten: AutoFristKandidat[],
  overrides: FristOverride[],
): GemergteAutoFrist[] {
  return kandidaten.map((k) => {
    const o = overrides.find(
      (ov) => ov.typ === k.typ && ov.mietvertragID === k.mietvertragID && ov.referenzJahr === k.referenzJahr,
    );
    if (!o) return { ...k, overrideID: null, status: 'OFFEN' as FristStatusTyp, notizen: null };
    return { ...k, titel: o.titel, faelligAm: o.faelligAm, notizen: o.notizen, overrideID: o.id, status: o.status };
  });
}
