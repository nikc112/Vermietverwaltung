import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { formatDatum } from '@/lib/utils';
import { Loeschpruefung, Rolle } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { MahnHistorieTabelle } from '@/pages/Forderungen/MahnHistorieTabelle';
import { DokumenteAbschnitt } from '@/pages/Dokumente/DokumenteAbschnitt';
import { KontaktDialog, ROLLEN_LABELS } from './KontaktDialog';

const LOESCH_ROLLEN: Rolle[] = ['ADMIN', 'VOLLZUGRIFF'];

export function KontaktDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const benutzer = useAuthStore((s) => s.benutzer);
  const darfLoeschen = !!benutzer && LOESCH_ROLLEN.includes(benutzer.rolle as Rolle);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pruefung, setPruefung] = useState<Loeschpruefung | null>(null);

  const { data: kontakt, isLoading } = useQuery({
    queryKey: ['kontakte', id],
    queryFn: () => api.kontakte.get(Number(id)).then((r) => r.data),
  });

  const exportMut = useMutation({
    mutationFn: () => api.kontakte.dsgvoExport(Number(id)),
    onSuccess: (res) => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dsgvo_auskunft_kontakt_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast({ title: 'Export fehlgeschlagen', variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.kontakte.delete(Number(id)),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kontakte'] });
      if (res.data.fall === 'LOESCHEN') {
        toast({ title: 'Kontakt gelöscht', variant: 'success' as never });
        navigate('/kontakte');
      } else {
        toast({ title: 'Kontakt anonymisiert', variant: 'success' as never });
        qc.invalidateQueries({ queryKey: ['kontakte', id] });
      }
      setPruefung(null);
    },
    onError: () => { toast({ title: 'Löschen nicht möglich', variant: 'destructive' }); setPruefung(null); },
  });

  const starteLoeschung = async () => {
    try {
      const res = await api.kontakte.loeschpruefung(Number(id));
      setPruefung(res.data);
    } catch {
      toast({ title: 'Löschprüfung fehlgeschlagen', variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Laden…</div>;
  if (!kontakt) return <div className="text-center py-12 text-muted-foreground">Nicht gefunden</div>;

  const name = kontakt.firma?.trim() ? kontakt.firma : `${kontakt.vorname} ${kontakt.nachname}`.trim();

  const pruefungsText =
    pruefung?.fall === 'LOESCHEN'
      ? 'Der Kontakt hat keine Verträge oder Objekte und wird endgültig gelöscht.'
      : pruefung?.fall === 'ANONYMISIEREN'
        ? `Der Kontakt hat ${pruefung.vertragAnzahl} Vertrag/Verträge. Die Aufbewahrungsfrist ist abgelaufen — der Kontakt wird anonymisiert (Verträge und Abrechnungen bleiben erhalten).`
        : `Löschung nicht möglich: ${pruefung?.grund}${pruefung?.sperrBis ? ` (Aufbewahrungspflicht bis ${formatDatum(pruefung.sperrBis)})` : ''}. Alternative: Kontakt deaktivieren.`;

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/kontakte"><ArrowLeft className="h-4 w-4 mr-1" /> Kontakte</Link>
        </Button>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{name}</h1>
        {kontakt.rollen.map((r) => <Badge key={r.rolle} variant="secondary">{ROLLEN_LABELS[r.rolle]}</Badge>)}
        {kontakt.anonymisiertAm && <Badge variant="outline">anonymisiert</Badge>}
        {!kontakt.anonymisiertAm && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setDialogOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Stammdaten</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Anschrift: </span>
              {kontakt.strasse ? `${kontakt.strasse} ${kontakt.hausnummer ?? ''}, ${kontakt.plz ?? ''} ${kontakt.ort ?? ''}` : '–'}</div>
            {kontakt.geburtsdatum && <div><span className="text-muted-foreground">Geburtsdatum: </span>{formatDatum(kontakt.geburtsdatum)}</div>}
            {kontakt.iban && <div><span className="text-muted-foreground">IBAN: </span>{kontakt.iban}</div>}
            {kontakt.steuernummer && <div><span className="text-muted-foreground">Steuernummer: </span>{kontakt.steuernummer}</div>}
            {kontakt.notizen && <div><span className="text-muted-foreground">Notizen: </span>{kontakt.notizen}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Kommunikation</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {kontakt.kommunikation.length === 0 && <p className="text-muted-foreground">Keine Einträge</p>}
            {kontakt.kommunikation.map((c) => (
              <div key={c.id}>
                <span className="text-muted-foreground">{c.typ}{c.bezeichnung ? ` (${c.bezeichnung})` : ''}: </span>
                {c.wert}{c.istStandard && c.typ === 'EMAIL' && <Badge variant="outline" className="ml-2">Standard</Badge>}
              </div>
            ))}
            {kontakt.ansprechpartner.length > 0 && (
              <div className="pt-2">
                <p className="text-muted-foreground font-medium">Ansprechpartner:</p>
                {kontakt.ansprechpartner.map((a) => (
                  <div key={a.id}>{a.name}{a.funktion ? ` (${a.funktion})` : ''}{a.email ? ` · ${a.email}` : ''}{a.telefon ? ` · ${a.telefon}` : ''}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vertraege" className="mb-6">
        <TabsList>
          <TabsTrigger value="vertraege">Verträge ({kontakt.mietvertraege?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="objekte">Objekte ({kontakt.mietobjekte?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="mahnungen">Mahnungen</TabsTrigger>
        </TabsList>
        <TabsContent value="vertraege">
          {(kontakt.mietvertraege?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Keine Verträge</p>
          ) : (
            <div className="space-y-2">
              {kontakt.mietvertraege?.map((v) => (
                <Link key={v.id} to={`/mietvertraege/${v.id}`} className="block bg-white border rounded-lg p-3 text-sm hover:bg-gray-50">
                  <span className="font-medium">{v.vertragsnummer}</span>
                  <span className="text-muted-foreground"> · {formatDatum(v.beginn)} – {v.ende ? formatDatum(v.ende) : 'laufend'}</span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="objekte">
          {(kontakt.mietobjekte?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Keine Objekte</p>
          ) : (
            <div className="space-y-2">
              {kontakt.mietobjekte?.map((o) => (
                <Link key={o.id} to={`/mietobjekte/${o.id}`} className="block bg-white border rounded-lg p-3 text-sm hover:bg-gray-50">
                  <span className="font-medium">{o.bezeichnung}</span>
                  <span className="text-muted-foreground"> · {o.strasse} {o.hausnummer}, {o.plz} {o.ort}</span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="mahnungen">
          <MahnHistorieTabelle kontaktID={Number(id)} />
        </TabsContent>
      </Tabs>

      {!kontakt.anonymisiertAm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Datenschutz (DSGVO)</CardTitle></CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="outline" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
              <Download className="h-4 w-4 mr-1" /> {exportMut.isPending ? 'Exportiere…' : 'Auskunft exportieren (PDF)'}
            </Button>
            {darfLoeschen && (
              <Button variant="destructive" onClick={starteLoeschung}>
                <Trash2 className="h-4 w-4 mr-1" /> Kontakt löschen
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <DokumenteAbschnitt bezug={{ kontaktID: Number(id) }} />

      {pruefung?.fall === 'GESPERRT' ? (
        <Dialog open={pruefung !== null} onOpenChange={(o) => { if (!o) setPruefung(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Löschung nicht möglich</DialogTitle>
              <DialogDescription>{pruefungsText}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setPruefung(null)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={pruefung !== null}
          onOpenChange={(o) => { if (!o) setPruefung(null); }}
          title="Kontakt löschen?"
          description={pruefungsText}
          confirmLabel={pruefung?.fall === 'LOESCHEN' ? 'Endgültig löschen' : pruefung?.fall === 'ANONYMISIEREN' ? 'Anonymisieren' : 'Bestätigen'}
          onConfirm={() => deleteMut.mutate()}
        />
      )}

      <KontaktDialog open={dialogOpen} onOpenChange={setDialogOpen} kontakt={kontakt} />
    </div>
  );
}
