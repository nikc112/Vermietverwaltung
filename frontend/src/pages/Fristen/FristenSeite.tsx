import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { cn, formatDatum } from '@/lib/utils';
import { Frist, FristPayload, FristStatus, Kontakt, Mietobjekt, Mietvertrag, Rolle } from '@/types';

export const FRIST_ROLLEN: Rolle[] = ['ADMIN', 'VOLLZUGRIFF', 'VERTRAGSVERWALTER'];

const AMPEL_FARBEN: Record<Frist['ampel'], string> = {
  ROT: 'bg-red-500',
  GELB: 'bg-yellow-400',
  GRUEN: 'bg-green-500',
};

const TYP_LABELS: Record<Frist['typ'], string> = {
  MANUELL: 'Manuell',
  NKA_ABRECHNUNG: 'NKA-Frist',
  VERTRAGSENDE: 'Vertragsende',
};

function AmpelPunkt({ ampel }: { ampel: Frist['ampel'] }) {
  return <span className={cn('inline-block h-3 w-3 rounded-full', AMPEL_FARBEN[ampel])} />;
}

type NeueFristForm = {
  titel: string;
  faelligAm: string;
  notizen: string;
  mietvertragID: string;
  mietobjektID: string;
  kontaktID: string;
};

type BearbeitenForm = { titel: string; faelligAm: string; notizen: string };

export function FristenSeite() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const darfSchreiben = rolle ? FRIST_ROLLEN.includes(rolle) : false;
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Frist | null>(null);
  const [bearbeitenForm, setBearbeitenForm] = useState<BearbeitenForm>({ titel: '', faelligAm: '', notizen: '' });

  const { data: offene = [] } = useQuery({
    queryKey: ['fristen', 'OFFEN'],
    queryFn: () => api.fristen.list().then((r) => r.data),
  });
  const { data: erledigte = [] } = useQuery({
    queryKey: ['fristen', 'ERLEDIGT'],
    queryFn: () => api.fristen.list('ERLEDIGT').then((r) => r.data),
  });
  const { data: verworfene = [] } = useQuery({
    queryKey: ['fristen', 'VERWORFEN'],
    queryFn: () => api.fristen.list('VERWORFEN').then((r) => r.data),
  });
  const { data: vertraege = [] } = useQuery({
    queryKey: ['mietvertraege'],
    queryFn: () => api.mietvertraege.list().then((r) => r.data),
    enabled: dialogOffen,
  });
  const { data: mietobjekte = [] } = useQuery({
    queryKey: ['mietobjekte'],
    queryFn: () => api.mietobjekte.list().then((r) => r.data),
    enabled: dialogOffen,
  });
  const { data: kontakte = [] } = useQuery({
    queryKey: ['kontakte'],
    queryFn: () => api.kontakte.list().then((r) => r.data),
    enabled: dialogOffen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['fristen'] });

  type MutationData = { status?: FristStatus; faelligAm?: string; titel?: string; notizen?: string };

  // Auto-Fristen laufen ueber den Override-Endpoint, manuelle/Overrides ueber die Zeilen-ID
  // (Auto-Titel sind systemgeneriert, daher wird 'titel' vor dem Override-Aufruf entfernt)
  const mutiere = (f: Frist, data: MutationData) => {
    if (f.quelle === 'AUTO') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gewollt: 'titel' vor dem Override-Aufruf entfernen
      const { titel: _titel, ...autoData } = data;
      return api.fristen.overrideAuto(f.typ as 'NKA_ABRECHNUNG' | 'VERTRAGSENDE', f.mietvertragID!, {
        ...(f.typ === 'NKA_ABRECHNUNG' ? { referenzJahr: f.referenzJahr ?? undefined } : {}),
        ...autoData,
      });
    }
    return api.fristen.update(f.id!, data);
  };

  const aktionMut = useMutation({
    mutationFn: ({ frist, data }: { frist: Frist; data: MutationData }) =>
      mutiere(frist, data),
    onSuccess: () => { invalidate(); setBearbeiten(null); toast({ title: 'Frist aktualisiert', variant: 'success' as never }); },
    onError: () => toast({ title: 'Aktion fehlgeschlagen', variant: 'destructive' }),
  });

  const loeschMut = useMutation({
    mutationFn: (id: number) => api.fristen.delete(id),
    onSuccess: () => { invalidate(); toast({ title: 'Frist gelöscht', variant: 'success' as never }); },
    onError: () => toast({ title: 'Löschen fehlgeschlagen', variant: 'destructive' }),
  });

  const { register, handleSubmit, reset } = useForm<NeueFristForm>({
    defaultValues: { titel: '', faelligAm: '', notizen: '', mietvertragID: '', mietobjektID: '', kontaktID: '' },
  });

  const anlegenMut = useMutation({
    mutationFn: (form: NeueFristForm) => {
      const payload: FristPayload = {
        titel: form.titel,
        faelligAm: form.faelligAm,
        ...(form.notizen ? { notizen: form.notizen } : {}),
        ...(form.mietvertragID ? { mietvertragID: parseInt(form.mietvertragID) } : {}),
        ...(form.mietobjektID ? { mietobjektID: parseInt(form.mietobjektID) } : {}),
        ...(form.kontaktID ? { kontaktID: parseInt(form.kontaktID) } : {}),
      };
      return api.fristen.create(payload);
    },
    onSuccess: () => { invalidate(); setDialogOffen(false); reset(); toast({ title: 'Frist angelegt', variant: 'success' as never }); },
    onError: () => toast({ title: 'Anlegen fehlgeschlagen', variant: 'destructive' }),
  });

  const zeile = (f: Frist, historisch: boolean) => (
    <tr key={`${f.typ}-${f.id ?? `${f.mietvertragID}-${f.referenzJahr}`}`} className="border-b last:border-0">
      <td className="py-2 pr-2"><AmpelPunkt ampel={f.ampel} /></td>
      <td className="py-2 pr-4">
        {f.titel}
        {f.aeltereOffen > 0 && (
          <span className="ml-2 text-xs text-red-600">+ {f.aeltereOffen} ältere Abrechnung(en) offen</span>
        )}
        {f.notizen && <div className="text-xs text-muted-foreground">{f.notizen}</div>}
      </td>
      <td className="py-2 pr-4 text-sm">
        {f.mietvertragID ? (
          <Link to={`/mietvertraege/${f.mietvertragID}`} className="text-blue-700 hover:underline">{f.bezug ?? '–'}</Link>
        ) : f.mietobjektID ? (
          <Link to={`/mietobjekte/${f.mietobjektID}`} className="text-blue-700 hover:underline">{f.bezug ?? '–'}</Link>
        ) : f.kontaktID ? (
          <Link to={`/kontakte/${f.kontaktID}`} className="text-blue-700 hover:underline">{f.bezug ?? '–'}</Link>
        ) : (
          '–'
        )}
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">{formatDatum(f.faelligAm)}</td>
      <td className="py-2 pr-4"><Badge variant={f.quelle === 'AUTO' ? 'secondary' : 'outline'}>{TYP_LABELS[f.typ]}</Badge></td>
      {darfSchreiben && (
        <td className="py-2 space-x-1 whitespace-nowrap text-right">
          {!historisch && (
            <>
              <Button size="sm" variant="outline" onClick={() => aktionMut.mutate({ frist: f, data: { status: 'ERLEDIGT' } })}>
                Erledigt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBearbeiten(f);
                  setBearbeitenForm({ titel: f.titel, faelligAm: f.faelligAm.slice(0, 10), notizen: f.notizen ?? '' });
                }}
              >
                {f.quelle === 'MANUELL' ? 'Bearbeiten' : 'Datum'}
              </Button>
              {f.quelle === 'AUTO' && (
                <Button size="sm" variant="outline" onClick={() => aktionMut.mutate({ frist: f, data: { status: 'VERWORFEN' } })}>
                  Verwerfen
                </Button>
              )}
            </>
          )}
          {f.id !== null && (
            <Button size="sm" variant="destructive" onClick={() => loeschMut.mutate(f.id!)}>
              {f.quelle === 'AUTO' ? 'Zurücksetzen' : 'Löschen'}
            </Button>
          )}
        </td>
      )}
    </tr>
  );

  const tabelle = (fristen: Frist[], historisch = false) => (
    <div className="rounded-md border bg-white p-4 overflow-x-auto">
      {fristen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Fristen vorhanden.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-2"></th>
              <th className="py-2 pr-4">Frist</th>
              <th className="py-2 pr-4">Bezug</th>
              <th className="py-2 pr-4">Fällig am</th>
              <th className="py-2 pr-4">Typ</th>
              {darfSchreiben && <th className="py-2 text-right">Aktionen</th>}
            </tr>
          </thead>
          <tbody>{fristen.map((f) => zeile(f, historisch))}</tbody>
        </table>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Fristen" description="Automatische und manuelle Fristen mit Ampel-Status" />

      <Tabs defaultValue="offen">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="offen">Offen ({offene.length})</TabsTrigger>
            <TabsTrigger value="historie">Historie ({erledigte.length + verworfene.length})</TabsTrigger>
          </TabsList>
          {darfSchreiben && <Button onClick={() => setDialogOffen(true)}>Neue Frist</Button>}
        </div>

        <TabsContent value="offen">{tabelle(offene)}</TabsContent>
        <TabsContent value="historie" className="space-y-4">
          {tabelle([...erledigte, ...verworfene], true)}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Frist</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => anlegenMut.mutate(d))} className="space-y-3">
            <div>
              <Label>Titel</Label>
              <Input {...register('titel', { required: true })} placeholder="z.B. Wartung Heizung" />
            </div>
            <div>
              <Label>Fällig am</Label>
              <Input type="date" {...register('faelligAm', { required: true })} />
            </div>
            <div>
              <Label>Mietvertrag (optional)</Label>
              <select {...register('mietvertragID')} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">– kein Bezug –</option>
                {vertraege.map((v: Mietvertrag) => (
                  <option key={v.id} value={v.id}>
                    {v.vertragsnummer}{v.status === 'GEKUENDIGT' ? ' (gekündigt)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Mietobjekt (optional)</Label>
              <select {...register('mietobjektID')} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">– kein Bezug –</option>
                {mietobjekte.map((o: Mietobjekt) => (
                  <option key={o.id} value={o.id}>{o.bezeichnung}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Kontakt (optional)</Label>
              <select {...register('kontaktID')} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">– kein Bezug –</option>
                {kontakte.map((k: Kontakt) => (
                  <option key={k.id} value={k.id}>{k.firma || `${k.vorname} ${k.nachname}`}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Notizen (optional)</Label>
              <Input {...register('notizen')} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={anlegenMut.isPending}>Anlegen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bearbeiten !== null} onOpenChange={(o) => !o && setBearbeiten(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bearbeiten?.quelle === 'MANUELL' ? 'Frist bearbeiten' : 'Fälligkeit ändern'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {bearbeiten?.quelle === 'MANUELL' && (
              <div>
                <Label>Titel</Label>
                <Input
                  value={bearbeitenForm.titel}
                  onChange={(e) => setBearbeitenForm((f) => ({ ...f, titel: e.target.value }))}
                />
              </div>
            )}
            <div>
              <Label>Fällig am</Label>
              <Input
                type="date"
                value={bearbeitenForm.faelligAm}
                onChange={(e) => setBearbeitenForm((f) => ({ ...f, faelligAm: e.target.value }))}
              />
            </div>
            {bearbeiten?.quelle === 'MANUELL' && (
              <div>
                <Label>Notizen</Label>
                <Input
                  value={bearbeitenForm.notizen}
                  onChange={(e) => setBearbeitenForm((f) => ({ ...f, notizen: e.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={!bearbeitenForm.faelligAm || aktionMut.isPending}
              onClick={() =>
                bearbeiten &&
                aktionMut.mutate({
                  frist: bearbeiten,
                  data:
                    bearbeiten.quelle === 'MANUELL'
                      ? { titel: bearbeitenForm.titel, faelligAm: bearbeitenForm.faelligAm, notizen: bearbeitenForm.notizen }
                      : { faelligAm: bearbeitenForm.faelligAm },
                })
              }
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
