import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Plus, Pencil, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { Mieteinheit } from '@/types';
import { DokumenteAbschnitt } from '@/pages/Dokumente/DokumenteAbschnitt';

const EINHEIT_TYPEN = [
  { value: 'WOHNUNG', label: 'Wohnung' }, { value: 'GEWERBE', label: 'Gewerbe' },
  { value: 'GARAGE', label: 'Garage' }, { value: 'STELLPLATZ', label: 'Stellplatz' }, { value: 'SONSTIGES', label: 'Sonstiges' },
];

export function MietobjektDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [einheitDialog, setEinheitDialog] = useState(false);
  const [editEinheit, setEditEinheit] = useState<Mieteinheit | null>(null);
  const [kostenJahr, setKostenJahr] = useState(new Date().getFullYear());

  const { data: obj, isLoading } = useQuery({
    queryKey: ['mietobjekte', id],
    queryFn: () => api.mietobjekte.get(Number(id)).then((r) => r.data),
  });

  const { data: kosten = [] } = useQuery({
    queryKey: ['mietobjekte', id, 'kosten', kostenJahr],
    queryFn: () => api.mietobjekte.kosten(Number(id), { jahr: kostenJahr }).then((r) => r.data),
  });

  const { register, handleSubmit, setValue, reset } = useForm<Partial<Mieteinheit>>();

  const createEinheitMut = useMutation({
    mutationFn: (data: Partial<Mieteinheit> & { mietobjektID: number }) => api.mieteinheiten.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mietobjekte', id] }); setEinheitDialog(false); reset(); toast({ title: 'Einheit angelegt', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  const updateEinheitMut = useMutation({
    mutationFn: ({ eid, data }: { eid: number; data: Partial<Mieteinheit> }) => api.mieteinheiten.update(eid, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mietobjekte', id] }); setEinheitDialog(false); setEditEinheit(null); reset(); toast({ title: 'Einheit aktualisiert', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Laden…</div>;
  if (!obj) return <div className="text-center py-12 text-muted-foreground">Nicht gefunden</div>;

  const onEinheitSubmit = (data: Partial<Mieteinheit>) => {
    if (editEinheit) updateEinheitMut.mutate({ eid: editEinheit.id, data });
    else createEinheitMut.mutate({ ...data, mietobjektID: Number(id) });
  };

  const gesamtFlaeche = obj.mieteinheiten?.reduce((s, e) => s + Number(e.flaeche), 0) ?? 0;
  const vermietet = obj.mieteinheiten?.filter((e) => (e.mietvertraege?.length ?? 0) > 0).length ?? 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" asChild><Link to="/mietobjekte"><ArrowLeft className="h-4 w-4 mr-1" /> Mietobjekte</Link></Button>
      </div>
      <h1 className="text-2xl font-bold mb-1">{obj.bezeichnung}</h1>
      <p className="text-muted-foreground mb-6">{obj.strasse} {obj.hausnummer}, {obj.plz} {obj.ort}</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Einheiten</p><p className="text-2xl font-bold">{obj.mieteinheiten?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Vermietet</p><p className="text-2xl font-bold text-green-600">{vermietet}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Gesamtfläche</p><p className="text-2xl font-bold">{gesamtFlaeche.toFixed(0)} m²</p></CardContent></Card>
      </div>

      <Tabs defaultValue="einheiten">
        <TabsList>
          <TabsTrigger value="einheiten">Mieteinheiten</TabsTrigger>
          <TabsTrigger value="kosten">Kosten</TabsTrigger>
        </TabsList>

        <TabsContent value="einheiten">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => { setEditEinheit(null); reset(); setEinheitDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Einheit anlegen
            </Button>
          </div>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                  <th className="text-left px-4 py-3 font-medium">Typ</th>
                  <th className="text-right px-4 py-3 font-medium">Fläche</th>
                  <th className="text-left px-4 py-3 font-medium">Etage</th>
                  <th className="text-left px-4 py-3 font-medium">Mieter</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {obj.mieteinheiten?.map((e) => {
                  const aktiverVertrag = e.mietvertraege?.[0];
                  return (
                    <tr key={e.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{e.bezeichnung}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{EINHEIT_TYPEN.find((t) => t.value === e.typ)?.label}</Badge></td>
                      <td className="px-4 py-3 text-right">{Number(e.flaeche).toFixed(1)} m²</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.etage ?? '–'}</td>
                      <td className="px-4 py-3">
                        {aktiverVertrag ? (
                          <span className="text-green-700">{(aktiverVertrag as {mieter?: {vorname?: string; nachname?: string}}).mieter?.vorname} {(aktiverVertrag as {mieter?: {vorname?: string; nachname?: string}}).mieter?.nachname}</span>
                        ) : <Badge variant="secondary">Leer</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => { setEditEinheit(e); reset(e); setEinheitDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" asChild><Link to={`/mieteinheiten/${e.id}`}><ChevronRight className="h-4 w-4" /></Link></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(obj.mieteinheiten?.length ?? 0) === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Keine Einheiten vorhanden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="kosten">
          <div className="flex items-center gap-2 mb-3">
            <Label>Jahr:</Label>
            <Input type="number" value={kostenJahr} onChange={(e) => setKostenJahr(parseInt(e.target.value))} className="w-24" />
            <Button size="sm" asChild><Link to={`/kosten?mietobjektID=${id}`}>Kosten erfassen</Link></Button>
          </div>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Datum</th>
                  <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                  <th className="text-left px-4 py-3 font-medium">Kategorie</th>
                  <th className="text-right px-4 py-3 font-medium">Betrag</th>
                  <th className="text-center px-4 py-3 font-medium">Umlage</th>
                </tr>
              </thead>
              <tbody>
                {kosten.map((k) => (
                  <tr key={k.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-muted-foreground">{new Date(k.datum).toLocaleDateString('de-DE')}</td>
                    <td className="px-4 py-3">{k.bezeichnung}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{k.kategorie}</Badge></td>
                    <td className="px-4 py-3 text-right font-medium">{Number(k.betrag).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={k.umlagefaehig ? 'success' : 'secondary'}>{k.umlagefaehig ? 'Ja' : 'Nein'}</Badge>
                    </td>
                  </tr>
                ))}
                {kosten.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Keine Kosten für {kostenJahr}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <DokumenteAbschnitt bezug={{ mietobjektID: Number(id) }} />

      <Dialog open={einheitDialog} onOpenChange={(o) => { setEinheitDialog(o); if (!o) { setEditEinheit(null); reset(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editEinheit ? 'Einheit bearbeiten' : 'Neue Mieteinheit'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onEinheitSubmit)} className="space-y-3">
            <div>
              <Label>Bezeichnung *</Label>
              <Input {...register('bezeichnung', { required: true })} placeholder="z.B. EG links" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Typ *</Label>
                <Select defaultValue={editEinheit?.typ} onValueChange={(v) => setValue('typ', v as Mieteinheit['typ'])}>
                  <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                  <SelectContent>{EINHEIT_TYPEN.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fläche (m²) *</Label>
                <Input type="number" step="0.01" {...register('flaeche', { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <Label>Zimmer</Label>
                <Input type="number" step="0.5" {...register('zimmeranzahl', { valueAsNumber: true })} />
              </div>
              <div>
                <Label>Etage</Label>
                <Input {...register('etage')} placeholder="EG, OG 1, DG…" />
              </div>
            </div>
            <div>
              <Label>Notizen</Label>
              <Input {...register('notizen')} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createEinheitMut.isPending || updateEinheitMut.isPending}>
                {createEinheitMut.isPending || updateEinheitMut.isPending ? 'Speichern…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
