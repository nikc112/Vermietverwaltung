import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { extractApiError } from '@/lib/utils';
import { Dokument, DokumentKategorie } from '@/types';
import { KATEGORIE_LABELS } from './DokumentUploadDialog';
import { BezugWerte, DokumentBezugFelder, LEERE_BEZUEGE, bezugWerteZuUpdatePayload, dokumentZuBezugWerte } from './DokumentBezugFelder';

// Bearbeitet Titel, Beschreibung, Kategorie, Schlagworte und Bezuege eines vorhandenen
// Dokuments. Die Datei selbst bleibt unangetastet — dafuer gibt es den Upload-Dialog.
type Props = { dokument: Dokument | null; onClose: () => void };

export function DokumentBearbeitenDialog({ dokument, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const offen = dokument !== null;
  const [titel, setTitel] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [kategorie, setKategorie] = useState<DokumentKategorie>('SONSTIGES');
  const [schlagworte, setSchlagworte] = useState('');
  const [bezugWerte, setBezugWerte] = useState<BezugWerte>(LEERE_BEZUEGE);

  const { data: vorhandeneSchlagworte = [] } = useQuery({
    queryKey: ['dokumente', 'schlagworte'],
    queryFn: () => api.dokumente.schlagworte().then((r) => r.data),
    enabled: offen,
  });

  // Formular bei jedem neu geoeffneten Dokument mit dessen aktuellen Werten befuellen
  useEffect(() => {
    if (dokument) {
      setTitel(dokument.titel);
      setBeschreibung(dokument.beschreibung ?? '');
      setKategorie(dokument.kategorie);
      setSchlagworte(dokument.schlagworte.join(', '));
      setBezugWerte(dokumentZuBezugWerte(dokument));
    }
  }, [dokument]);

  const bearbeitenMut = useMutation({
    mutationFn: () => {
      if (!dokument) return Promise.reject(new Error('Kein Dokument ausgewählt'));
      // Backend erwartet Schlagworte hier als Array, nicht kommasepariert wie beim Upload
      // (siehe updateDokumentSchema). Bezuege werden immer alle sechs explizit gesendet:
      // ein geleertes Feld muss als null ankommen, sonst laesst das Backend den alten Wert
      // stehen (undefined = unveraendert). zod entfernt unbekannte Felder ohnehin still,
      // wir senden trotzdem bewusst nur die bearbeitbaren.
      return api.dokumente.update(dokument.id, {
        titel: titel.trim(),
        beschreibung: beschreibung.trim(),
        kategorie,
        schlagworte: schlagworte.split(',').map((s) => s.trim()).filter(Boolean),
        ...bezugWerteZuUpdatePayload(bezugWerte),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumente'] });
      onClose();
      toast({ title: 'Dokument aktualisiert', variant: 'success' as never });
    },
    onError: (err) =>
      toast({ title: extractApiError(err, 'Speichern fehlgeschlagen'), variant: 'destructive' }),
  });

  return (
    <Dialog open={offen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dokument bearbeiten</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (titel.trim() && !bearbeitenMut.isPending) bearbeitenMut.mutate();
          }}
          className="space-y-3"
        >
          <div>
            <Label>Titel</Label>
            <Input value={titel} maxLength={255} onChange={(e) => setTitel(e.target.value)} />
          </div>
          <div>
            <Label>Kategorie</Label>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value as DokumentKategorie)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {(Object.keys(KATEGORIE_LABELS) as DokumentKategorie[]).map((k) => (
                <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Schlagworte (durch Komma getrennt)</Label>
            <Input
              list="dokument-schlagworte-bearbeiten"
              value={schlagworte}
              onChange={(e) => setSchlagworte(e.target.value)}
              placeholder="Wohnung EG, 2026"
            />
            <datalist id="dokument-schlagworte-bearbeiten">
              {vorhandeneSchlagworte.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <Label>Beschreibung (optional)</Label>
            <Input value={beschreibung} maxLength={2000} onChange={(e) => setBeschreibung(e.target.value)} />
          </div>
          <div>
            <Label>Bezug (optional)</Label>
            <DokumentBezugFelder werte={bezugWerte} onChange={setBezugWerte} aktiv={offen} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!titel.trim() || bearbeitenMut.isPending}>
              {bearbeitenMut.isPending ? 'Speichert…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
