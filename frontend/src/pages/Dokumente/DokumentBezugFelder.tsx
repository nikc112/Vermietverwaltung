import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { api } from '@/api';
import { Dokument } from '@/types';

// Sechs optionale Bezuege eines Dokuments als kontrollierte String-Werte ('' = kein Bezug).
// Strings statt Zahlen, weil <select> nur Strings kennt — die Umrechnung passiert erst beim Senden.
export type BezugWerte = {
  mietvertragID: string;
  mietobjektID: string;
  mieteinheitID: string;
  kontaktID: string;
  kostenID: string;
  abrechnungID: string;
};

export const LEERE_BEZUEGE: BezugWerte = {
  mietvertragID: '', mietobjektID: '', mieteinheitID: '', kontaktID: '', kostenID: '', abrechnungID: '',
};

export function dokumentZuBezugWerte(d: Dokument): BezugWerte {
  return {
    mietvertragID: d.mietvertragID ? String(d.mietvertragID) : '',
    mietobjektID: d.mietobjektID ? String(d.mietobjektID) : '',
    mieteinheitID: d.mieteinheitID ? String(d.mieteinheitID) : '',
    kontaktID: d.kontaktID ? String(d.kontaktID) : '',
    kostenID: d.kostenID ? String(d.kostenID) : '',
    abrechnungID: d.abrechnungID ? String(d.abrechnungID) : '',
  };
}

// Fuer den Upload: leere Felder werden schlicht weggelassen (kein Bezug = Feld fehlt im Formular)
export function bezugWerteZuZahlen(werte: BezugWerte): Partial<Record<keyof BezugWerte, number>> {
  const ergebnis: Partial<Record<keyof BezugWerte, number>> = {};
  for (const [feld, wert] of Object.entries(werte) as [keyof BezugWerte, string][]) {
    if (wert) ergebnis[feld] = Number(wert);
  }
  return ergebnis;
}

// Fuer das Bearbeiten: jedes Feld wird explizit gesendet — ein geleertes Feld als null,
// denn nur null entkoppelt den Bezug im Backend, undefined liesse ihn unveraendert
export function bezugWerteZuUpdatePayload(werte: BezugWerte): Record<keyof BezugWerte, number | null> {
  const ergebnis = {} as Record<keyof BezugWerte, number | null>;
  for (const [feld, wert] of Object.entries(werte) as [keyof BezugWerte, string][]) {
    ergebnis[feld] = wert ? Number(wert) : null;
  }
  return ergebnis;
}

type Props = {
  werte: BezugWerte;
  onChange: (werte: BezugWerte) => void;
  // Listen erst laden, wenn der umschliessende Dialog tatsaechlich offen ist —
  // sonst loesen die Seiten bei jedem Rendern sechs zusaetzliche Abfragen aus
  aktiv: boolean;
};

export function DokumentBezugFelder({ werte, onChange, aktiv }: Props) {
  const { data: vertraege = [] } = useQuery({
    queryKey: ['mietvertraege'],
    queryFn: () => api.mietvertraege.list().then((r) => r.data),
    enabled: aktiv,
  });
  const { data: mietobjekte = [] } = useQuery({
    queryKey: ['mietobjekte'],
    queryFn: () => api.mietobjekte.list().then((r) => r.data),
    enabled: aktiv,
  });
  const { data: mieteinheiten = [] } = useQuery({
    queryKey: ['mieteinheiten'],
    queryFn: () => api.mieteinheiten.list().then((r) => r.data),
    enabled: aktiv,
  });
  const { data: kontakte = [] } = useQuery({
    queryKey: ['kontakte'],
    queryFn: () => api.kontakte.list().then((r) => r.data),
    enabled: aktiv,
  });
  const { data: kosten = [] } = useQuery({
    queryKey: ['kosten'],
    queryFn: () => api.kosten.list().then((r) => r.data),
    enabled: aktiv,
  });
  const { data: abrechnungen = [] } = useQuery({
    queryKey: ['nebenkosten', 'abrechnungen'],
    queryFn: () => api.nebenkosten.list().then((r) => r.data),
    enabled: aktiv,
  });

  const setzen = (feld: keyof BezugWerte, wert: string) => onChange({ ...werte, [feld]: wert });
  const selectKlasse = 'w-full rounded-md border px-3 py-2 text-sm';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <Label>Mietvertrag</Label>
        <select value={werte.mietvertragID} onChange={(e) => setzen('mietvertragID', e.target.value)} className={selectKlasse}>
          <option value="">– kein Bezug –</option>
          {vertraege.map((v) => <option key={v.id} value={v.id}>{v.vertragsnummer}</option>)}
        </select>
      </div>
      <div>
        <Label>Mietobjekt</Label>
        <select value={werte.mietobjektID} onChange={(e) => setzen('mietobjektID', e.target.value)} className={selectKlasse}>
          <option value="">– kein Bezug –</option>
          {mietobjekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}
        </select>
      </div>
      <div>
        <Label>Mieteinheit</Label>
        <select value={werte.mieteinheitID} onChange={(e) => setzen('mieteinheitID', e.target.value)} className={selectKlasse}>
          <option value="">– kein Bezug –</option>
          {mieteinheiten.map((m) => (
            <option key={m.id} value={m.id}>
              {m.mietobjekt?.bezeichnung ? `${m.mietobjekt.bezeichnung} – ${m.bezeichnung}` : m.bezeichnung}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Kontakt</Label>
        <select value={werte.kontaktID} onChange={(e) => setzen('kontaktID', e.target.value)} className={selectKlasse}>
          <option value="">– kein Bezug –</option>
          {kontakte.map((k) => <option key={k.id} value={k.id}>{k.firma || `${k.vorname} ${k.nachname}`}</option>)}
        </select>
      </div>
      <div>
        <Label>Kostenposition</Label>
        <select value={werte.kostenID} onChange={(e) => setzen('kostenID', e.target.value)} className={selectKlasse}>
          <option value="">– kein Bezug –</option>
          {kosten.map((k) => (
            <option key={k.id} value={k.id}>
              {k.mietobjekt?.bezeichnung ? `${k.mietobjekt.bezeichnung} – ${k.bezeichnung}` : k.bezeichnung}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Nebenkostenabrechnung</Label>
        <select value={werte.abrechnungID} onChange={(e) => setzen('abrechnungID', e.target.value)} className={selectKlasse}>
          <option value="">– kein Bezug –</option>
          {abrechnungen.map((a) => (
            <option key={a.id} value={a.id}>
              Abrechnung {a.abrechnungsjahr}{a.mietvertrag?.vertragsnummer ? ` – ${a.mietvertrag.vertragsnummer}` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
