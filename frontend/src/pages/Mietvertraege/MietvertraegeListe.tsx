import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Pencil, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { formatEuro, formatDatum } from '@/lib/utils';
import { Mietvertrag } from '@/types';

const STATUS_LABELS: Record<string, string> = { AKTIV: 'Aktiv', BEENDET: 'Beendet', GEKUENDIGT: 'Gekündigt' };
const STATUS_VARIANTS: Record<string, string> = { AKTIV: 'success', BEENDET: 'secondary', GEKUENDIGT: 'warning' };

export function MietvertraegeListe() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Mietvertrag | null>(null);

  const { data: vertraege = [] } = useQuery({
    queryKey: ['mietvertraege', statusFilter],
    queryFn: () => api.mietvertraege.list(statusFilter !== 'ALL' ? { status: statusFilter } : undefined).then((r) => r.data),
  });

  const { data: einheiten = [] } = useQuery({
    queryKey: ['mieteinheiten'],
    queryFn: () => api.mieteinheiten.list().then((r) => r.data),
  });

  const { data: mieterListe = [] } = useQuery({
    queryKey: ['mieter'],
    queryFn: () => api.mieter.list().then((r) => r.data),
  });

  const { register, handleSubmit, setValue, reset, watch } = useForm<Partial<Mietvertrag>>();
  const kautionBezahlt = watch('kautionBezahlt');

  const createMut = useMutation({
    mutationFn: (data: Partial<Mietvertrag>) => api.mietvertraege.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietvertraege'] });
      setDialogOpen(false);
      reset();
      toast({ title: 'Mietvertrag angelegt', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Mietvertrag> }) =>
      api.mietvertraege.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietvertraege'] });
      setDialogOpen(false);
      setEditItem(null);
      reset();
      toast({ title: 'Mietvertrag aktualisiert', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const onSubmit = (data: Partial<Mietvertrag>) => {
    if (editItem) updateMut.mutate({ id: editItem.id, data });
    else createMut.mutate(data);
  };

  const openCreate = () => {
    setEditItem(null);
    reset({ kuendigungsfristMonate: 3, personenAnzahl: 1, zahlungstag: 1, kautionBezahlt: false });
    setDialogOpen(true);
  };

  const openEdit = (v: Mietvertrag) => {
    setEditItem(v);
    reset({
      ...v,
      beginn: v.beginn?.slice(0, 10),
      ende: v.ende?.slice(0, 10),
    });
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Mietverträge"
        description="Alle Mietverträge verwalten"
        action={{ label: 'Neuer Vertrag', onClick: openCreate }}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Alle Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle Status</SelectItem>
            <SelectItem value="AKTIV">Aktiv</SelectItem>
            <SelectItem value="GEKUENDIGT">Gekündigt</SelectItem>
            <SelectItem value="BEENDET">Beendet</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Vertragsnr.</th>
              <th className="text-left px-4 py-3 font-medium">Einheit</th>
              <th className="text-left px-4 py-3 font-medium">Mieter</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Kaltmiete + NK</th>
              <th className="text-left px-4 py-3 font-medium">Laufzeit</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {vertraege.map((v) => (
              <tr key={v.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium font-mono text-xs">{v.vertragsnummer}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{(v.mieteinheit as { bezeichnung?: string })?.bezeichnung}</p>
                  <p className="text-xs text-muted-foreground">{(v.mieteinheit as { mietobjekt?: { bezeichnung?: string } })?.mietobjekt?.bezeichnung}</p>
                </td>
                <td className="px-4 py-3">
                  {v.mieter?.vorname} {v.mieter?.nachname}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANTS[v.status] as never}>{STATUS_LABELS[v.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <p>{formatEuro(Number(v.kaltmiete))}</p>
                  <p className="text-xs text-muted-foreground">+ NK {formatEuro(Number(v.nebenkostenVorauszahlung))}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDatum(v.beginn)} –<br />{v.ende ? formatDatum(v.ende) : 'unbefristet'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/mietvertraege/${v.id}`}><ChevronRight className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {vertraege.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Keine Mietverträge gefunden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditItem(null); reset(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Mietvertrag bearbeiten' : 'Neuer Mietvertrag'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mieteinheit *</Label>
                <Select
                  defaultValue={editItem?.mieteinheitID?.toString()}
                  onValueChange={(v) => setValue('mieteinheitID', parseInt(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                  <SelectContent>
                    {einheiten.map((e) => (
                      <SelectItem key={e.id} value={e.id.toString()}>
                        {(e.mietobjekt as { bezeichnung?: string })?.bezeichnung} – {e.bezeichnung}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mieter *</Label>
                <Select
                  defaultValue={editItem?.mieterID?.toString()}
                  onValueChange={(v) => setValue('mieterID', parseInt(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                  <SelectContent>
                    {mieterListe.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.vorname} {m.nachname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vertragsnummer *</Label>
                <Input {...register('vertragsnummer', { required: true })} placeholder="z.B. MV-2024-001" />
              </div>
              <div>
                <Label>Zahlungstag (1–28) *</Label>
                <Input type="number" min={1} max={28} {...register('zahlungstag', { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <Label>Beginn *</Label>
                <Input type="date" {...register('beginn', { required: true })} />
              </div>
              <div>
                <Label>Ende (leer = unbefristet)</Label>
                <Input type="date" {...register('ende')} />
              </div>
              <div>
                <Label>Kaltmiete (€) *</Label>
                <Input type="number" step="0.01" {...register('kaltmiete', { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <Label>NK-Vorauszahlung (€) *</Label>
                <Input type="number" step="0.01" {...register('nebenkostenVorauszahlung', { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <Label>Kaution (€)</Label>
                <Input type="number" step="0.01" {...register('kaution', { valueAsNumber: true })} />
              </div>
              <div>
                <Label>Personen *</Label>
                <Input type="number" min={1} {...register('personenAnzahl', { required: true, valueAsNumber: true })} />
              </div>
              <div>
                <Label>Kündigungsfrist (Monate)</Label>
                <Input type="number" min={0} {...register('kuendigungsfristMonate', { valueAsNumber: true })} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="kautionBezahlt"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={!!kautionBezahlt}
                  onChange={(e) => setValue('kautionBezahlt', e.target.checked)}
                />
                <Label htmlFor="kautionBezahlt">Kaution bezahlt</Label>
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
    </div>
  );
}
