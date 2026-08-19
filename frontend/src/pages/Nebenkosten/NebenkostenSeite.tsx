import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Mail, Trash2, AlertCircle, CheckCircle2, SkipForward, XCircle, FolderOpen } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { formatEuro, formatDatum } from '@/lib/utils';
import { NebenkostenAbrechnung } from '@/types';
import { DokumenteAbschnitt } from '@/pages/Dokumente/DokumenteAbschnitt';

interface NebenkostenVorschau {
  mietvertragID: number;
  abrechnungsjahr: number;
  mieterName: string;
  einheitBezeichnung: string;
  einheitFlaeche: number;
  positionen: Array<{
    kategorie: string;
    bezeichnung: string;
    gesamtkosten: number;
    umlageSchluessel: string;
    anteilFaktor: number;
    zeitraumFaktor: number;
    mieterAnteil: number;
  }>;
  gesamtkosten: number;
  mieterAnteil: number;
  geleisteteVZ: number;
  saldo: number;
}

const SCHLUESSEL_LABELS: Record<string, string> = {
  FLAECHE: 'Fläche', PERSONEN: 'Personen', EINHEIT: 'Einheit', VERBRAUCH: 'Verbrauch',
};

export function NebenkostenSeite() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('neu');

  // Generator state
  const [genVertragID, setGenVertragID] = useState('');
  const [genJahr, setGenJahr] = useState(new Date().getFullYear() - 1);
  const [genStart, setGenStart] = useState('');
  const [genEnde, setGenEnde] = useState('');
  const [vorschau, setVorschau] = useState<NebenkostenVorschau | null>(null);
  const [vorschauFehler, setVorschauFehler] = useState('');

  // E-Mail Dialog state
  const [mailDialog, setMailDialog] = useState(false);
  const [mailAbrechnungID, setMailAbrechnungID] = useState<number | null>(null);
  const [mailEmail, setMailEmail] = useState('');

  // Delete state
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Dokumente-Dialog state — analog zum Bearbeiten-Dialog in DokumenteTabelle.tsx:
  // die ausgewaehlte Abrechnung selbst (statt nur ihrer ID) haelt den Dialog offen und
  // liefert zugleich die Anzeigedaten fuer den Titel; beim Schliessen zurueck auf null
  const [dokumenteAbrechnung, setDokumenteAbrechnung] = useState<NebenkostenAbrechnung | null>(null);

  // Sammel-Erstellung state
  const [bulkJahr, setBulkJahr] = useState(new Date().getFullYear() - 1);
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnde, setBulkEnde] = useState('');
  const [bulkErgebnis, setBulkErgebnis] = useState<{
    erstellt: { mieterName: string; einheit: string }[];
    uebersprungen: { mieterName: string; einheit: string }[];
    fehler: { mieterName: string; einheit: string; fehler: string }[];
  } | null>(null);

  // Duplikat-Dialog state
  const [dupDialog, setDupDialog] = useState(false);
  const [dupAlteId, setDupAlteId] = useState<number | null>(null);

  const { data: aktiveVertraege = [] } = useQuery({
    queryKey: ['mietvertraege-aktiv'],
    queryFn: () => api.mietvertraege.list({ status: 'AKTIV' }).then((r) => r.data),
  });

  const { data: abrechnungen = [] } = useQuery({
    queryKey: ['nebenkosten-alle'],
    queryFn: () => api.nebenkosten.list().then((r) => r.data),
  });

  const vorschauMut = useMutation({
    mutationFn: () => api.nebenkosten.vorschau(parseInt(genVertragID), genJahr, genStart || undefined, genEnde || undefined),
    onSuccess: (res) => {
      setVorschau(res.data as NebenkostenVorschau);
      setVorschauFehler('');
    },
    onError: (err: unknown) => {
      setVorschau(null);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler bei der Vorschauberechnung';
      setVorschauFehler(msg);
    },
  });

  const createMut = useMutation({
    mutationFn: () => api.nebenkosten.create(parseInt(genVertragID), genJahr, undefined, genStart || undefined, genEnde || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      setVorschau(null);
      setActiveTab('gespeichert');
      setDupDialog(false);
      setDupAlteId(null);
      toast({ title: 'Abrechnung erstellt und gespeichert', variant: 'success' as never });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Fehler beim Erstellen';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const dupDeleteAndCreateMut = useMutation({
    mutationFn: async () => {
      if (dupAlteId) await api.nebenkosten.delete(dupAlteId);
      return api.nebenkosten.create(parseInt(genVertragID), genJahr, undefined, genStart || undefined, genEnde || undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      setVorschau(null);
      setActiveTab('gespeichert');
      setDupDialog(false);
      setDupAlteId(null);
      toast({ title: 'Abrechnung neu erstellt und gespeichert', variant: 'success' as never });
    },
    onError: () => toast({ title: 'Fehler beim Erstellen', variant: 'destructive' }),
  });

  const handleCreate = () => {
    const vorhandene = abrechnungen.find(
      (a) => a.mietvertragID === parseInt(genVertragID) && a.abrechnungsjahr === genJahr
    );
    if (vorhandene) {
      setDupAlteId(vorhandene.id);
      setDupDialog(true);
    } else {
      createMut.mutate();
    }
  };

  const sendMut = useMutation({
    mutationFn: () => api.nebenkosten.senden(mailAbrechnungID!, mailEmail || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      setMailDialog(false);
      toast({ title: 'Abrechnung versendet', variant: 'success' as never });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      const msg = e.response?.data?.error ?? 'E-Mail konnte nicht versendet werden.';
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      setMailDialog(false);
      toast({ title: 'Versand fehlgeschlagen', description: msg, variant: 'destructive' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.nebenkosten.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      setDeleteId(null);
      toast({ title: 'Abrechnung gelöscht' });
    },
    onError: () => toast({ title: 'Fehler beim Löschen', variant: 'destructive' }),
  });

  const beglichenMut = useMutation({
    mutationFn: ({ id, beglichen }: { id: number; beglichen: boolean }) =>
      api.nebenkosten.nachzahlungBeglichen(id, beglichen),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      qc.invalidateQueries({ queryKey: ['forderungen'] });
    },
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  const bulkMut = useMutation({
    mutationFn: () => api.nebenkosten.bulkErstellen(bulkJahr, bulkStart || undefined, bulkEnde || undefined),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nebenkosten-alle'] });
      setBulkErgebnis(res.data);
    },
    onError: () => toast({ title: 'Fehler bei der Sammel-Erstellung', variant: 'destructive' }),
  });

  const downloadPdf = async (id: number, jahr: number) => {
    const res = await api.nebenkosten.downloadPdf(id);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nebenkostenabrechnung_${jahr}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openMailDialog = (a: NebenkostenAbrechnung) => {
    setMailAbrechnungID(a.id);
    const m = (a.mietvertrag as { mieter?: { email?: string } })?.mieter;
    setMailEmail(m?.email ?? '');
    setMailDialog(true);
  };

  return (
    <div>
      <PageHeader title="Nebenkostenabrechnung" description="Jährliche Betriebskostenabrechnungen erstellen und verwalten" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="neu">Neue Abrechnung</TabsTrigger>
          <TabsTrigger value="gespeichert">Gespeicherte Abrechnungen ({abrechnungen.length})</TabsTrigger>
          <TabsTrigger value="sammel">Sammel-Erstellung</TabsTrigger>
        </TabsList>

        <TabsContent value="neu" className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <Label>Mietvertrag (aktiv)</Label>
                  <Select value={genVertragID} onValueChange={(v) => { setGenVertragID(v); setVorschau(null); setVorschauFehler(''); }}>
                    <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                    <SelectContent>
                      {aktiveVertraege.map((v) => {
                        const m = v.mieter;
                        const e = v.mieteinheit as { bezeichnung?: string; mietobjekt?: { bezeichnung?: string } };
                        return (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            {m?.vorname} {m?.nachname} — {e?.bezeichnung} ({e?.mietobjekt?.bezeichnung})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Abrechnungsjahr</Label>
                  <Input
                    type="number"
                    value={genJahr}
                    onChange={(e) => { setGenJahr(parseInt(e.target.value)); setVorschau(null); setVorschauFehler(''); }}
                  />
                </div>
                <Button
                  onClick={() => vorschauMut.mutate()}
                  disabled={!genVertragID || vorschauMut.isPending}
                >
                  {vorschauMut.isPending ? 'Berechnen…' : 'Vorschau berechnen'}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Zeitraum Von <span className="italic">(optional, Standard: 01.01.)</span>
                  </Label>
                  <Input
                    type="date"
                    value={genStart}
                    onChange={(e) => { setGenStart(e.target.value); setVorschau(null); setVorschauFehler(''); }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Zeitraum Bis <span className="italic">(optional, Standard: 31.12.)</span>
                  </Label>
                  <Input
                    type="date"
                    value={genEnde}
                    onChange={(e) => { setGenEnde(e.target.value); setVorschau(null); setVorschauFehler(''); }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {vorschauFehler && (
            <div className="flex items-center gap-2 p-4 border border-red-200 bg-red-50 rounded-lg text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm">{vorschauFehler}</p>
            </div>
          )}

          {vorschau && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Vorschau: {vorschau.abrechnungsjahr}</h2>
                  <p className="text-sm text-muted-foreground">
                    {vorschau.mieterName} · {vorschau.einheitBezeichnung} · {vorschau.einheitFlaeche.toFixed(1)} m²
                  </p>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={createMut.isPending || dupDeleteAndCreateMut.isPending}
                >
                  {createMut.isPending || dupDeleteAndCreateMut.isPending ? 'Erstellen…' : 'Abrechnung erstellen & speichern'}
                </Button>
              </div>

              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                      <th className="text-right px-4 py-3 font-medium">Gesamtkosten</th>
                      <th className="text-left px-4 py-3 font-medium">Schlüssel</th>
                      <th className="text-right px-4 py-3 font-medium">Anteil</th>
                      <th className="text-right px-4 py-3 font-medium">Zeitraum</th>
                      <th className="text-right px-4 py-3 font-medium">Mieteranteil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vorschau.positionen.map((p, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.bezeichnung}</p>
                          <p className="text-xs text-muted-foreground">{p.kategorie.replace(/_/g, ' ')}</p>
                        </td>
                        <td className="px-4 py-3 text-right">{formatEuro(p.gesamtkosten)}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{SCHLUESSEL_LABELS[p.umlageSchluessel]}</Badge></td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{(p.anteilFaktor * 100).toFixed(2)} %</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{(p.zeitraumFaktor * 100).toFixed(1)} %</td>
                        <td className="px-4 py-3 text-right font-medium">{formatEuro(p.mieterAnteil)}</td>
                      </tr>
                    ))}
                    {vorschau.positionen.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Keine umlagefähigen Kosten gefunden</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Card>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Gesamtkosten</p>
                      <p className="font-semibold text-lg">{formatEuro(vorschau.gesamtkosten)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Mieteranteil</p>
                      <p className="font-semibold text-lg">{formatEuro(vorschau.mieterAnteil)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Geleistete Vorauszahlungen</p>
                      <p className="font-semibold text-lg">{formatEuro(vorschau.geleisteteVZ)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Saldo</p>
                      <p className={`font-bold text-xl ${vorschau.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatEuro(vorschau.saldo)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {vorschau.saldo > 0 ? 'Nachzahlung durch Mieter' : 'Guthaben für Mieter'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sammel" className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Erstellt Nebenkostenabrechnungen für <strong>alle aktiven Mietverträge</strong> auf einmal.
                Verträge, für die bereits eine Abrechnung für das gewählte Jahr existiert, werden übersprungen.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <Label>Abrechnungsjahr</Label>
                  <Input
                    type="number"
                    value={bulkJahr}
                    onChange={(e) => { setBulkJahr(parseInt(e.target.value)); setBulkErgebnis(null); }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Zeitraum Von <span className="italic">(optional)</span></Label>
                  <Input type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Zeitraum Bis <span className="italic">(optional)</span></Label>
                  <Input type="date" value={bulkEnde} onChange={(e) => setBulkEnde(e.target.value)} />
                </div>
              </div>
              <Button
                onClick={() => { setBulkErgebnis(null); bulkMut.mutate(); }}
                disabled={bulkMut.isPending}
                className="w-full md:w-auto"
              >
                {bulkMut.isPending ? 'Erstelle Abrechnungen…' : `Alle Abrechnungen für ${bulkJahr} erstellen`}
              </Button>
            </CardContent>
          </Card>

          {bulkMut.isPending && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Bitte warten – Abrechnungen und PDFs werden erstellt…
            </div>
          )}

          {bulkErgebnis && (
            <div className="space-y-4">
              {/* Zusammenfassung */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-green-700">{bulkErgebnis.erstellt.length}</p>
                  <p className="text-sm text-green-700">Erstellt</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                  <SkipForward className="h-6 w-6 text-gray-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-gray-600">{bulkErgebnis.uebersprungen.length}</p>
                  <p className="text-sm text-gray-600">Übersprungen</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
                  <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-600">{bulkErgebnis.fehler.length}</p>
                  <p className="text-sm text-red-600">Fehler</p>
                </div>
              </div>

              {/* Detailliste */}
              {bulkErgebnis.erstellt.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-green-700 mb-2">Erfolgreich erstellt</p>
                  <div className="space-y-1">
                    {bulkErgebnis.erstellt.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-green-50 border border-green-100 rounded px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="font-medium">{r.mieterName}</span>
                        <span className="text-muted-foreground">— {r.einheit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkErgebnis.uebersprungen.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Übersprungen (bereits vorhanden)</p>
                  <div className="space-y-1">
                    {bulkErgebnis.uebersprungen.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-100 rounded px-3 py-2">
                        <SkipForward className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium">{r.mieterName}</span>
                        <span className="text-muted-foreground">— {r.einheit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkErgebnis.fehler.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-700 mb-2">Fehler</p>
                  <div className="space-y-1">
                    {bulkErgebnis.fehler.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm bg-red-50 border border-red-100 rounded px-3 py-2">
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">{r.mieterName}</span>
                          <span className="text-muted-foreground"> — {r.einheit}</span>
                          <p className="text-xs text-red-600 mt-0.5">{r.fehler}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="gespeichert">
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Jahr</th>
                  <th className="text-left px-4 py-3 font-medium">Mieter</th>
                  <th className="text-left px-4 py-3 font-medium">Einheit</th>
                  <th className="text-left px-4 py-3 font-medium">Mietobjekt</th>
                  <th className="text-right px-4 py-3 font-medium">Mieteranteil</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo</th>
                  <th className="text-center px-4 py-3 font-medium">Versandt</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {abrechnungen.map((a) => {
                  const mv = a.mietvertrag as {
                    mieter?: { vorname?: string; nachname?: string; email?: string };
                    mieteinheit?: { bezeichnung?: string; mietobjekt?: { bezeichnung?: string } };
                  };
                  return (
                    <tr key={a.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{a.abrechnungsjahr}</td>
                      <td className="px-4 py-3">{mv?.mieter?.vorname} {mv?.mieter?.nachname}</td>
                      <td className="px-4 py-3 text-muted-foreground">{mv?.mieteinheit?.bezeichnung}</td>
                      <td className="px-4 py-3 text-muted-foreground">{mv?.mieteinheit?.mietobjekt?.bezeichnung}</td>
                      <td className="px-4 py-3 text-right">{formatEuro(Number(a.mieterAnteil))}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${Number(a.saldo) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatEuro(Number(a.saldo))}
                        <span className="text-xs font-normal ml-1 text-muted-foreground">
                          {Number(a.saldo) > 0 ? '↑ Nachz.' : '↓ Gut.'}
                        </span>
                        {Number(a.saldo) > 0 && (
                          <div className="mt-1 font-normal">
                            {a.nachzahlungBeglichenAm ? (
                              <span className="text-xs text-green-700">
                                Nachzahlung beglichen {formatDatum(a.nachzahlungBeglichenAm)}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ml-1 h-6 px-2 text-xs"
                                  onClick={() => beglichenMut.mutate({ id: a.id, beglichen: false })}
                                >
                                  rückgängig
                                </Button>
                              </span>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => beglichenMut.mutate({ id: a.id, beglichen: true })}
                              >
                                Nachzahlung beglichen
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {a.versandtAm
                          ? <span className="text-xs text-green-600">{formatDatum(a.versandtAm)}</span>
                          : a.versandFehlerlog
                            ? <span title={a.versandFehlerlog} className="text-xs text-red-500 flex items-center gap-1 justify-center cursor-help">
                                <AlertCircle className="h-3 w-3 flex-shrink-0" /> Fehlgeschlagen
                              </span>
                            : <span className="text-xs text-muted-foreground">–</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {a.hatPdf && (
                            <Button variant="ghost" size="icon" title="PDF herunterladen" onClick={() => downloadPdf(a.id, a.abrechnungsjahr)}>
                              <FileText className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Per E-Mail versenden"
                            onClick={() => openMailDialog(a)}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Dokumente"
                            onClick={() => setDokumenteAbrechnung(a)}
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Löschen"
                            onClick={() => setDeleteId(a.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {abrechnungen.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Keine Abrechnungen vorhanden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* E-Mail-Dialog */}
      <Dialog open={mailDialog} onOpenChange={setMailDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Abrechnung per E-Mail senden</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Die PDF-Abrechnung wird als Anhang an folgende Adresse gesendet:
            </p>
            <div>
              <Label>E-Mail-Adresse *</Label>
              <Input
                type="email"
                value={mailEmail}
                onChange={(e) => setMailEmail(e.target.value)}
                placeholder="mieter@beispiel.de"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMailDialog(false)}>Abbrechen</Button>
            <Button
              disabled={!mailEmail || sendMut.isPending}
              onClick={() => sendMut.mutate()}
            >
              {sendMut.isPending ? 'Senden…' : 'Senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dokumente-Dialog — Bezug ist die einzelne Abrechnung, kein fest verdrahteter Abschnitt
          moeglich, da NebenkostenSeite eine Listenseite ohne eindeutigen Detail-Bezug ist */}
      <Dialog open={dokumenteAbrechnung !== null} onOpenChange={(o) => { if (!o) setDokumenteAbrechnung(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {dokumenteAbrechnung && (() => {
                const mv = dokumenteAbrechnung.mietvertrag as {
                  mieter?: { vorname?: string; nachname?: string };
                  mieteinheit?: { bezeichnung?: string };
                };
                const bezugsLabel = mv?.mieter
                  ? `${mv.mieter.vorname ?? ''} ${mv.mieter.nachname ?? ''}`.trim()
                  : mv?.mieteinheit?.bezeichnung;
                return `Dokumente — Abrechnung ${dokumenteAbrechnung.abrechnungsjahr}${bezugsLabel ? ` · ${bezugsLabel}` : ''}`;
              })()}
            </DialogTitle>
          </DialogHeader>
          {dokumenteAbrechnung && <DokumenteAbschnitt bezug={{ abrechnungID: dokumenteAbrechnung.id }} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dupDialog}
        onOpenChange={(o) => { if (!o) { setDupDialog(false); setDupAlteId(null); } }}
        title="Abrechnung bereits vorhanden"
        description={`Für das Jahr ${genJahr} existiert bereits eine Abrechnung. Soll diese gelöscht und neu erstellt werden?`}
        onConfirm={() => dupDeleteAndCreateMut.mutate()}
        loading={dupDeleteAndCreateMut.isPending}
        confirmLabel="Löschen & neu erstellen"
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Abrechnung löschen"
        description="Die Abrechnung und alle zugehörigen Positionen werden unwiderruflich gelöscht."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
        confirmLabel="Löschen"
        variant="destructive"
      />
    </div>
  );
}
