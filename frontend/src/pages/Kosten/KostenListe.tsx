import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { formatEuro } from '@/lib/utils';
import { Kosten, KategorieMeta, Mieteinheit } from '@/types';

const SCHLUESSEL_LABELS: Record<string, string> = {
  FLAECHE: 'Fläche', PERSONEN: 'Personen', EINHEIT: 'Einheit', VERBRAUCH: 'Verbrauch',
};

const PARAGRAPH_35A_KATEGORIEN = new Set([
  'HAUSMEISTER', 'GARTENPFLEGE', 'GEBAEUDEREINIGUNG',
  'SCHORNSTEINREINIGUNG', 'HEIZUNG', 'WARMWASSER',
]);

export function KostenListe() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [filterObjektID, setFilterObjektID] = useState('ALL');
  const [filterJahr, setFilterJahr] = useState(new Date().getFullYear());
  const [filterUmlagefaehig, setFilterUmlagefaehig] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Kosten | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [selectedKategorie, setSelectedKategorie] = useState('');
  const [isUmlagefaehig, setIsUmlagefaehig] = useState(true);
  const [umlageArt, setUmlageArt] = useState('ALLE_EINHEITEN');
  const [selectedEinheitenIDs, setSelectedEinheitenIDs] = useState<number[]>([]);
  const [dialogObjektID, setDialogObjektID] = useState('');
  const [gemischtAktiv, setGemischtAktiv] = useState(false);
  const [umlageSchluessel2, setUmlageSchluessel2] = useState('PERSONEN');
  const [umlageGewicht1, setUmlageGewicht1] = useState(50);
  const [lohnanteil, setLohnanteil] = useState('');

  const { data: objekte = [] } = useQuery({
    queryKey: ['mietobjekte'],
    queryFn: () => api.mietobjekte.list().then((r) => r.data),
  });

  const { data: kategorien = [] } = useQuery({
    queryKey: ['kosten-kategorien'],
    queryFn: () => api.kosten.kategorien().then((r) => r.data),
  });

  const { data: dialogEinheiten = [] } = useQuery({
    queryKey: ['mieteinheiten', dialogObjektID],
    queryFn: () => api.mieteinheiten.list({ mietobjektID: parseInt(dialogObjektID) }).then((r) => r.data),
    enabled: !!dialogObjektID && umlageArt === 'SPEZIFISCHE_EINHEITEN',
  });

  const { data: kosten = [] } = useQuery({
    queryKey: ['kosten', filterObjektID, filterJahr, filterUmlagefaehig],
    queryFn: () => api.kosten.list({
      ...(filterObjektID !== 'ALL' ? { mietobjektID: parseInt(filterObjektID) } : {}),
      jahr: filterJahr,
      ...(filterUmlagefaehig !== 'ALL' ? { umlagefaehig: filterUmlagefaehig === 'true' } : {}),
    }).then((r) => r.data),
  });

  const { register, handleSubmit, setValue, reset, watch } = useForm<Partial<Kosten> & { bezeichnungInput?: string }>();
  const watchUmlageSchluessel = watch('umlageSchluessel');

  const createMut = useMutation({
    mutationFn: (data: Partial<Kosten> & { umlageEinheitenIDs?: number[] }) => api.kosten.create(data as never),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kosten'] });
      setDialogOpen(false);
      resetDialog();
      toast({ title: 'Kosten erfasst', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Kosten> & { umlageEinheitenIDs?: number[] } }) =>
      api.kosten.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kosten'] });
      setDialogOpen(false);
      setEditItem(null);
      resetDialog();
      toast({ title: 'Kosten aktualisiert', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.kosten.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kosten'] });
      setDeleteId(null);
      toast({ title: 'Kosten gelöscht' });
    },
    onError: () => toast({ title: 'Fehler beim Löschen', variant: 'destructive' }),
  });

  const resetDialog = () => {
    reset();
    setSelectedKategorie('');
    setIsUmlagefaehig(true);
    setUmlageArt('ALLE_EINHEITEN');
    setSelectedEinheitenIDs([]);
    setDialogObjektID('');
    setGemischtAktiv(false);
    setUmlageSchluessel2('PERSONEN');
    setUmlageGewicht1(50);
    setLohnanteil('');
  };

  const openCreate = () => {
    setEditItem(null);
    resetDialog();
    reset({ datum: new Date().toISOString().slice(0, 10), umlageSchluessel: 'FLAECHE' });
    setDialogOpen(true);
  };

  const openEdit = (k: Kosten) => {
    setEditItem(k);
    setSelectedKategorie(k.kategorie);
    setIsUmlagefaehig(k.umlagefaehig);
    setUmlageArt(k.umlageArt);
    setDialogObjektID(k.mietobjektID.toString());
    const hatGemischt = !!k.umlageSchluessel2;
    setGemischtAktiv(hatGemischt);
    setUmlageSchluessel2(k.umlageSchluessel2 ?? 'PERSONEN');
    setUmlageGewicht1(k.umlageGewicht1 != null ? Math.round(Number(k.umlageGewicht1) * 100) : 50);
    setLohnanteil(k.lohnanteil != null ? String(Number(k.lohnanteil)) : '');
    reset({ ...k, datum: k.datum?.slice(0, 10) });
    setDialogOpen(true);
  };

  const handleKategorieChange = (val: string) => {
    setSelectedKategorie(val);
    const meta = kategorien.find((k: KategorieMeta) => k.key === val);
    if (meta) {
      setIsUmlagefaehig(meta.umlagefaehig);
      setValue('umlagefaehig', meta.umlagefaehig);
      setValue('umlageSchluessel', meta.schluessel);
    }
    setValue('kategorie', val as Kosten['kategorie']);
  };

  const onSubmit = (data: Partial<Kosten>) => {
    const payload = {
      ...data,
      mietobjektID: parseInt(dialogObjektID),
      kategorie: selectedKategorie as Kosten['kategorie'],
      umlagefaehig: isUmlagefaehig,
      umlageArt: umlageArt as Kosten['umlageArt'],
      umlageEinheitenIDs: umlageArt === 'SPEZIFISCHE_EINHEITEN' ? selectedEinheitenIDs : undefined,
      jahr: data.datum ? new Date(data.datum).getFullYear() : new Date().getFullYear(),
      verbrauchswert: data.verbrauchswert != null && !isNaN(data.verbrauchswert) ? data.verbrauchswert : undefined,
      verbrauchEinheit: data.verbrauchEinheit || undefined,
      umlageSchluessel2: gemischtAktiv ? (umlageSchluessel2 as Kosten['umlageSchluessel']) : undefined,
      umlageGewicht1: gemischtAktiv ? umlageGewicht1 / 100 : undefined,
      lohnanteil: PARAGRAPH_35A_KATEGORIEN.has(selectedKategorie) && lohnanteil
        ? parseFloat(lohnanteil)
        : undefined,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, data: payload });
    else createMut.mutate(payload as never);
  };

  const toggleEinheit = (eid: number) => {
    setSelectedEinheitenIDs((prev) =>
      prev.includes(eid) ? prev.filter((x) => x !== eid) : [...prev, eid]
    );
  };

  const gesamtBetrag = kosten.reduce((s, k) => s + Number(k.betrag), 0);
  const umlagefaehigBetrag = kosten.filter((k) => k.umlagefaehig).reduce((s, k) => s + Number(k.betrag), 0);

  return (
    <div>
      <PageHeader
        title="Kosten"
        description="Betriebskosten und Ausgaben verwalten"
        action={{ label: 'Kosten erfassen', onClick: openCreate }}
      >
        <div className="flex items-center gap-2">
          <Select value={filterObjektID} onValueChange={setFilterObjektID}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Alle Mietobjekte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alle Mietobjekte</SelectItem>
              {objekte.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.bezeichnung}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={filterJahr}
            onChange={(e) => setFilterJahr(parseInt(e.target.value))}
            className="w-24"
          />
          <Select value={filterUmlagefaehig} onValueChange={setFilterUmlagefaehig}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Umlagefähig" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alle</SelectItem>
              <SelectItem value="true">Umlagefähig</SelectItem>
              <SelectItem value="false">Nicht umlagefähig</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Datum</th>
              <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
              <th className="text-left px-4 py-3 font-medium">Kategorie</th>
              <th className="text-left px-4 py-3 font-medium">Mietobjekt</th>
              <th className="text-right px-4 py-3 font-medium">Betrag</th>
              <th className="text-center px-4 py-3 font-medium">Umlagefähig</th>
              <th className="text-left px-4 py-3 font-medium">Schlüssel</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {kosten.map((k) => (
              <tr key={k.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-muted-foreground">{new Date(k.datum).toLocaleDateString('de-DE')}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{k.bezeichnung}</p>
                  {k.anbieter && <p className="text-xs text-muted-foreground">{k.anbieter}</p>}
                </td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{k.kategorie.replace(/_/g, ' ')}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{(k.mietobjekt as { bezeichnung?: string })?.bezeichnung ?? '–'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatEuro(Number(k.betrag))}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={k.umlagefaehig ? 'success' : 'secondary'}>{k.umlagefaehig ? 'Ja' : 'Nein'}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {k.umlagefaehig
                    ? k.umlageSchluessel2
                      ? `${SCHLUESSEL_LABELS[k.umlageSchluessel]} / ${SCHLUESSEL_LABELS[k.umlageSchluessel2]} (${Math.round((k.umlageGewicht1 ?? 0.5) * 100)}/${Math.round((1 - (k.umlageGewicht1 ?? 0.5)) * 100)})`
                      : (SCHLUESSEL_LABELS[k.umlageSchluessel] ?? k.umlageSchluessel)
                    : '–'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(k)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(k.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {kosten.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Keine Kosten gefunden</td></tr>
            )}
            {kosten.length > 0 && (
              <tr className="bg-gray-50 border-t font-medium">
                <td colSpan={4} className="px-4 py-3 text-right text-muted-foreground">Gesamt:</td>
                <td className="px-4 py-3 text-right">{formatEuro(gesamtBetrag)}</td>
                <td colSpan={3} className="px-4 py-3 text-muted-foreground text-sm">davon umlagefähig: {formatEuro(umlagefaehigBetrag)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditItem(null); resetDialog(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Kosten bearbeiten' : 'Kosten erfassen'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Mietobjekt *</Label>
                <Select
                  value={dialogObjektID}
                  onValueChange={(v) => { setDialogObjektID(v); setValue('mietobjektID', parseInt(v)); setSelectedEinheitenIDs([]); }}
                >
                  <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                  <SelectContent>{objekte.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.bezeichnung}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Kategorie *</Label>
                <Select value={selectedKategorie} onValueChange={handleKategorieChange}>
                  <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                  <SelectContent>
                    {kategorien.map((k: KategorieMeta) => (
                      <SelectItem key={k.key} value={k.key}>
                        {k.label} {k.umlagefaehig ? '' : '(nicht umlagefähig)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Bezeichnung *</Label>
                <Input {...register('bezeichnung', { required: true })} />
              </div>
              <div>
                <Label>Betrag (€) *</Label>
                <Input type="number" step="0.01" {...register('betrag', { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <Label>Datum *</Label>
                <Input type="date" {...register('datum', { required: true })} />
              </div>
              <div>
                <Label>Belegnummer</Label>
                <Input {...register('belegNummer')} />
              </div>
              <div>
                <Label>Anbieter</Label>
                <Input {...register('anbieter')} />
              </div>

              {PARAGRAPH_35A_KATEGORIEN.has(selectedKategorie) && (
                <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <Label className="text-amber-800 font-medium">Lohnanteil §35a EStG (€) – optional</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={lohnanteil}
                    onChange={(e) => setLohnanteil(e.target.value)}
                    placeholder="0,00"
                    className="mt-1"
                  />
                  <p className="text-xs text-amber-700 mt-1">
                    Nur Lohn-, Fahrt- und Maschinenkosten eintragen – keine Materialkosten. Dieser Betrag erscheint in der §35a-Bescheinigung der Nebenkostenabrechnung.
                  </p>
                </div>
              )}

              <div className="col-span-2 border-t pt-3">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="umlagefaehig"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={isUmlagefaehig}
                    onChange={(e) => { setIsUmlagefaehig(e.target.checked); setValue('umlagefaehig', e.target.checked); }}
                  />
                  <Label htmlFor="umlagefaehig">Umlagefähig (BetrKV § 2)</Label>
                </div>

                {isUmlagefaehig && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Umlage-Schlüssel</Label>
                      <Select
                        value={watchUmlageSchluessel}
                        onValueChange={(v) => setValue('umlageSchluessel', v as Kosten['umlageSchluessel'])}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FLAECHE">Fläche (m²)</SelectItem>
                          <SelectItem value="PERSONEN">Personen</SelectItem>
                          <SelectItem value="EINHEIT">Einheit (gleich)</SelectItem>
                          <SelectItem value="VERBRAUCH">Verbrauch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Umlage-Art</Label>
                      <Select value={umlageArt} onValueChange={setUmlageArt}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALLE_EINHEITEN">Alle Einheiten</SelectItem>
                          <SelectItem value="SPEZIFISCHE_EINHEITEN">Spezifische Einheiten</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={gemischtAktiv}
                          onChange={(e) => setGemischtAktiv(e.target.checked)}
                        />
                        <span className="text-sm font-medium">Gemischter Schlüssel (zwei Verteilungsarten)</span>
                      </label>
                    </div>

                    {gemischtAktiv && (
                      <>
                        <div>
                          <Label>2. Schlüssel</Label>
                          <Select value={umlageSchluessel2} onValueChange={setUmlageSchluessel2}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FLAECHE">Fläche (m²)</SelectItem>
                              <SelectItem value="PERSONEN">Personen</SelectItem>
                              <SelectItem value="EINHEIT">Einheit (gleich)</SelectItem>
                              <SelectItem value="VERBRAUCH">Verbrauch</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Anteil 1. Schlüssel: {umlageGewicht1} %</Label>
                          <input
                            type="range"
                            min={1}
                            max={99}
                            step={1}
                            value={umlageGewicht1}
                            onChange={(e) => setUmlageGewicht1(parseInt(e.target.value))}
                            className="w-full mt-2"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {SCHLUESSEL_LABELS[watchUmlageSchluessel ?? 'FLAECHE']}: {umlageGewicht1}% / {SCHLUESSEL_LABELS[umlageSchluessel2]}: {100 - umlageGewicht1}%
                          </p>
                        </div>
                      </>
                    )}

                    {watchUmlageSchluessel === 'VERBRAUCH' && (
                      <>
                        <div>
                          <Label>Verbrauchswert</Label>
                          <Input type="number" step="0.001" {...register('verbrauchswert', { valueAsNumber: true })} />
                        </div>
                        <div>
                          <Label>Einheit (z.B. kWh, m³)</Label>
                          <Input {...register('verbrauchEinheit')} />
                        </div>
                      </>
                    )}

                    {umlageArt === 'SPEZIFISCHE_EINHEITEN' && dialogObjektID && (
                      <div className="col-span-2">
                        <Label>Einheiten auswählen</Label>
                        <div className="mt-2 space-y-1 border rounded-md p-3">
                          {dialogEinheiten.length === 0 && (
                            <p className="text-sm text-muted-foreground">Keine Einheiten vorhanden</p>
                          )}
                          {dialogEinheiten.map((e: Mieteinheit) => (
                            <label key={e.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300"
                                checked={selectedEinheitenIDs.includes(e.id)}
                                onChange={() => toggleEinheit(e.id)}
                              />
                              <span className="text-sm">{e.bezeichnung} ({Number(e.flaeche).toFixed(1)} m²)</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <Label>Notizen</Label>
                <Input {...register('notizen')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? 'Speichern…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Kosten löschen"
        description="Diese Kostenbuchung wird unwiderruflich gelöscht."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
        confirmLabel="Löschen"
        variant="destructive"
      />
    </div>
  );
}
