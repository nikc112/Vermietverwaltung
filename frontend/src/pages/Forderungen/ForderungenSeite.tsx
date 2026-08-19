import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { formatDatum, formatEuro } from '@/lib/utils';
import { KontaktForderungen, Mahnung } from '@/types';
import { MahnHistorieTabelle, MAHN_ROLLEN, STUFEN_LABELS } from './MahnHistorieTabelle';

function kontaktAnzeigeName(k: KontaktForderungen['kontakt']): string {
  return k.firma?.trim() ? k.firma : `${k.vorname} ${k.nachname}`.trim();
}

export function ForderungenSeite() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const darfMahnen = rolle ? MAHN_ROLLEN.includes(rolle) : false;
  const [vorschau, setVorschau] = useState<KontaktForderungen | null>(null);
  const [erzeugt, setErzeugt] = useState<Mahnung | null>(null);

  const { data: forderungen = [] } = useQuery({
    queryKey: ['forderungen'],
    queryFn: () => api.forderungen.list().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (kontaktID: number) => api.mahnungen.create(kontaktID),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['forderungen'] });
      qc.invalidateQueries({ queryKey: ['mahnungen'] });
      setErzeugt(res.data);
      toast({ title: 'Mahnung erzeugt', variant: 'success' as never });
    },
    onError: (err: { response?: { data?: { grund?: string; wartefristBis?: string } } }) => {
      const d = err.response?.data;
      const text =
        d?.grund === 'WARTEFRIST' ? `Wartefrist läuft noch${d.wartefristBis ? ` bis ${formatDatum(d.wartefristBis)}` : ''}` :
        d?.grund === 'KEINE_UEBERFAELLIGEN' ? 'Keine überfälligen Posten' :
        d?.grund === 'STUFEN_DECKEL' ? 'Letzte Mahnstufe bereits erreicht' :
        d?.grund === 'KONTAKT_GESPERRT' ? 'Kontakt ist inaktiv oder anonymisiert' :
        'Mahnung konnte nicht erzeugt werden';
      toast({ title: text, variant: 'destructive' });
      setVorschau(null);
    },
  });

  const versendenMut = useMutation({
    mutationFn: (id: number) => api.mahnungen.versenden(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mahnungen'] }); setVorschau(null); setErzeugt(null); toast({ title: 'Mahnung versendet', variant: 'success' as never }); },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast({ title: err.response?.data?.error ?? 'Versand fehlgeschlagen', variant: 'destructive' }),
  });

  const pdfDownload = async (m: Mahnung) => {
    const res = await api.mahnungen.pdf(m.id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mahnung_${m.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (f: KontaktForderungen) => {
    const v = f.vorschlag;
    if (v.mahnreif) return <Badge variant="destructive">mahnreif – {STUFEN_LABELS[v.stufe]}</Badge>;
    if (v.grund === 'WARTEFRIST') return <Badge variant="outline">Wartefrist bis {v.wartefristBis ? formatDatum(v.wartefristBis) : '–'}</Badge>;
    if (v.grund === 'STUFEN_DECKEL') return <Badge variant="outline">letzte Mahnstufe erreicht</Badge>;
    if (v.grund === 'KONTAKT_GESPERRT') return <Badge variant="outline">Kontakt inaktiv/anonymisiert</Badge>;
    return <Badge variant="secondary">noch nicht überfällig</Badge>;
  };

  return (
    <div>
      <PageHeader title="Forderungen" description="Offene Posten und Mahnwesen" />

      <Tabs defaultValue="offene">
        <TabsList>
          <TabsTrigger value="offene">Offene Posten ({forderungen.length})</TabsTrigger>
          <TabsTrigger value="historie">Mahnhistorie</TabsTrigger>
        </TabsList>

        <TabsContent value="offene" className="space-y-4">
          {forderungen.length === 0 && (
            <p className="text-center py-10 text-muted-foreground">Keine offenen Posten — alles bezahlt 🎉</p>
          )}
          {forderungen.map((f) => (
            <div key={f.kontakt.id} className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-3">
                <Link to={`/kontakte/${f.kontakt.id}`} className="font-semibold hover:underline">
                  {kontaktAnzeigeName(f.kontakt)}
                </Link>
                {statusBadge(f)}
                <span className="ml-auto font-semibold">{formatEuro(f.summe)}</span>
                {darfMahnen && f.vorschlag.mahnreif && (
                  <Button size="sm" onClick={() => { setErzeugt(null); setVorschau(f); }}>
                    {STUFEN_LABELS[f.vorschlag.stufe]} erzeugen
                  </Button>
                )}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {f.posten.map((p) => (
                    <tr key={`${p.typ}-${p.referenzID}`} className="border-t">
                      <td className="py-1.5">{p.beschreibung}</td>
                      <td className="py-1.5 text-muted-foreground text-xs">
                        {p.ueberfaellig ? `überfällig${p.faelligAm ? ` seit ${formatDatum(p.faelligAm)}` : ''}` : 'noch nicht überfällig'}
                        {p.bisherigeStufe ? ` · bisher: ${STUFEN_LABELS[p.bisherigeStufe]}` : ''}
                      </td>
                      <td className="py-1.5 text-right">{formatEuro(p.offenerBetrag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="historie">
          <MahnHistorieTabelle />
        </TabsContent>
      </Tabs>

      <Dialog open={vorschau !== null} onOpenChange={(o) => { if (!o) { setVorschau(null); setErzeugt(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {vorschau?.vorschlag.mahnreif ? `${STUFEN_LABELS[vorschau.vorschlag.stufe]} für ${kontaktAnzeigeName(vorschau.kontakt)}` : ''}
            </DialogTitle>
          </DialogHeader>
          {vorschau?.vorschlag.mahnreif && !erzeugt && (
            <div className="space-y-3 text-sm">
              <table className="w-full">
                <tbody>
                  {vorschau.vorschlag.positionen.map((p) => (
                    <tr key={`${p.typ}-${p.referenzID}`} className="border-b">
                      <td className="py-1">{p.beschreibung}</td>
                      <td className="py-1 text-right">{formatEuro(p.offenerBetrag)}</td>
                    </tr>
                  ))}
                  {vorschau.vorschlag.gebuehr > 0 && (
                    <tr className="border-b">
                      <td className="py-1">Mahngebühr</td>
                      <td className="py-1 text-right">{formatEuro(vorschau.vorschlag.gebuehr)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold">
                    <td className="py-1">Gesamtbetrag</td>
                    <td className="py-1 text-right">{formatEuro(vorschau.vorschlag.gesamtbetrag)}</td>
                  </tr>
                </tbody>
              </table>
              <p>Zahlungsfrist: <strong>{formatDatum(vorschau.vorschlag.zahlungsfrist)}</strong></p>
              <DialogFooter>
                <Button disabled={createMut.isPending} onClick={() => createMut.mutate(vorschau.kontakt.id)}>
                  {createMut.isPending ? 'Erzeuge…' : 'Mahnung erzeugen'}
                </Button>
              </DialogFooter>
            </div>
          )}
          {erzeugt && (
            <div className="space-y-3 text-sm">
              <p>Die Mahnung wurde erzeugt und dokumentiert.</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => pdfDownload(erzeugt)}>PDF herunterladen</Button>
                <Button disabled={versendenMut.isPending} onClick={() => versendenMut.mutate(erzeugt.id)}>
                  {versendenMut.isPending ? 'Sende…' : 'Per E-Mail senden'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
