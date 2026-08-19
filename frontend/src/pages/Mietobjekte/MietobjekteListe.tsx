import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Building2, Pencil, Trash2, ChevronRight, Search } from 'lucide-react';
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
import { Mietobjekt } from '@/types';

const TYPEN = [
  { value: 'MEHRFAMILIENHAUS', label: 'Mehrfamilienhaus' },
  { value: 'EINFAMILIENHAUS', label: 'Einfamilienhaus' },
  { value: 'GEWERBEGEBAEUDE', label: 'Gewerbegebäude' },
  { value: 'GEMISCHT', label: 'Gemischt' },
  { value: 'SONSTIGES', label: 'Sonstiges' },
];

const HEIZTYPEN = [
  { value: 'ZENTRALHEIZUNG', label: 'Zentralheizung' },
  { value: 'ETAGENHEIZUNG', label: 'Etagenheizung' },
  { value: 'FERNWAERME', label: 'Fernwärme' },
  { value: 'ELEKTRO', label: 'Elektro' },
  { value: 'SONSTIGE', label: 'Sonstige' },
];

function MietobjektForm({ defaultValues, onSubmit, loading, eigentuemer }: {
  defaultValues?: Partial<Mietobjekt>;
  onSubmit: (data: Partial<Mietobjekt>) => void;
  loading: boolean;
  eigentuemer: Array<{ id: number; vorname: string; nachname: string }>;
}) {
  const { register, handleSubmit, setValue } = useForm<Partial<Mietobjekt>>({ defaultValues });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Bezeichnung *</Label>
          <Input {...register('bezeichnung', { required: true })} placeholder="z.B. Mehrfamilienhaus Musterstr. 5" />
        </div>
        <div>
          <Label>Typ *</Label>
          <Select defaultValue={defaultValues?.typ} onValueChange={(v) => setValue('typ', v as Mietobjekt['typ'])}>
            <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
            <SelectContent>{TYPEN.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Heizungstyp</Label>
          <Select defaultValue={defaultValues?.heizungstyp} onValueChange={(v) => setValue('heizungstyp', v as Mietobjekt['heizungstyp'])}>
            <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
            <SelectContent>{HEIZTYPEN.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Straße *</Label>
          <Input {...register('strasse', { required: true })} />
        </div>
        <div>
          <Label>Hausnummer *</Label>
          <Input {...register('hausnummer', { required: true })} />
        </div>
        <div>
          <Label>PLZ *</Label>
          <Input {...register('plz', { required: true })} />
        </div>
        <div>
          <Label>Ort *</Label>
          <Input {...register('ort', { required: true })} />
        </div>
        <div>
          <Label>Baujahr</Label>
          <Input type="number" {...register('baujahr', { valueAsNumber: true })} />
        </div>
        <div>
          <Label>Eigentümer *</Label>
          <Select defaultValue={defaultValues?.eigentuemerID?.toString()} onValueChange={(v) => setValue('eigentuemerID', parseInt(v))}>
            <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
            <SelectContent>{eigentuemer.map((e) => <SelectItem key={e.id} value={e.id.toString()}>{e.vorname} {e.nachname}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Notizen</Label>
          <Input {...register('notizen')} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading ? 'Speichern…' : 'Speichern'}</Button>
      </DialogFooter>
    </form>
  );
}

export function MietobjekteListe() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Mietobjekt | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [suche, setSuche] = useState('');

  const { data: objekte = [] } = useQuery({ queryKey: ['mietobjekte'], queryFn: () => api.mietobjekte.list().then((r) => r.data) });
  const { data: eigentuemer = [] } = useQuery({ queryKey: ['eigentuemer'], queryFn: () => api.eigentuemer.list().then((r) => r.data) });

  const createMut = useMutation({
    mutationFn: (data: Partial<Mietobjekt>) => api.mietobjekte.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mietobjekte'] }); setDialogOpen(false); toast({ title: 'Mietobjekt angelegt', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Mietobjekt> }) => api.mietobjekte.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mietobjekte'] }); setDialogOpen(false); setEditItem(null); toast({ title: 'Mietobjekt aktualisiert', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.mietobjekte.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mietobjekte'] }); setDeleteId(null); toast({ title: 'Mietobjekt deaktiviert' }); },
  });

  const typLabel = (typ: string) => TYPEN.find((t) => t.value === typ)?.label ?? typ;

  const term = suche.toLowerCase();
  const gefiltert = objekte.filter((o) =>
    !suche ||
    [o.bezeichnung, o.ort, o.eigentuemer?.vorname ?? '', o.eigentuemer?.nachname ?? ''].join(' ').toLowerCase().includes(term)
  );

  return (
    <div>
      <PageHeader
        title="Mietobjekte"
        description="Alle Gebäude und Immobilien"
        action={{ label: 'Mietobjekt anlegen', onClick: () => { setEditItem(null); setDialogOpen(true); } }}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Bezeichnung, Ort oder Eigentümer…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
              <th className="text-left px-4 py-3 font-medium">Typ</th>
              <th className="text-left px-4 py-3 font-medium">Adresse</th>
              <th className="text-left px-4 py-3 font-medium">Eigentümer</th>
              <th className="text-center px-4 py-3 font-medium">Einheiten</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((o) => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="font-medium">{o.bezeichnung}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><Badge variant="outline">{typLabel(o.typ)}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{o.strasse} {o.hausnummer}, {o.plz} {o.ort}</td>
                <td className="px-4 py-3 text-muted-foreground">{o.eigentuemer?.vorname} {o.eigentuemer?.nachname}</td>
                <td className="px-4 py-3 text-center">{o._count?.mieteinheiten ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => { setEditItem(o); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    <Button variant="ghost" size="icon" asChild><Link to={`/mietobjekte/${o.id}`}><ChevronRight className="h-4 w-4" /></Link></Button>
                  </div>
                </td>
              </tr>
            ))}
            {gefiltert.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                {suche ? 'Keine Treffer für Ihre Suche' : 'Keine Mietobjekte vorhanden'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? 'Mietobjekt bearbeiten' : 'Neues Mietobjekt'}</DialogTitle></DialogHeader>
          <MietobjektForm
            defaultValues={editItem ?? {}}
            onSubmit={(d) => editItem ? updateMut.mutate({ id: editItem.id, data: d }) : createMut.mutate(d)}
            loading={createMut.isPending || updateMut.isPending}
            eigentuemer={eigentuemer}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}
        title="Mietobjekt deaktivieren" description="Das Mietobjekt wird deaktiviert."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending}
        confirmLabel="Deaktivieren" variant="destructive"
      />
    </div>
  );
}
