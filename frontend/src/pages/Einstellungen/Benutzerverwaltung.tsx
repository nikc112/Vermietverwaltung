import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, UserX, KeyRound, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { Benutzer } from '@/types';

const ROLLEN_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  VOLLZUGRIFF: 'Vollzugriff',
  VERTRAGSVERWALTER: 'Vertragsverwalter',
  KOSTENBUCHER: 'Kostenbuchhalter',
};

type FormData = {
  email: string;
  name: string;
  password: string;
  rolle: string;
  aktiv: boolean;
};

export function Benutzerverwaltung() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Benutzer | null>(null);
  const [pwDialogId, setPwDialogId] = useState<number | null>(null);
  const [neuesPasswort, setNeuesPasswort] = useState('');
  const [selectedRolle, setSelectedRolle] = useState('VOLLZUGRIFF');

  const { data: benutzer = [] } = useQuery({
    queryKey: ['benutzer'],
    queryFn: () => api.benutzer.list().then((r) => r.data),
  });

  const { register, handleSubmit, reset } = useForm<FormData>({
    defaultValues: { rolle: 'VOLLZUGRIFF', aktiv: true },
  });

  const createMut = useMutation({
    mutationFn: (data: FormData) => api.benutzer.create({ ...data, rolle: selectedRolle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['benutzer'] }); setDialogOpen(false); reset(); toast({ title: 'Benutzer angelegt', variant: 'success' as never }); },
    onError: (e: { response?: { data?: { error?: string } } }) => toast({ title: e.response?.data?.error ?? 'Fehler', variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormData> }) =>
      api.benutzer.update(id, { ...data, rolle: selectedRolle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['benutzer'] }); setDialogOpen(false); setEditItem(null); reset(); toast({ title: 'Benutzer aktualisiert', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => api.benutzer.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['benutzer'] }); toast({ title: 'Benutzer deaktiviert' }); },
    onError: (e: { response?: { data?: { error?: string } } }) => toast({ title: e.response?.data?.error ?? 'Fehler', variant: 'destructive' }),
  });

  const pwMut = useMutation({
    mutationFn: ({ id, pw }: { id: number; pw: string }) => api.benutzer.resetPasswort(id, pw),
    onSuccess: () => { setPwDialogId(null); setNeuesPasswort(''); toast({ title: 'Passwort zurückgesetzt', variant: 'success' as never }); },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  const openCreate = () => {
    setEditItem(null);
    setSelectedRolle('VOLLZUGRIFF');
    reset({ email: '', name: '', password: '', aktiv: true });
    setDialogOpen(true);
  };

  const openEdit = (b: Benutzer) => {
    setEditItem(b);
    setSelectedRolle(b.rolle);
    reset({ email: b.email, name: b.name, aktiv: b.aktiv });
    setDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    if (editItem) updateMut.mutate({ id: editItem.id, data });
    else createMut.mutate(data);
  };

  return (
    <div>
      <PageHeader
        title="Benutzerverwaltung"
        description="Benutzerkonten und Zugriffsrechte verwalten"
        action={{ label: 'Benutzer anlegen', onClick: openCreate }}
      />

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">E-Mail</th>
              <th className="text-left px-4 py-3 font-medium">Rolle</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {benutzer.map((b) => (
              <tr key={b.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.email}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{ROLLEN_LABELS[b.rolle] ?? b.rolle}</Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={b.aktiv ? 'success' : 'secondary'}>{b.aktiv ? 'Aktiv' : 'Inaktiv'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" title="Bearbeiten" onClick={() => openEdit(b)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Passwort zurücksetzen" onClick={() => { setPwDialogId(b.id); setNeuesPasswort(''); }}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    {b.aktiv && (
                      <Button variant="ghost" size="icon" title="Deaktivieren" onClick={() => deactivateMut.mutate(b.id)}>
                        <UserX className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {benutzer.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Keine Benutzer vorhanden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Benutzer anlegen/bearbeiten */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditItem(null); reset(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Benutzer bearbeiten' : 'Neuen Benutzer anlegen'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input {...register('name', { required: true })} />
            </div>
            <div>
              <Label>E-Mail *</Label>
              <Input type="email" {...register('email', { required: true })} />
            </div>
            {!editItem && (
              <div>
                <Label>Passwort * (min. 8 Zeichen)</Label>
                <Input type="password" {...register('password', { required: true, minLength: 8 })} />
              </div>
            )}
            <div>
              <Label>Rolle *</Label>
              <Select value={selectedRolle} onValueChange={setSelectedRolle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLLEN_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="aktiv"
                className="h-4 w-4 rounded border-gray-300"
                {...register('aktiv')}
                defaultChecked
              />
              <Label htmlFor="aktiv">Aktiv</Label>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? 'Speichern…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Passwort zurücksetzen */}
      <Dialog open={pwDialogId !== null} onOpenChange={(o) => !o && setPwDialogId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Passwort zurücksetzen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Neues Passwort (min. 8 Zeichen)</Label>
              <Input type="password" value={neuesPasswort} onChange={(e) => setNeuesPasswort(e.target.value)} />
            </div>
            <DialogFooter>
              <Button
                onClick={() => pwDialogId && pwMut.mutate({ id: pwDialogId, pw: neuesPasswort })}
                disabled={neuesPasswort.length < 8 || pwMut.isPending}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                {pwMut.isPending ? 'Speichern…' : 'Passwort setzen'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
