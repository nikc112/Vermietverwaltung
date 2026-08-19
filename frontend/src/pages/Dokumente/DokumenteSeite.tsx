import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { DokumentFilter, DokumentKategorie } from '@/types';
import { DOKUMENT_ROLLEN, DokumentUploadDialog, KATEGORIE_LABELS, SENSIBLE_KATEGORIEN } from './DokumentUploadDialog';
import { DokumenteTabelle } from './DokumenteTabelle';

export function DokumenteSeite() {
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const darfSchreiben = rolle ? DOKUMENT_ROLLEN.includes(rolle) : false;
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState<DokumentKategorie | ''>('');
  const [schlagwort, setSchlagwort] = useState('');
  const [ohneBezug, setOhneBezug] = useState(false);
  const [dialogOffen, setDialogOffen] = useState(false);

  const filter: DokumentFilter = {
    ...(suche ? { suche } : {}),
    ...(kategorie ? { kategorie } : {}),
    ...(schlagwort ? { schlagwort } : {}),
    ...(ohneBezug ? { ohneBezug: true } : {}),
  };

  const { data: dokumente = [], isLoading, isError } = useQuery({
    queryKey: ['dokumente', filter],
    queryFn: () => api.dokumente.list(filter).then((r) => r.data),
    // Die Texterkennung läuft im Hintergrund und wechselt den Status binnen
    // Sekunden. Ohne dieses Nachfragen bliebe „wird verarbeitet" stehen, bis der
    // Nutzer den Filter ändert oder neu lädt — und der Knopf „Erneut versuchen"
    // erschiene nie, denn ein Fehlschlag steht erst nach mehreren Minuten fest.
    // Nachgefragt wird nur, solange tatsächlich etwas in Arbeit ist.
    refetchInterval: (query) => {
      const daten = query.state.data;
      const offen = daten?.some(
        (d) => d.textStatus === 'WARTEND' || d.textStatus === 'IN_ARBEIT',
      );
      return offen ? 5000 : false;
    },
  });

  const { data: schlagworte = [], isError: schlagworteFehler } = useQuery({
    queryKey: ['dokumente', 'schlagworte'],
    queryFn: () => api.dokumente.schlagworte().then((r) => r.data),
  });

  // KOSTENBUCHER wuerde beim Waehlen einer sensiblen Kategorie kommentarlos 403 bzw.
  // eine leere Liste bekommen — die Optionen erst gar nicht anbieten
  const kategorien = (Object.keys(KATEGORIE_LABELS) as DokumentKategorie[]).filter(
    (k) => rolle !== 'KOSTENBUCHER' || !SENSIBLE_KATEGORIEN.includes(k),
  );

  return (
    <div>
      <PageHeader title="Dokumente" description="Ablage, Verschlagwortung und Suche" />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-white p-4">
        <div className="min-w-48 flex-1">
          <Label>Suche</Label>
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel, Dateiname, Beschreibung" />
        </div>
        <div>
          <Label>Kategorie</Label>
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value as DokumentKategorie | '')}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">alle</option>
            {kategorien.map((k) => (
              <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Schlagwort</Label>
          <select
            value={schlagwort}
            onChange={(e) => setSchlagwort(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">alle</option>
            {schlagworte.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* Ohne Hinweis sieht ein Ladefehler aus wie "es gibt keine Schlagworte" */}
          {schlagworteFehler && (
            <p className="mt-1 text-xs text-destructive">Schlagworte konnten nicht geladen werden.</p>
          )}
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={ohneBezug} onChange={(e) => setOhneBezug(e.target.checked)} />
          nur ohne Zuordnung
        </label>
        {darfSchreiben && <Button className="ml-auto" onClick={() => setDialogOffen(true)}>Dokument hochladen</Button>}
      </div>

      <div className="rounded-md border bg-white p-4">
        {/* Ohne eigene Zustaende saehe ein Serverfehler aus wie ein leeres Archiv */}
        {isLoading && <p className="py-4 text-sm text-muted-foreground">Dokumente werden geladen …</p>}
        {isError && (
          <p className="py-4 text-sm text-destructive">Dokumente konnten nicht geladen werden.</p>
        )}
        {!isLoading && !isError && <DokumenteTabelle dokumente={dokumente} />}
      </div>

      <DokumentUploadDialog offen={dialogOffen} onClose={() => setDialogOffen(false)} />
    </div>
  );
}
