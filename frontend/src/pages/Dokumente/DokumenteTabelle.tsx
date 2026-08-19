import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { extractApiError, formatDatum } from '@/lib/utils';
import { Dokument, TextStatus, TextstellenTeil } from '@/types';
import { DOKUMENT_ROLLEN } from './DokumentUploadDialog';
import { DokumentBearbeitenDialog } from './DokumentBearbeitenDialog';

const LOESCH_ROLLEN = ['ADMIN', 'VOLLZUGRIFF'];

// Record<TextStatus, ...> statt Record<string, ...>: so meldet der Compiler einen
// fehlenden oder vertippten Schlüssel beim Übersetzen. Der Rückfall auf den rohen
// Wert unten bleibt trotzdem stehen — er sichert gegen etwas anderes ab: Der Typ
// gilt nur beim Übersetzen, über die Leitung kann ein Status kommen, den dieses
// Frontend noch nicht kennt. Dann ist der Code lesbarer als eine leere Zelle.
const TEXT_STATUS_TEXT: Record<TextStatus, string> = {
  WARTEND: 'wird verarbeitet',
  IN_ARBEIT: 'wird verarbeitet',
  FERTIG: 'durchsuchbar',
  UEBERSPRUNGEN: 'kein Text gefunden',
  FEHLGESCHLAGEN: 'Texterkennung fehlgeschlagen',
};

// Die Teile kommen bereits zerlegt vom Server; hier wird nur noch gerendert.
// Bewusst kein dangerouslySetInnerHTML — der Inhalt stammt aus hochgeladenen Dateien.
function Textstelle({ teile }: { teile: TextstellenTeil[] }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {teile.map((teil, i) =>
        teil.treffer
          ? <mark key={i} className="rounded bg-yellow-200 px-0.5">{teil.text}</mark>
          : <span key={i}>{teil.text}</span>,
      )}
    </p>
  );
}

function bezugsLink(d: Dokument): string | null {
  if (d.mietvertragID) return `/mietvertraege/${d.mietvertragID}`;
  if (d.mietobjektID) return `/mietobjekte/${d.mietobjektID}`;
  if (d.mieteinheitID) return `/mieteinheiten/${d.mieteinheitID}`;
  if (d.kontaktID) return `/kontakte/${d.kontaktID}`;
  if (d.kostenID) return '/kosten';
  if (d.abrechnungID) return '/nebenkosten';
  return null;
}

export function DokumenteTabelle({ dokumente }: { dokumente: Dokument[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const darfLoeschen = rolle ? LOESCH_ROLLEN.includes(rolle) : false;
  const darfBearbeiten = rolle ? DOKUMENT_ROLLEN.includes(rolle) : false;
  const [bearbeiten, setBearbeiten] = useState<Dokument | null>(null);
  const [loeschen, setLoeschen] = useState<Dokument | null>(null);

  const loeschMut = useMutation({
    mutationFn: (id: number) => api.dokumente.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumente'] });
      setLoeschen(null);
      toast({ title: 'Dokument gelöscht', variant: 'success' as never });
    },
    onError: (err) =>
      toast({ title: extractApiError(err, 'Löschen fehlgeschlagen'), variant: 'destructive' }),
  });

  const textNeuMut = useMutation({
    mutationFn: (id: number) => api.dokumente.textNeu(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dokumente'] });
      toast({ title: 'Texterkennung erneut vorgemerkt' });
    },
    onError: (err) => toast({ title: extractApiError(err, 'Erneuter Versuch fehlgeschlagen'), variant: 'destructive' }),
  });

  const herunterladen = async (d: Dokument) => {
    try {
      const res = await api.dokumente.download(d.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.dateiname;
      // im DOM verankern und erst nach dem Klick wieder entfernen — manche Browser
      // brechen den bereits angestossenen Download ab, wenn Anker oder Objekt-URL
      // synchron direkt danach verschwinden
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      toast({ title: extractApiError(err, 'Download fehlgeschlagen'), variant: 'destructive' });
    }
  };

  if (dokumente.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-4">Titel</th>
            <th className="py-2 pr-4">Kategorie</th>
            <th className="py-2 pr-4">Bezug</th>
            <th className="py-2 pr-4">Hochgeladen</th>
            <th className="py-2 pr-4">Größe</th>
            <th className="py-2 text-right">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {dokumente.map((d) => {
            const ziel = bezugsLink(d);
            return (
              <tr key={d.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {d.titel}
                  {d.schlagworte.length > 0 && (
                    <div className="text-xs text-muted-foreground">{d.schlagworte.join(', ')}</div>
                  )}
                  {d.textstelle && <Textstelle teile={d.textstelle} />}
                  {d.textStatus !== 'FERTIG' && (
                    <span
                      className={`text-xs ${d.textStatus === 'FEHLGESCHLAGEN' ? 'text-destructive' : 'text-muted-foreground'}`}
                      title={d.textHinweis ?? undefined}
                    >
                      {TEXT_STATUS_TEXT[d.textStatus] ?? d.textStatus}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <Badge variant={d.sensibel ? 'destructive' : 'secondary'}>{d.kategorieLabel}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {ziel ? <Link to={ziel} className="text-blue-700 hover:underline">{d.bezug}</Link> : '–'}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">{formatDatum(d.hochgeladenAm)}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{Math.round(d.groesseBytes / 1024)} KB</td>
                <td className="py-2 space-x-1 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => herunterladen(d)}>Herunterladen</Button>
                  {darfBearbeiten && (
                    <Button size="sm" variant="outline" onClick={() => setBearbeiten(d)}>Bearbeiten</Button>
                  )}
                  {d.textStatus === 'FEHLGESCHLAGEN' && darfLoeschen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => textNeuMut.mutate(d.id)}
                      disabled={textNeuMut.isPending}
                    >
                      Erneut versuchen
                    </Button>
                  )}
                  {darfLoeschen && (
                    <Button size="sm" variant="destructive" onClick={() => setLoeschen(d)}>Löschen</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <DokumentBearbeitenDialog dokument={bearbeiten} onClose={() => setBearbeiten(null)} />

      <ConfirmDialog
        open={loeschen !== null}
        onOpenChange={(o) => { if (!o) setLoeschen(null); }}
        title="Dokument löschen"
        description={`Das Dokument „${loeschen?.titel}" wird unwiderruflich gelöscht.`}
        onConfirm={() => loeschen && loeschMut.mutate(loeschen.id)}
        loading={loeschMut.isPending}
        confirmLabel="Löschen"
        variant="destructive"
      />
    </div>
  );
}
