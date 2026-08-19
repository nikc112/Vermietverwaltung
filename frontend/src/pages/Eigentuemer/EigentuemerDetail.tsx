import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api';

export function EigentuemerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: e, isLoading } = useQuery({
    queryKey: ['eigentuemer', id],
    queryFn: () => api.eigentuemer.get(Number(id)).then((r) => r.data),
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Laden…</div>;
  if (!e) return <div className="text-center py-12 text-muted-foreground">Nicht gefunden</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/eigentuemer"><ArrowLeft className="h-4 w-4 mr-1" /> Eigentümer</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-bold mb-6">{e.vorname} {e.nachname}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader><CardTitle>Kontaktdaten</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {e.firma && <div><span className="text-muted-foreground">Firma: </span>{e.firma}</div>}
              <div><span className="text-muted-foreground">Anrede: </span>{{HERR:'Herr',FRAU:'Frau',DIVERS:'Divers',FIRMA:'Firma'}[e.anrede]}</div>
              <div><span className="text-muted-foreground">E-Mail: </span>{e.email ?? '–'}</div>
              <div><span className="text-muted-foreground">Telefon: </span>{e.telefon ?? '–'}</div>
              <div><span className="text-muted-foreground">Adresse: </span>{e.strasse} {e.hausnummer}, {e.plz} {e.ort}</div>
              {e.iban && <div><span className="text-muted-foreground">IBAN: </span>{e.iban}</div>}
              {e.steuernummer && <div><span className="text-muted-foreground">StNr: </span>{e.steuernummer}</div>}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Mietobjekte ({e.mietobjekte?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {e.mietobjekte?.length === 0 ? (
                <p className="text-muted-foreground text-sm">Keine Mietobjekte vorhanden</p>
              ) : (
                <div className="space-y-2">
                  {e.mietobjekte?.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-md border p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <div>
                          <p className="font-medium">{m.bezeichnung}</p>
                          <p className="text-xs text-muted-foreground">{m.strasse} {m.hausnummer}, {m.plz} {m.ort}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{(m as {_count?: {mieteinheiten: number}})._count?.mieteinheiten ?? 0} Einheiten</Badge>
                        <Button variant="ghost" size="icon" asChild>
                          <Link to={`/mietobjekte/${m.id}`}><ChevronRight className="h-4 w-4" /></Link>
                        </Button>
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
