import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, ChevronRight, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KontaktDialog } from '@/pages/Kontakte/KontaktDialog';
import { api } from '@/api';
import { Kontakt } from '@/types';

export function MieterListe() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Kontakt | null>(null);

  const { data: mieter = [] } = useQuery({
    queryKey: ['mieter', search],
    queryFn: () => api.mieter.list(search ? { search } : undefined).then((r) => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Mieter"
        description="Alle Mieter verwalten"
        action={{ label: 'Mieter anlegen', onClick: () => { setEditItem(null); setDialogOpen(true); } }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-60" placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </PageHeader>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Kontakt</th>
              <th className="text-center px-4 py-3 font-medium">Verträge</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {mieter.map((m) => (
              <tr key={m.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{m.vorname} {m.nachname}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {m.email && <p>{m.email}</p>}
                  {m.telefon && <p>{m.telefon}</p>}
                </td>
                <td className="px-4 py-3 text-center">{m._count?.mietvertraege ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => { setEditItem(m as unknown as Kontakt); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" asChild><Link to={`/mieter/${m.id}`}><ChevronRight className="h-4 w-4" /></Link></Button>
                  </div>
                </td>
              </tr>
            ))}
            {mieter.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Keine Mieter gefunden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <KontaktDialog open={dialogOpen} onOpenChange={setDialogOpen} kontakt={editItem} vorbelegteRollen={['MIETER']} />
    </div>
  );
}
