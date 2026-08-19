import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/lib/utils';
import { DokumentFilter, DokumentKategorie, Rolle } from '@/types';
import { BezugWerte, DokumentBezugFelder, LEERE_BEZUEGE, bezugWerteZuZahlen } from './DokumentBezugFelder';

export const DOKUMENT_ROLLEN: Rolle[] = ['ADMIN', 'VOLLZUGRIFF', 'VERTRAGSVERWALTER'];

export const KATEGORIE_LABELS: Record<DokumentKategorie, string> = {
  MIETVERTRAG: 'Mietvertrag', NACHTRAG: 'Nachtrag', KUENDIGUNG: 'Kündigung',
  UEBERGABEPROTOKOLL: 'Übergabeprotokoll', RECHNUNG: 'Rechnung', ABRECHNUNG: 'Abrechnung',
  GRUNDRISS: 'Grundriss', ENERGIEAUSWEIS: 'Energieausweis', VERSICHERUNG: 'Versicherung',
  FOTO: 'Foto', AUSWEIS: 'Ausweis', SCHUFA: 'SCHUFA-Auskunft',
  SELBSTAUSKUNFT: 'Selbstauskunft', SCHRIFTWECHSEL: 'Schriftwechsel', SONSTIGES: 'Sonstiges',
};

// Kategorien, die serverseitig nur fuer alle ausser KOSTENBUCHER sichtbar sind
// (vgl. SENSIBEL_ROLLEN in backend/src/utils/dokument.ts) — ein KOSTENBUCHER bekaeme
// beim Waehlen sonst kommentarlos 403 bzw. eine leere Liste
export const SENSIBLE_KATEGORIEN: DokumentKategorie[] = ['AUSWEIS', 'SCHUFA', 'SELBSTAUSKUNFT', 'SCHRIFTWECHSEL'];

// muss mit backend/src/utils/dokument.ts (MAX_GROESSE_BYTES, ERLAUBTE_TYPEN) synchron bleiben;
// die serverseitige Pruefung bleibt massgeblich, das hier ist nur Komfort ohne Netzverkehr
const MAX_GROESSE_BYTES = 25 * 1024 * 1024;
const ERLAUBTE_TYPEN = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function sichtbareKategorien(rolle: Rolle | undefined): DokumentKategorie[] {
  const alle = Object.keys(KATEGORIE_LABELS) as DokumentKategorie[];
  if (rolle !== 'KOSTENBUCHER') return alle;
  return alle.filter((k) => !SENSIBLE_KATEGORIEN.includes(k));
}

// vorbelegter Bezug, wenn der Dialog aus einer Detailseite geoeffnet wird
type Props = { offen: boolean; onClose: () => void; bezug?: DokumentFilter };

export function DokumentUploadDialog({ offen, onClose, bezug }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [datei, setDatei] = useState<File | null>(null);
  const [dateiFehler, setDateiFehler] = useState<string | null>(null);
  const [titel, setTitel] = useState('');
  const [kategorie, setKategorie] = useState<DokumentKategorie>('SONSTIGES');
  const [schlagworte, setSchlagworte] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [bezugWerte, setBezugWerte] = useState<BezugWerte>(LEERE_BEZUEGE);
  const [fortschritt, setFortschritt] = useState<number | null>(null);

  // ein von aussen vorgegebener Bezug (z.B. aus einer Vertrags-Detailseite) ist gewollt fix —
  // die freie Auswahl gibt es nur, wenn der Dialog ohne Vorbelegung geoeffnet wird
  const vorbelegterBezug = !!bezug && Object.values(bezug).some((w) => typeof w === 'number');

  const { data: vorhandeneSchlagworte = [] } = useQuery({
    queryKey: ['dokumente', 'schlagworte'],
    queryFn: () => api.dokumente.schlagworte().then((r) => r.data),
    enabled: offen,
  });

  const zuruecksetzen = () => {
    setDatei(null); setDateiFehler(null); setTitel(''); setKategorie('SONSTIGES');
    setSchlagworte(''); setBeschreibung(''); setBezugWerte(LEERE_BEZUEGE); setFortschritt(null);
    // unkontrolliertes <input type="file"> haelt seinen DOM-Wert selbst — ohne das explizite
    // Zuruecksetzen bleibt der alte Dateiname sichtbar und ein erneutes Waehlen derselben Datei
    // feuert in vielen Browsern kein change-Ereignis mehr
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // an den offen-Zustand gekoppelt statt an einzelne Aufrufstellen (Upload-Erfolg,
  // Dialog-Schliessen) — ein vergessener dritter Schliesspfad kann den Reset damit nicht
  // mehr umgehen (vgl. Commit c95ed94, derselbe Fehler im Mahn-Dialog)
  useEffect(() => {
    if (!offen) zuruecksetzen();
  }, [offen]);

  // Groesse und Typ schon im Browser pruefen, damit eine zu grosse oder unerlaubte Datei nicht
  // erst komplett hochgeladen wird, bevor der Server sie ablehnt (reiner Komfort, kein Ersatz)
  const dateiUebernehmen = (f: File | null) => {
    if (!f) { setDatei(null); setDateiFehler(null); return; }
    if (f.size > MAX_GROESSE_BYTES) {
      setDatei(null);
      setDateiFehler(`Datei zu groß (${Math.round(f.size / 1024 / 1024)} MB) — maximal 25 MB erlaubt.`);
      return;
    }
    if (!ERLAUBTE_TYPEN.has(f.type)) {
      setDatei(null);
      setDateiFehler('Dateityp nicht erlaubt. Erlaubt sind PDF, JPEG, PNG, WEBP, DOCX, XLSX und TXT.');
      return;
    }
    setDateiFehler(null);
    setDatei(f);
  };

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('datei', datei as File);
      if (titel.trim()) fd.append('titel', titel.trim());
      if (beschreibung.trim()) fd.append('beschreibung', beschreibung.trim());
      fd.append('kategorie', kategorie);
      if (schlagworte.trim()) fd.append('schlagworte', schlagworte.trim());
      const bezugZuSenden = vorbelegterBezug ? (bezug ?? {}) : bezugWerteZuZahlen(bezugWerte);
      for (const [feld, wert] of Object.entries(bezugZuSenden)) {
        if (typeof wert === 'number') fd.append(feld, String(wert));
      }
      setFortschritt(0);
      return api.dokumente.upload(fd, (evt) => {
        if (evt.total) setFortschritt(Math.round((evt.loaded / evt.total) * 100));
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dokumente'] });
      onClose();
      toast({
        title: res.data.dublette
          ? `Hochgeladen — gleiche Datei existiert bereits (Nr. ${res.data.dublette})`
          : 'Dokument hochgeladen',
        variant: 'success' as never,
      });
    },
    onError: (err) => {
      setFortschritt(null);
      toast({ title: extractApiError(err, 'Upload fehlgeschlagen'), variant: 'destructive' });
    },
  });

  const fortschrittsText = () => {
    if (!uploadMut.isPending) return 'Hochladen';
    if (fortschritt !== null && fortschritt < 100) return `Lädt hoch… ${fortschritt}%`;
    return 'Wird verarbeitet…';
  };

  return (
    <Dialog open={offen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dokument hochladen</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (datei && !uploadMut.isPending) uploadMut.mutate();
          }}
          className="space-y-3"
        >
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); dateiUebernehmen(e.dataTransfer.files[0] ?? null); }}
            className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground"
          >
            {datei ? `${datei.name} (${Math.round(datei.size / 1024)} KB)` : 'Datei hierher ziehen oder auswählen'}
            <Input
              ref={fileInputRef}
              type="file"
              className="mt-2"
              onChange={(e) => dateiUebernehmen(e.target.files?.[0] ?? null)}
            />
            {dateiFehler && <p className="mt-2 text-xs text-destructive">{dateiFehler}</p>}
          </div>
          <div>
            <Label>Titel (leer = Dateiname)</Label>
            <Input value={titel} maxLength={255} onChange={(e) => setTitel(e.target.value)} />
          </div>
          <div>
            <Label>Kategorie</Label>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value as DokumentKategorie)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {sichtbareKategorien(rolle).map((k) => (
                <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Schlagworte (durch Komma getrennt)</Label>
            <Input
              list="dokument-schlagworte"
              value={schlagworte}
              onChange={(e) => setSchlagworte(e.target.value)}
              placeholder="Wohnung EG, 2026"
            />
            <datalist id="dokument-schlagworte">
              {vorhandeneSchlagworte.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <Label>Beschreibung (optional)</Label>
            <Input value={beschreibung} maxLength={2000} onChange={(e) => setBeschreibung(e.target.value)} />
          </div>
          {!vorbelegterBezug && (
            <div>
              <Label>Bezug (optional)</Label>
              <DokumentBezugFelder werte={bezugWerte} onChange={setBezugWerte} aktiv={offen} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!datei || uploadMut.isPending}>
              {fortschrittsText()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
