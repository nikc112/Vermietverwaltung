import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, ChevronRight, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api';
import { Kontakt, KontaktRollenTyp } from '@/types';
import { KontaktDialog, ROLLEN_LABELS } from './KontaktDialog';

const FILTER: { value: KontaktRollenTyp | ''; label: string }[] = [
  { value: '', label: 'Alle' },
  { value: 'MIETER', label: 'Mieter' },
  { value: 'EIGENTUEMER', label: 'Eigentümer' },
  { value: 'DIENSTLEISTER', label: 'Dienstleister' },
  { value: 'VERSORGER', label: 'Versorger' },
  { value: 'BEHOERDE', label: 'Behörde' },
  { value: 'SONSTIGE', label: 'Sonstige' },
];

function kontaktName(k: Kontakt): string {
  return k.firma && k.firma.trim() !== '' ? k.firma : `${k.vorname} ${k.nachname}`.trim();
}

export function KontakteListe() {
  const [suche, setSuche] = useState('');
  const [rolle, setRolle] = useState<KontaktRollenTyp | ''>('');
  const [inaktive, setInaktive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Kontakt | null>(null);

  const { data: kontakte = [] } = useQuery({
    queryKey: ['kontakte', suche, rolle, inaktive],
    queryFn: () =>
      api.kontakte
        .list({ suche: suche || undefined, rolle: rolle || undefined, inaktive: inaktive || undefined })
        .then((r) => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Kontakte"
        description="Zentrale Verwaltung aller Kontakte"
        action={{ label: 'Kontakt anlegen', onClick: () => { setEditItem(null); setDialogOpen(true); } }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-60" placeholder="Suchen…" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
      </PageHeader>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {FILTER.map((f) => (
          <Button key={f.value} size="sm" variant={rolle === f.value ? 'default' : 'outline'} onClick={() => setRolle(f.value)}>
            {f.label}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={inaktive} onChange={(e) => setInaktive(e.target.checked)} />
          Inaktive anzeigen
        </label>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Rollen</th>
              <th className="text-left px-4 py-3 font-medium">Kommunikation</th>
              <th className="text-center px-4 py-3 font-medium">Verträge / Objekte</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {kontakte.map((k) => (
              <tr key={k.id} className={`border-b hover:bg-gray-50 ${k.anonymisiertAm ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium">
                  {kontaktName(k)}
                  {!k.aktiv && !k.anonymisiertAm && <Badge variant="outline" className="ml-2">inaktiv</Badge>}
                  {k.anonymisiertAm && <Badge variant="outline" className="ml-2">anonymisiert</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {k.rollen.map((r) => <Badge key={r.rolle} variant="secondary">{ROLLEN_LABELS[r.rolle]}</Badge>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {k.kommunikation.slice(0, 2).map((c) => <p key={`${c.typ}-${c.wert}`}>{c.wert}</p>)}
                </td>
                <td className="px-4 py-3 text-center">{k._count?.mietvertraege ?? 0} / {k._count?.mietobjekte ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {!k.anonymisiertAm && (
                      <Button variant="ghost" size="icon" onClick={() => { setEditItem(k); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/kontakte/${k.id}`}><ChevronRight className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {kontakte.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Keine Kontakte gefunden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <KontaktDialog open={dialogOpen} onOpenChange={setDialogOpen} kontakt={editItem} />
    </div>
  );
}
