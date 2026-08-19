import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, FileText, AlertCircle, TrendingUp, Home,
  CalendarClock, CheckCircle2, PlusCircle, CreditCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { formatEuro, MONATE } from '@/lib/utils';
import { Mietzahlung, Mietvertrag, KategorieMeta, Mietobjekt } from '@/types';

const heute = new Date();
const aktuellerMonat = MONATE[heute.getMonth()];
const aktuellesJahr = heute.getFullYear();
const heuteDateString = heute.toISOString().slice(0, 10);

function KennzahlCard({
  title,
  value,
  icon: Icon,
  description,
  highlight,
  highlightColor = 'red',
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  highlight?: boolean;
  highlightColor?: 'red' | 'amber';
}) {
  const iconClass = highlight
    ? highlightColor === 'amber' ? 'text-amber-500' : 'text-red-500'
    : 'text-blue-500';
  const textClass = highlight
    ? highlightColor === 'amber' ? 'text-amber-600' : 'text-red-600'
    : '';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${textClass}`}>{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

interface ZahlungErfassenState {
  id: number;
  monat: number;
  jahr: number;
  sollBetrag: number;
  bereitsGezahlt?: number;
}

interface KostenErfassenState {
  mietobjektID: string;
  kategorieKey: string;
  bezeichnung: string;
  betrag: string;
  datum: string;
}

const leereKosten = (): KostenErfassenState => ({
  mietobjektID: '',
  kategorieKey: '',
  bezeichnung: '',
  betrag: '',
  datum: heuteDateString,
});

export function Dashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Zahlung erfassen
  const [editPayment, setEditPayment] = useState<ZahlungErfassenState | null>(null);
  const [istBetrag, setIstBetrag] = useState('');
  const [eingangsdat, setEingangsdat] = useState(heuteDateString);
  const [zahlungsart, setZahlungsart] = useState('UEBERWEISUNG');

  // Kosten erfassen
  const [kostenDialogOpen, setKostenDialogOpen] = useState(false);
  const [kosten, setKosten] = useState<KostenErfassenState>(leereKosten());

  const { data: kz, isLoading: kzLoading } = useQuery({
    queryKey: ['dashboard-kennzahlen'],
    queryFn: () => api.dashboard.kennzahlen().then((r) => r.data),
  });

  const { data: offene } = useQuery({
    queryKey: ['dashboard-offene'],
    queryFn: () => api.dashboard.offeneZahlungen().then((r) => r.data),
  });

  const { data: teilzahlungen = [] } = useQuery({
    queryKey: ['dashboard-teilzahlungen'],
    queryFn: () => api.dashboard.teilzahlungen().then((r) => r.data),
  });

  const { data: auslaufend = [] } = useQuery({
    queryKey: ['dashboard-auslaufend'],
    queryFn: () => api.dashboard.auslaufendeVertraege().then((r) => r.data),
  });

  const { data: mietobjekte = [] } = useQuery({
    queryKey: ['mietobjekte'],
    queryFn: () => api.mietobjekte.list({ aktiv: true }).then((r) => r.data),
    enabled: kostenDialogOpen,
  });

  const { data: kategorien = [] } = useQuery({
    queryKey: ['kosten-kategorien'],
    queryFn: () => api.kosten.kategorien().then((r) => r.data),
    enabled: kostenDialogOpen,
  });

  const zahlungErfassenMut = useMutation({
    mutationFn: (id: number) =>
      api.mietzahlungen.update(id, {
        eingegangen: true,
        istBetrag: parseFloat(istBetrag),
        eingangsdat,
        zahlungsart: zahlungsart as Mietzahlung['zahlungsart'],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-offene'] });
      qc.invalidateQueries({ queryKey: ['dashboard-teilzahlungen'] });
      qc.invalidateQueries({ queryKey: ['dashboard-kennzahlen'] });
      setEditPayment(null);
      toast({ title: 'Zahlung erfasst', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const kostenErfassenMut = useMutation({
    mutationFn: () => {
      const kat = kategorien.find((k: KategorieMeta) => k.key === kosten.kategorieKey);
      return api.kosten.create({
        mietobjektID: parseInt(kosten.mietobjektID),
        bezeichnung: kosten.bezeichnung,
        kategorie: kosten.kategorieKey as never,
        betrag: parseFloat(kosten.betrag),
        datum: kosten.datum,
        jahr: new Date(kosten.datum).getFullYear(),
        umlagefaehig: kat?.umlagefaehig ?? false,
        umlageSchluessel: (kat?.schluessel ?? 'FLAECHE') as never,
        umlageArt: 'ALLE_EINHEITEN',
      });
    },
    onSuccess: () => {
      setKostenDialogOpen(false);
      setKosten(leereKosten());
      toast({ title: 'Kosten erfasst', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const openZahlungDialog = (z: Mietzahlung, bereitsGezahlt?: number) => {
    setEditPayment({ id: z.id, monat: z.monat, jahr: z.jahr, sollBetrag: Number(z.sollBetrag), bereitsGezahlt });
    setIstBetrag(String(Number(z.sollBetrag)));
    setEingangsdat(heuteDateString);
    setZahlungsart('UEBERWEISUNG');
  };

  const handleKategorieChange = (key: string) => {
    const kat = kategorien.find((k: KategorieMeta) => k.key === key);
    setKosten((prev) => ({ ...prev, kategorieKey: key, bezeichnung: kat?.label ?? '' }));
  };

  const allOk = (kz?.ausstehend.anzahl ?? 0) === 0 && (kz?.teilzahlungen.anzahl ?? 0) === 0;

  if (kzLoading) {
    return <div className="text-center py-12 text-muted-foreground">Lade Dashboard…</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Übersicht Ihrer Mietverwaltung</p>
        </div>
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={() => { setKosten(leereKosten()); setKostenDialogOpen(true); }}
        >
          <PlusCircle className="h-4 w-4" />
          Kosten erfassen
        </Button>
      </div>

      {/* Hauptkennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KennzahlCard title="Mietobjekte" value={kz?.mietobjekte ?? '–'} icon={Building2} description="Aktive Gebäude" />
        <KennzahlCard
          title="Mieteinheiten"
          value={`${kz?.mieteinheiten.vermietet ?? 0} / ${kz?.mieteinheiten.gesamt ?? 0}`}
          icon={Home}
          description={`${kz?.mieteinheiten.leerstand ?? 0} leerstehend`}
          highlight={(kz?.mieteinheiten.leerstand ?? 0) > 0}
        />
        <KennzahlCard title="Aktive Verträge" value={kz?.aktiveVertraege ?? '–'} icon={FileText} description="Laufende Mietverträge" />
        <KennzahlCard
          title="Soll-Miete/Monat"
          value={formatEuro(kz?.monatlicheSollMiete ?? 0)}
          icon={TrendingUp}
          description="Kaltmiete + NK-Vorauszahlung"
        />
      </div>

      {/* Fristen */}
      {((kz?.fristen?.rot ?? 0) > 0 || (kz?.fristen?.gelb ?? 0) > 0) && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader className="pb-2 flex flex-row items-center">
            <CardTitle className="text-amber-800 flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Fristen
            </CardTitle>
            <Link to="/fristen" className="ml-auto text-xs text-blue-700 hover:underline">
              Zur Fristenübersicht →
            </Link>
          </CardHeader>
          <CardContent className="flex gap-6 text-sm">
            <span className="font-semibold text-red-600">{kz?.fristen?.rot ?? 0} überfällig</span>
            <span className="font-semibold text-amber-600">{kz?.fristen?.gelb ?? 0} bald fällig</span>
          </CardContent>
        </Card>
      )}

      {/* Ausstehende Zahlungen */}
      {(kz?.ausstehend.anzahl ?? 0) > 0 ? (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardHeader className="pb-2 flex flex-row items-center">
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Ausstehende Zahlungen – {aktuellerMonat} {aktuellesJahr} ({kz?.ausstehend.anzahl})
            </CardTitle>
            <Link to="/forderungen" className="ml-auto text-xs text-blue-700 hover:underline">
              Zum Mahnwesen →
            </Link>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 font-semibold text-lg mb-4">
              Gesamt: {formatEuro(kz?.ausstehend.summe ?? 0)}
            </p>
            <div className="space-y-2 max-h-64 overflow-auto">
              {offene?.slice(0, 10).map((z: Mietzahlung) => (
                <div key={z.id} className="flex items-center justify-between rounded bg-white p-3 shadow-sm">
                  <div>
                    <p className="font-medium text-sm">
                      {(z.mietvertrag?.mieter as { vorname?: string; nachname?: string } | undefined)?.vorname}{' '}
                      {(z.mietvertrag?.mieter as { vorname?: string; nachname?: string } | undefined)?.nachname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {MONATE[z.monat - 1]} {z.jahr} —{' '}
                      {(z.mietvertrag?.mieteinheit?.mietobjekt as { bezeichnung?: string } | undefined)?.bezeichnung}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{formatEuro(Number(z.sollBetrag))}</p>
                      <Badge variant="destructive" className="text-xs">Offen</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-400 hover:bg-green-50"
                      title="Zahlung erfassen"
                      onClick={() => openZahlungDialog(z)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Erfassen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Teilzahlungen */}
      {(kz?.teilzahlungen.anzahl ?? 0) > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-700 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Teilzahlungen – {aktuellerMonat} {aktuellesJahr} ({kz?.teilzahlungen.anzahl})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-amber-700 font-semibold text-lg mb-4">
              Fehlbetrag: {formatEuro(kz?.teilzahlungen.fehlbetrag ?? 0)}
            </p>
            <div className="space-y-2 max-h-64 overflow-auto">
              {teilzahlungen.map((z: Mietzahlung) => (
                <div key={z.id} className="flex items-center justify-between rounded bg-white p-3 shadow-sm">
                  <div>
                    <p className="font-medium text-sm">
                      {(z.mietvertrag?.mieter as { vorname?: string; nachname?: string } | undefined)?.vorname}{' '}
                      {(z.mietvertrag?.mieter as { vorname?: string; nachname?: string } | undefined)?.nachname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {MONATE[z.monat - 1]} {z.jahr} —{' '}
                      {(z.mietvertrag?.mieteinheit?.mietobjekt as { bezeichnung?: string } | undefined)?.bezeichnung}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-sm">
                      <p className="font-semibold text-amber-700">
                        {formatEuro(Number(z.istBetrag))} <span className="font-normal text-muted-foreground">von</span> {formatEuro(Number(z.sollBetrag))}
                      </p>
                      <Badge variant="outline" className="text-amber-700 border-amber-400 text-xs">
                        Fehlend: {formatEuro(Number(z.sollBetrag) - Number(z.istBetrag))}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-400 hover:bg-green-50"
                      title="Restbetrag erfassen"
                      onClick={() => openZahlungDialog(z, Number(z.istBetrag ?? 0))}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Rest erfassen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alle Zahlungen OK */}
      {allOk && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="py-6 text-center">
            <Users className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="font-medium text-green-700">Alle Zahlungen für {aktuellerMonat} {aktuellesJahr} sind vollständig eingegangen!</p>
          </CardContent>
        </Card>
      )}

      {/* Auslaufende Verträge */}
      {auslaufend.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-amber-700 flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Auslaufende Verträge (nächste 90 Tage)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auslaufend.map((v: Mietvertrag) => (
                <div key={v.id} className="flex items-center justify-between rounded bg-white p-3 shadow-sm">
                  <div>
                    <p className="font-medium text-sm">
                      {(v.mieter as { vorname?: string; nachname?: string } | undefined)?.vorname}{' '}
                      {(v.mieter as { vorname?: string; nachname?: string } | undefined)?.nachname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(v.mieteinheit as { bezeichnung?: string; mietobjekt?: { bezeichnung?: string } } | undefined)?.bezeichnung}
                      {' — '}
                      {(v.mieteinheit as { bezeichnung?: string; mietobjekt?: { bezeichnung?: string } } | undefined)?.mietobjekt?.bezeichnung}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-amber-700 border-amber-400 text-xs">
                      Ende: {v.ende ? new Date(v.ende).toLocaleDateString('de-DE') : '–'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Zahlung erfassen */}
      <Dialog open={editPayment !== null} onOpenChange={(o) => !o && setEditPayment(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Zahlung erfassen —{' '}
              {editPayment ? `${MONATE[editPayment.monat - 1]} ${editPayment.jahr}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editPayment?.bereitsGezahlt != null && editPayment.bereitsGezahlt > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Bisher gezahlt: <strong>{formatEuro(editPayment.bereitsGezahlt)}</strong> von {formatEuro(editPayment.sollBetrag)} — bitte den <strong>Gesamtbetrag</strong> eintragen.
              </p>
            )}
            <div>
              <Label>Ist-Betrag (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={istBetrag}
                onChange={(e) => setIstBetrag(e.target.value)}
              />
            </div>
            <div>
              <Label>Eingangsdatum</Label>
              <Input
                type="date"
                value={eingangsdat}
                onChange={(e) => setEingangsdat(e.target.value)}
              />
            </div>
            <div>
              <Label>Zahlungsart</Label>
              <Select value={zahlungsart} onValueChange={setZahlungsart}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UEBERWEISUNG">Überweisung</SelectItem>
                  <SelectItem value="LASTSCHRIFT">Lastschrift</SelectItem>
                  <SelectItem value="BAR">Bar</SelectItem>
                  <SelectItem value="SONSTIGE">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>Abbrechen</Button>
            <Button
              disabled={!istBetrag || !eingangsdat || zahlungErfassenMut.isPending}
              onClick={() => editPayment && zahlungErfassenMut.mutate(editPayment.id)}
            >
              {zahlungErfassenMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Kosten erfassen */}
      <Dialog open={kostenDialogOpen} onOpenChange={(o) => { if (!o) setKostenDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kosten erfassen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Mietobjekt</Label>
              <Select value={kosten.mietobjektID} onValueChange={(v) => setKosten((p) => ({ ...p, mietobjektID: v }))}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  {mietobjekte.map((o: Mietobjekt) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.bezeichnung}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategorie</Label>
              <Select value={kosten.kategorieKey} onValueChange={handleKategorieChange}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen…" /></SelectTrigger>
                <SelectContent>
                  {kategorien.map((k: KategorieMeta) => (
                    <SelectItem key={k.key} value={k.key}>
                      {k.label}{k.umlagefaehig ? '' : ' (nicht umlagefähig)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bezeichnung</Label>
              <Input
                value={kosten.bezeichnung}
                onChange={(e) => setKosten((p) => ({ ...p, bezeichnung: e.target.value }))}
                placeholder="z.B. Wasserrechnung Q1"
              />
            </div>
            <div>
              <Label>Betrag (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={kosten.betrag}
                onChange={(e) => setKosten((p) => ({ ...p, betrag: e.target.value }))}
              />
            </div>
            <div>
              <Label>Datum</Label>
              <Input
                type="date"
                value={kosten.datum}
                onChange={(e) => setKosten((p) => ({ ...p, datum: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKostenDialogOpen(false)}>Abbrechen</Button>
            <Button
              disabled={!kosten.mietobjektID || !kosten.kategorieKey || !kosten.bezeichnung || !kosten.betrag || kostenErfassenMut.isPending}
              onClick={() => kostenErfassenMut.mutate()}
            >
              {kostenErfassenMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
