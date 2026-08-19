import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, ChevronRight, Building2, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { KontaktDialog } from '@/pages/Kontakte/KontaktDialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { Kontakt } from '@/types';

export function EigentuemerListe() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Kontakt | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [suche, setSuche] = useState('');

  const { data: eigentuemer = [] } = useQuery({
    queryKey: ['eigentuemer'],
    queryFn: () => api.eigentuemer.list().then((r) => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.eigentuemer.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eigentuemer'] }); setDeleteId(null); toast({ title: 'Eigentümer deaktiviert' }); },
  });

  const term = suche.toLowerCase();
  const gefiltert = eigentuemer.filter((e) =>
    !suche ||
    [e.vorname, e.nachname, e.firma ?? '', e.ort].join(' ').toLowerCase().includes(term)
  );

  return (
    <div>
      <PageHeader
        title="Eigentümer"
        description="Alle Eigentümer Ihrer Mietobjekte"
        action={{ label: 'Eigentümer anlegen', onClick: () => { setEditItem(null); setDialogOpen(true); } }}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Name, Firma oder Ort suchen…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Kontakt</th>
              <th className="text-left px-4 py-3 font-medium">Ort</th>
              <th className="text-center px-4 py-3 font-medium">Objekte</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((e) => (
              <tr key={e.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{e.vorname} {e.nachname}</p>
                  {e.firma && <p className="text-xs text-muted-foreground">{e.firma}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {e.email && <p>{e.email}</p>}
                  {e.telefon && <p>{e.telefon}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.plz} {e.ort}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    {e._count?.mietobjekte ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={e.aktiv ? 'success' : 'secondary'}>{e.aktiv ? 'Aktiv' : 'Inaktiv'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => { setEditItem(e as unknown as Kontakt); setDialogOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/eigentuemer/${e.id}`}><ChevronRight className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {gefiltert.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                {suche ? 'Keine Treffer für Ihre Suche' : 'Keine Eigentümer vorhanden'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <KontaktDialog open={dialogOpen} onOpenChange={setDialogOpen} kontakt={editItem} vorbelegteRollen={['EIGENTUEMER']} />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Eigentümer deaktivieren"
        description="Der Eigentümer wird deaktiviert. Vorhandene Mietobjekte bleiben erhalten."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
        confirmLabel="Deaktivieren"
        variant="destructive"
      />
    </div>
  );
}
