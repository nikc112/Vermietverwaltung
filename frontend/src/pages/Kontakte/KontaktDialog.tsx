import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { KommunikationFelder } from '@/components/shared/KommunikationFelder';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { Kontakt, KontaktPayload, KontaktRollenTyp, KontaktKommunikation, Ansprechpartner, Anrede } from '@/types';

const ANREDEN = [
  { value: 'HERR', label: 'Herr' }, { value: 'FRAU', label: 'Frau' },
  { value: 'DIVERS', label: 'Divers' }, { value: 'FIRMA', label: 'Firma' },
];

export const ROLLEN_LABELS: Record<KontaktRollenTyp, string> = {
  MIETER: 'Mieter', EIGENTUEMER: 'Eigentümer', DIENSTLEISTER: 'Dienstleister',
  VERSORGER: 'Versorger', BEHOERDE: 'Behörde', SONSTIGE: 'Sonstige',
};

type Stammdaten = Omit<KontaktPayload, 'rollen' | 'kommunikation' | 'ansprechpartner'>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kontakt: Kontakt | null;
  vorbelegteRollen?: KontaktRollenTyp[];
}

export function KontaktDialog({ open, onOpenChange, kontakt, vorbelegteRollen = [] }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rollen, setRollen] = useState<KontaktRollenTyp[]>(vorbelegteRollen);
  const [kommunikation, setKommunikation] = useState<KontaktKommunikation[]>([]);
  const [ansprechpartner, setAnsprechpartner] = useState<Ansprechpartner[]>([]);
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<Stammdaten>({ defaultValues: { anrede: 'HERR' } });
  const anrede = watch('anrede');

  useEffect(() => {
    if (open) {
      reset(kontakt ? { ...kontakt, geburtsdatum: kontakt.geburtsdatum?.slice(0, 10) } : { anrede: 'HERR' });
      setRollen(kontakt ? kontakt.rollen.map((r) => r.rolle) : vorbelegteRollen);
      setKommunikation(kontakt?.kommunikation ?? []);
      setAnsprechpartner(kontakt?.ansprechpartner ?? []);
    }
  }, [open, kontakt]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kontakte'] });
    qc.invalidateQueries({ queryKey: ['mieter'] });
    qc.invalidateQueries({ queryKey: ['eigentuemer'] });
  };

  const createMut = useMutation({
    mutationFn: (data: KontaktPayload) => api.kontakte.create(data),
    onSuccess: () => { invalidate(); onOpenChange(false); toast({ title: 'Kontakt angelegt', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });
  const updateMut = useMutation({
    mutationFn: (data: KontaktPayload) => api.kontakte.update(kontakt!.id, data),
    onSuccess: () => { invalidate(); onOpenChange(false); toast({ title: 'Kontakt aktualisiert', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const onSubmit = (stammdaten: Stammdaten) => {
    const payload: KontaktPayload = {
      ...stammdaten,
      rollen,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gewollt: 'id' vor dem Speichern entfernen
      kommunikation: kommunikation.filter((k) => k.wert.trim() !== '').map(({ id: _id, ...k }) => k),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gewollt: 'id' vor dem Speichern entfernen
      ansprechpartner: ansprechpartner.filter((a) => a.name.trim() !== '').map(({ id: _id, ...a }) => a),
    };
    if (kontakt) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  const toggleRolle = (rolle: KontaktRollenTyp) =>
    setRollen((r) => (r.includes(rolle) ? r.filter((x) => x !== rolle) : [...r, rolle]));

  const setApEintrag = (i: number, patch: Partial<Ansprechpartner>) =>
    setAnsprechpartner((liste) => liste.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{kontakt ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Anrede *</Label>
              <Select value={anrede} onValueChange={(v) => setValue('anrede', v as Anrede)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ANREDEN.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Firma</Label><Input {...register('firma')} /></div>
            <div><Label>Vorname{anrede !== 'FIRMA' && ' *'}</Label><Input {...register('vorname', { validate: (v) => anrede === 'FIRMA' || !!v?.trim() || 'Pflichtfeld' })} />{errors.vorname && <p className="text-xs text-red-600 mt-1">Pflichtfeld</p>}</div>
            <div><Label>Nachname{anrede !== 'FIRMA' && ' *'}</Label><Input {...register('nachname', { validate: (v) => anrede === 'FIRMA' || !!v?.trim() || 'Pflichtfeld' })} />{errors.nachname && <p className="text-xs text-red-600 mt-1">Pflichtfeld</p>}</div>
            <div><Label>Straße</Label><Input {...register('strasse')} /></div>
            <div><Label>Hausnummer</Label><Input {...register('hausnummer')} /></div>
            <div><Label>PLZ</Label><Input {...register('plz')} /></div>
            <div><Label>Ort</Label><Input {...register('ort')} /></div>
            <div><Label>Geburtsdatum</Label><Input type="date" {...register('geburtsdatum')} /></div>
            <div><Label>IBAN</Label><Input {...register('iban')} /></div>
            <div><Label>Steuernummer</Label><Input {...register('steuernummer')} /></div>
            <div><Label>Notizen</Label><Input {...register('notizen')} /></div>
          </div>

          <div>
            <Label className="mb-2 block">Rollen</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLLEN_LABELS) as KontaktRollenTyp[]).map((rolle) => (
                <Button key={rolle} type="button" size="sm" variant={rollen.includes(rolle) ? 'default' : 'outline'} onClick={() => toggleRolle(rolle)}>
                  {ROLLEN_LABELS[rolle]}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Kommunikationswege</Label>
            <KommunikationFelder value={kommunikation} onChange={setKommunikation} />
          </div>

          {anrede === 'FIRMA' && (
            <div>
              <Label className="mb-2 block">Ansprechpartner</Label>
              <div className="space-y-2">
                {ansprechpartner.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="flex-1" placeholder="Name" value={a.name} onChange={(e) => setApEintrag(i, { name: e.target.value })} />
                    <Input className="w-28" placeholder="Funktion" value={a.funktion ?? ''} onChange={(e) => setApEintrag(i, { funktion: e.target.value })} />
                    <Input className="w-40" placeholder="E-Mail" value={a.email ?? ''} onChange={(e) => setApEintrag(i, { email: e.target.value })} />
                    <Input className="w-28" placeholder="Telefon" value={a.telefon ?? ''} onChange={(e) => setApEintrag(i, { telefon: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setAnsprechpartner((l) => l.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setAnsprechpartner((l) => [...l, { name: '' }])}>
                  <Plus className="h-4 w-4 mr-1" /> Ansprechpartner
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
