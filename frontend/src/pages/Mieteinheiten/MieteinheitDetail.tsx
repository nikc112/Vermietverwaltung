import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/api';
import { formatEuro, formatDatum } from '@/lib/utils';
import { DokumenteAbschnitt } from '@/pages/Dokumente/DokumenteAbschnitt';

const STATUS_LABELS: Record<string, string> = { AKTIV: 'Aktiv', BEENDET: 'Beendet', GEKUENDIGT: 'Gekündigt' };
const STATUS_VARIANTS: Record<string, string> = { AKTIV: 'success', BEENDET: 'secondary', GEKUENDIGT: 'warning' };

export function MieteinheitDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: einheit, isLoading } = useQuery({
    queryKey: ['mieteinheiten', id],
    queryFn: () => api.mieteinheiten.get(Number(id)).then((r) => r.data),
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Laden…</div>;
  if (!einheit) return <div className="text-center py-12 text-muted-foreground">Nicht gefunden</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/mietobjekte/${einheit.mietobjektID}`}><ArrowLeft className="h-4 w-4 mr-1" /> {einheit.mietobjekt?.bezeichnung}</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold mb-1">{einheit.bezeichnung}</h1>
      <p className="text-muted-foreground mb-6">
        {einheit.flaeche} m² · Etage: {einheit.etage ?? '–'} · Zimmer: {einheit.zimmeranzahl ?? '–'}
      </p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Mietverträge</CardTitle>
          <Button size="sm" asChild>
            <Link to="/mietvertraege">+ Neuer Vertrag</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {einheit.mietvertraege?.length === 0 ? (
            <p className="text-muted-foreground text-sm">Keine Verträge vorhanden</p>
          ) : (
            <div className="space-y-3">
              {einheit.mietvertraege?.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border p-4">
                  <div>
                    <p className="font-medium">{(v as {mieter?: {vorname?: string; nachname?: string}}).mieter?.vorname} {(v as {mieter?: {vorname?: string; nachname?: string}}).mieter?.nachname}</p>
                    <p className="text-sm text-muted-foreground">
                      {v.vertragsnummer} · {formatDatum(v.beginn)} –{' '}
                      {v.ende ? formatDatum(v.ende) : 'unbefristet'}
                    </p>
                    <p className="text-sm">
                      Kaltmiete: {formatEuro(Number(v.kaltmiete))} + NK: {formatEuro(Number(v.nebenkostenVorauszahlung))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[v.status] as never}>{STATUS_LABELS[v.status]}</Badge>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/mietvertraege/${v.id}`}><ChevronRight className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DokumenteAbschnitt bezug={{ mieteinheitID: Number(id) }} />
    </div>
  );
}
