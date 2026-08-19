import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/api';
import { formatEuro, formatDatum } from '@/lib/utils';

const STATUS_VARIANTS: Record<string, string> = { AKTIV: 'success', BEENDET: 'secondary', GEKUENDIGT: 'warning' };
const STATUS_LABELS: Record<string, string> = { AKTIV: 'Aktiv', BEENDET: 'Beendet', GEKUENDIGT: 'Gekündigt' };

export function MieterDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: mieter, isLoading } = useQuery({
    queryKey: ['mieter', id],
    queryFn: () => api.mieter.get(Number(id)).then((r) => r.data),
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Laden…</div>;
  if (!mieter) return <div className="text-center py-12 text-muted-foreground">Nicht gefunden</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" asChild><Link to="/mieter"><ArrowLeft className="h-4 w-4 mr-1" /> Mieter</Link></Button>
      </div>
      <h1 className="text-2xl font-bold mb-6">{mieter.vorname} {mieter.nachname}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Kontaktdaten</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">E-Mail: </span>{mieter.email ?? '–'}</div>
            <div><span className="text-muted-foreground">Telefon: </span>{mieter.telefon ?? '–'}</div>
            {mieter.geburtsdatum && <div><span className="text-muted-foreground">Geburtstag: </span>{formatDatum(mieter.geburtsdatum)}</div>}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Mietverträge</CardTitle></CardHeader>
            <CardContent>
              {mieter.mietvertraege?.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Verträge</p>
              ) : (
                <div className="space-y-3">
                  {mieter.mietvertraege?.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{(v as {mieteinheit?: {mietobjekt?: {bezeichnung?: string}}}).mieteinheit?.mietobjekt?.bezeichnung} – {(v as {mieteinheit?: {bezeichnung?: string}}).mieteinheit?.bezeichnung}</p>
                        <p className="text-xs text-muted-foreground">{formatDatum(v.beginn)} – {v.ende ? formatDatum(v.ende) : 'unbefristet'}</p>
                        <p className="text-sm">{formatEuro(Number(v.kaltmiete))} + NK {formatEuro(Number(v.nebenkostenVorauszahlung))}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANTS[v.status] as never}>{STATUS_LABELS[v.status]}</Badge>
                        <Button variant="ghost" size="icon" asChild><Link to={`/mietvertraege/${v.id}`}><ChevronRight className="h-4 w-4" /></Link></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
