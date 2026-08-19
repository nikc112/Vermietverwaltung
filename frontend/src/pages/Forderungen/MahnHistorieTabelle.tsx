import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, Mail, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { formatDatum, formatEuro } from '@/lib/utils';
import { Mahnung, MahnStufe } from '@/types';

export const STUFEN_LABELS: Record<MahnStufe, string> = {
  ZAHLUNGSERINNERUNG: 'Zahlungserinnerung',
  MAHNUNG_1: '1. Mahnung',
  MAHNUNG_2: '2. Mahnung',
};

const LOESCH_ROLLEN = ['ADMIN', 'VOLLZUGRIFF'];
export const MAHN_ROLLEN = ['ADMIN', 'VOLLZUGRIFF', 'VERTRAGSVERWALTER'];

export function MahnHistorieTabelle({ kontaktID }: { kontaktID?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const darfLoeschen = rolle ? LOESCH_ROLLEN.includes(rolle) : false;
  const darfMahnen = rolle ? MAHN_ROLLEN.includes(rolle) : false;
  const [loeschKandidat, setLoeschKandidat] = useState<Mahnung | null>(null);

  const { data: mahnungen = [] } = useQuery({
    queryKey: ['mahnungen', kontaktID ?? 'alle'],
    queryFn: () => api.mahnungen.list(kontaktID ? { kontaktID } : undefined).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mahnungen'] });
    qc.invalidateQueries({ queryKey: ['forderungen'] });
  };

  const versendenMut = useMutation({
    mutationFn: (id: number) => api.mahnungen.versenden(id),
    onSuccess: () => { invalidate(); toast({ title: 'Mahnung versendet', variant: 'success' as never }); },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast({ title: err.response?.data?.error ?? 'Versand fehlgeschlagen', variant: 'destructive' }),
  });

  const gebuehrMut = useMutation({
    mutationFn: ({ id, beglichen }: { id: number; beglichen: boolean }) => api.mahnungen.gebuehrBeglichen(id, beglichen),
    onSuccess: invalidate,
    onError: () => toast({ title: 'Fehler', variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.mahnungen.delete(id),
    onSuccess: () => { invalidate(); setLoeschKandidat(null); toast({ title: 'Mahnung gelöscht', variant: 'success' as never }); },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast({ title: err.response?.data?.message ?? 'Löschen nicht möglich', variant: 'destructive' });
      setLoeschKandidat(null);
    },
  });

  const pdfDownload = async (m: Mahnung) => {
    const res = await api.mahnungen.pdf(m.id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mahnung_${m.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Jüngste Mahnung je Kontakt (nur die ist löschbar)
  const juengsteJeKontakt = new Map<number, number>();
  for (const m of mahnungen) {
    const bisher = juengsteJeKontakt.get(m.kontaktID);
    if (bisher === undefined || new Date(m.datum) > new Date(mahnungen.find((x) => x.id === bisher)!.datum)) {
      juengsteJeKontakt.set(m.kontaktID, m.id);
    }
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Datum</th>
            {!kontaktID && <th className="text-left px-4 py-3 font-medium">Kontakt</th>}
            <th className="text-left px-4 py-3 font-medium">Stufe</th>
            <th className="text-right px-4 py-3 font-medium">Betrag</th>
            <th className="text-left px-4 py-3 font-medium">Gebühr</th>
            <th className="text-left px-4 py-3 font-medium">Versand</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {mahnungen.map((m) => (
            <tr key={m.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3">{formatDatum(m.datum)}</td>
              {!kontaktID && (
                <td className="px-4 py-3">
                  <Link className="hover:underline" to={`/kontakte/${m.kontaktID}`}>
                    {m.kontakt?.firma?.trim() ? m.kontakt.firma : `${m.kontakt?.vorname ?? ''} ${m.kontakt?.nachname ?? ''}`.trim()}
                  </Link>
                </td>
              )}
              <td className="px-4 py-3"><Badge variant="secondary">{STUFEN_LABELS[m.stufe]}</Badge></td>
              <td className="px-4 py-3 text-right font-medium">{formatEuro(Number(m.gesamtbetrag))}</td>
              <td className="px-4 py-3">
                {Number(m.gebuehr) > 0 ? (
                  darfMahnen ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={!!m.gebuehrBeglichenAm}
                        onChange={(e) => gebuehrMut.mutate({ id: m.id, beglichen: e.target.checked })}
                      />
                      beglichen
                    </label>
                  ) : (
                    <span className="text-xs">{m.gebuehrBeglichenAm ? 'beglichen' : '–'}</span>
                  )
                ) : (
                  <span className="text-muted-foreground text-xs">–</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {m.versandtAm ? (
                  <span className="text-green-700">versendet {formatDatum(m.versandtAm)}</span>
                ) : m.versandFehlerlog ? (
                  <span className="text-red-600" title={m.versandFehlerlog}>Fehler ({m.versandVersuche} Versuche)</span>
                ) : (
                  <span className="text-muted-foreground">nicht versendet</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end">
                  {darfMahnen && m.hatPdf && (
                    <Button variant="ghost" size="icon" title="PDF herunterladen" onClick={() => pdfDownload(m)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {darfMahnen && m.hatPdf && !m.versandtAm && (
                    <Button variant="ghost" size="icon" title="Per E-Mail senden" disabled={versendenMut.isPending} onClick={() => versendenMut.mutate(m.id)}>
                      <Mail className="h-4 w-4" />
                    </Button>
                  )}
                  {darfLoeschen && juengsteJeKontakt.get(m.kontaktID) === m.id && (
                    <Button variant="ghost" size="icon" title="Löschen" onClick={() => setLoeschKandidat(m)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {mahnungen.length === 0 && (
            <tr><td colSpan={kontaktID ? 6 : 7} className="text-center py-8 text-muted-foreground">Keine Mahnungen vorhanden</td></tr>
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={loeschKandidat !== null}
        onOpenChange={(o) => { if (!o) setLoeschKandidat(null); }}
        title="Mahnung löschen?"
        description={`Die ${loeschKandidat ? STUFEN_LABELS[loeschKandidat.stufe] : ''} vom ${loeschKandidat ? formatDatum(loeschKandidat.datum) : ''} wird endgültig gelöscht. Die enthaltenen Posten gelten dann wieder als nicht gemahnt (diese Stufe).`}
        onConfirm={() => loeschKandidat && deleteMut.mutate(loeschKandidat.id)}
      />
    </div>
  );
}
