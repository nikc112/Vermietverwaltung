import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Pencil, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { formatEuro, formatDatum, MONATE } from '@/lib/utils';
import { Mietzahlung } from '@/types';
import { DokumenteAbschnitt } from '@/pages/Dokumente/DokumenteAbschnitt';

const STATUS_LABELS: Record<string, string> = { AKTIV: 'Aktiv', BEENDET: 'Beendet', GEKUENDIGT: 'Gekündigt' };
const STATUS_VARIANTS: Record<string, string> = { AKTIV: 'success', BEENDET: 'secondary', GEKUENDIGT: 'warning' };

const ZAHLUNGSARTEN = [
  { value: 'UEBERWEISUNG', label: 'Überweisung' },
  { value: 'LASTSCHRIFT', label: 'Lastschrift' },
  { value: 'BAR', label: 'Bar' },
  { value: 'SONSTIGE', label: 'Sonstige' },
];

export function MietvertragDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [zahlungsJahr, setZahlungsJahr] = useState(new Date().getFullYear());
  const [zahlungDialog, setZahlungDialog] = useState(false);
  const [editZahlung, setEditZahlung] = useState<Mietzahlung | null>(null);
  const [kuendigenDialog, setKuendigenDialog] = useState(false);
  const [kuendigungsdatum, setKuendigungsdatum] = useState('');

  const { data: vertrag, isLoading } = useQuery({
    queryKey: ['mietvertraege', id],
    queryFn: () => api.mietvertraege.get(Number(id)).then((r) => r.data),
  });

  const { data: zahlungen = [] } = useQuery({
    queryKey: ['mietzahlungen', id, zahlungsJahr],
    queryFn: () => api.mietzahlungen.list({ mietvertragID: Number(id), jahr: zahlungsJahr }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: abrechnungen = [] } = useQuery({
    queryKey: ['nebenkosten', id],
    queryFn: () => api.nebenkosten.list({ mietvertragID: Number(id) }).then((r) => r.data),
    enabled: !!id,
  });

  const { register, handleSubmit, setValue, reset, watch } = useForm<Partial<Mietzahlung>>();
  const eingegangen = watch('eingegangen');

  const bulkMut = useMutation({
    mutationFn: () => api.mietzahlungen.bulkAnlegen(Number(id), zahlungsJahr),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietzahlungen', id, zahlungsJahr] });
      toast({ title: `Zahlungen für ${zahlungsJahr} angelegt`, variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Anlegen', variant: 'destructive' }),
  });

  const updateZahlungMut = useMutation({
    mutationFn: ({ zid, data }: { zid: number; data: Partial<Mietzahlung> }) =>
      api.mietzahlungen.update(zid, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietzahlungen', id, zahlungsJahr] });
      setZahlungDialog(false);
      setEditZahlung(null);
      reset();
      toast({ title: 'Zahlung aktualisiert', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  const kuendigenMut = useMutation({
    mutationFn: () => api.mietvertraege.kuendigen(Number(id), kuendigungsdatum),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietvertraege', id] });
      setKuendigenDialog(false);
      toast({ title: 'Vertrag gekündigt', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Laden…</div>;
  if (!vertrag) return <div className="text-center py-12 text-muted-foreground">Nicht gefunden</div>;

  const zahlungByMonat = Object.fromEntries(zahlungen.map((z) => [z.monat, z]));

  const downloadPdf = async (id: number, jahr: number) => {
    const res = await api.nebenkosten.downloadPdf(id);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nebenkostenabrechnung_${jahr}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onZahlungSubmit = (data: Partial<Mietzahlung>) => {
    const clean: Partial<Mietzahlung> = {
      ...data,
      istBetrag: data.istBetrag != null && !isNaN(data.istBetrag) ? data.istBetrag : undefined,
      eingangsdat: data.eingangsdat || undefined,
      notizen: data.notizen ?? undefined,
    };
    if (editZahlung) updateZahlungMut.mutate({ zid: editZahlung.id, data: clean });
  };

  const openZahlungEdit = (z: Mietzahlung) => {
    setEditZahlung(z);
    reset({
      istBetrag: z.istBetrag,
      eingegangen: z.eingegangen,
      eingangsdat: z.eingangsdat?.slice(0, 10),
      zahlungsart: z.zahlungsart,
      notizen: z.notizen,
    });
    setZahlungDialog(true);
  };

  const einheit = vertrag.mieteinheit as { id?: number; bezeichnung?: string; flaeche?: number; etage?: string; mietobjekt?: { id?: number; bezeichnung?: string } };
  const mieter = vertrag.mieter;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/mietvertraege"><ArrowLeft className="h-4 w-4 mr-1" /> Mietverträge</Link>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-mono">{vertrag.vertragsnummer}</h1>
          <Badge variant={STATUS_VARIANTS[vertrag.status] as never} className="mt-1">{STATUS_LABELS[vertrag.status]}</Badge>
        </div>
        {vertrag.status === 'AKTIV' && (
          <Button variant="destructive" size="sm" onClick={() => setKuendigenDialog(true)}>
            Kündigen
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Mieteinheit</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <Link to={`/mieteinheiten/${einheit?.id}`} className="font-medium text-blue-600 hover:underline">
                {einheit?.bezeichnung}
              </Link>
            </div>
            {einheit?.mietobjekt && (
              <div>
                <Link to={`/mietobjekte/${einheit.mietobjekt.id}`} className="text-muted-foreground hover:underline">
                  {einheit.mietobjekt.bezeichnung}
                </Link>
              </div>
            )}
            {einheit?.flaeche && <div><span className="text-muted-foreground">Fläche: </span>{Number(einheit.flaeche).toFixed(1)} m²</div>}
            {einheit?.etage && <div><span className="text-muted-foreground">Etage: </span>{einheit.etage}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mieter</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <Link to={`/mieter/${mieter?.id}`} className="font-medium text-blue-600 hover:underline">
                {mieter?.vorname} {mieter?.nachname}
              </Link>
            </div>
            {mieter?.email && <div className="text-muted-foreground">{mieter.email}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vertragsdaten</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Kaltmiete: </span><span className="font-medium">{formatEuro(Number(vertrag.kaltmiete))}</span></div>
            <div><span className="text-muted-foreground">NK-Vorauszahlung: </span>{formatEuro(Number(vertrag.nebenkostenVorauszahlung))}</div>
            <div><span className="text-muted-foreground">Kaution: </span>{formatEuro(Number(vertrag.kaution))} {vertrag.kautionBezahlt ? <span className="text-green-600 text-xs">(bezahlt)</span> : <span className="text-orange-500 text-xs">(ausstehend)</span>}</div>
            <div><span className="text-muted-foreground">Laufzeit: </span>{formatDatum(vertrag.beginn)} – {vertrag.ende ? formatDatum(vertrag.ende) : 'unbefristet'}</div>
            <div><span className="text-muted-foreground">Zahlungstag: </span>{vertrag.zahlungstag}. des Monats</div>
            <div><span className="text-muted-foreground">Personen: </span>{vertrag.personenAnzahl}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="zahlungen">
        <TabsList>
          <TabsTrigger value="zahlungen">Mietzahlungen</TabsTrigger>
          <TabsTrigger value="abrechnungen">Nebenkostenabrechnungen</TabsTrigger>
        </TabsList>

        <TabsContent value="zahlungen">
          <div className="flex items-center gap-3 mb-3">
            <Label>Jahr:</Label>
            <Input
              type="number"
              value={zahlungsJahr}
              onChange={(e) => setZahlungsJahr(parseInt(e.target.value))}
              className="w-24"
            />
            <Button size="sm" variant="outline" onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}>
              {bulkMut.isPending ? 'Anlegen…' : `${zahlungsJahr} anlegen`}
            </Button>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Monat</th>
                  <th className="text-right px-4 py-3 font-medium">Soll</th>
                  <th className="text-right px-4 py-3 font-medium">Ist</th>
                  <th className="text-center px-4 py-3 font-medium">Eingegangen</th>
                  <th className="text-left px-4 py-3 font-medium">Zahlungsart</th>
                  <th className="text-left px-4 py-3 font-medium">Datum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {MONATE.map((monatName, idx) => {
                  const monat = idx + 1;
                  const z = zahlungByMonat[monat];
                  return (
                    <tr key={monat} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{monatName}</td>
                      <td className="px-4 py-3 text-right">{z ? formatEuro(Number(z.sollBetrag)) : <span className="text-muted-foreground">–</span>}</td>
                      <td className="px-4 py-3 text-right">{z?.istBetrag != null ? formatEuro(Number(z.istBetrag)) : <span className="text-muted-foreground">–</span>}</td>
                      <td className="px-4 py-3 text-center">
                        {z ? (
                          z.eingegangen
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500 font-bold">✗</span>
                        ) : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {z?.zahlungsart ? ZAHLUNGSARTEN.find((a) => a.value === z.zahlungsart)?.label : '–'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {z?.eingangsdat ? formatDatum(z.eingangsdat) : '–'}
                      </td>
                      <td className="px-4 py-3">
                        {z && (
                          <Button variant="ghost" size="icon" onClick={() => openZahlungEdit(z)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="abrechnungen">
          <div className="flex justify-end mb-3">
            <Button size="sm" asChild>
              <Link to="/nebenkosten">+ Neue Abrechnung erstellen</Link>
            </Button>
          </div>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Jahr</th>
                  <th className="text-right px-4 py-3 font-medium">Gesamtkosten</th>
                  <th className="text-right px-4 py-3 font-medium">Mieteranteil</th>
                  <th className="text-right px-4 py-3 font-medium">Geleistete VZ</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo</th>
                  <th className="text-center px-4 py-3 font-medium">PDF</th>
                </tr>
              </thead>
              <tbody>
                {abrechnungen.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{a.abrechnungsjahr}</td>
                    <td className="px-4 py-3 text-right">{formatEuro(Number(a.gesamtkosten))}</td>
                    <td className="px-4 py-3 text-right">{formatEuro(Number(a.mieterAnteil))}</td>
                    <td className="px-4 py-3 text-right">{formatEuro(Number(a.geleisteteVZ))}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${Number(a.saldo) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatEuro(Number(a.saldo))}
                      <span className="text-xs font-normal ml-1">{Number(a.saldo) > 0 ? '(Nachzahlung)' : '(Guthaben)'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.hatPdf ? (
                        <Button variant="ghost" size="icon" onClick={() => downloadPdf(a.id, a.abrechnungsjahr)}>
                          <FileText className="h-4 w-4 text-blue-600" />
                        </Button>
                      ) : <span className="text-muted-foreground text-xs">–</span>}
                    </td>
                  </tr>
                ))}
                {abrechnungen.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Keine Abrechnungen vorhanden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <DokumenteAbschnitt bezug={{ mietvertragID: Number(id) }} />

      {/* Zahlungs-Dialog */}
      <Dialog open={zahlungDialog} onOpenChange={(o) => { setZahlungDialog(o); if (!o) { setEditZahlung(null); reset(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Zahlung bearbeiten — {editZahlung ? MONATE[editZahlung.monat - 1] : ''} {zahlungsJahr}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onZahlungSubmit)} className="space-y-3">
            <div>
              <Label>Ist-Betrag (€)</Label>
              <Input type="number" step="0.01" {...register('istBetrag', { valueAsNumber: true })} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="eingegangen"
                className="h-4 w-4 rounded border-gray-300"
                checked={!!eingegangen}
                onChange={(e) => setValue('eingegangen', e.target.checked)}
              />
              <Label htmlFor="eingegangen">Eingegangen</Label>
            </div>
            {eingegangen && (
              <div>
                <Label>Eingangsdatum</Label>
                <Input type="date" {...register('eingangsdat')} />
              </div>
            )}
            <div>
              <Label>Zahlungsart</Label>
              <Select
                defaultValue={editZahlung?.zahlungsart}
                onValueChange={(v) => setValue('zahlungsart', v as Mietzahlung['zahlungsart'])}
              >
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>
                  {ZAHLUNGSARTEN.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notizen</Label>
              <Input {...register('notizen')} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateZahlungMut.isPending}>
                {updateZahlungMut.isPending ? 'Speichern…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kündigen-Dialog */}
      <Dialog open={kuendigenDialog} onOpenChange={setKuendigenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mietvertrag kündigen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bitte geben Sie das Kündigungsdatum (Ende des Mietverhältnisses) an.
            </p>
            <div>
              <Label>Kündigungsdatum *</Label>
              <Input type="date" value={kuendigungsdatum} onChange={(e) => setKuendigungsdatum(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKuendigenDialog(false)}>Abbrechen</Button>
            <Button
              variant="destructive"
              disabled={!kuendigungsdatum || kuendigenMut.isPending}
              onClick={() => kuendigenMut.mutate()}
            >
              {kuendigenMut.isPending ? 'Kündigen…' : 'Kündigen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
