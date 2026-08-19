import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/api';
import { useToast } from '@/hooks/useToast';

type SmtpForm = {
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  mahn_gebuehr: string;
  mahn_karenz_tage: string;
  mahn_wartefrist_tage: string;
  mahn_zahlungsfrist_tage: string;
  frist_vorlauf_nka_tage: string;
  frist_vorlauf_vertragsende_tage: string;
  frist_vorlauf_manuell_tage: string;
};

export function Systemeinstellungen() {
  const { toast } = useToast();

  const { data: einstellungen } = useQuery({
    queryKey: ['einstellungen'],
    queryFn: () => api.einstellungen.get().then((r) => r.data),
  });

  const { register, handleSubmit, reset, watch, setValue } = useForm<SmtpForm>({
    defaultValues: { smtp_port: '587', smtp_secure: false },
  });

  useEffect(() => {
    if (einstellungen) {
      reset({
        smtp_host: einstellungen.smtp_host ?? '',
        smtp_port: einstellungen.smtp_port ?? '587',
        smtp_secure: einstellungen.smtp_secure === 'true',
        smtp_user: einstellungen.smtp_user ?? '',
        smtp_pass: '',
        smtp_from: einstellungen.smtp_from ?? '',
        mahn_gebuehr: einstellungen.mahn_gebuehr ?? '',
        mahn_karenz_tage: einstellungen.mahn_karenz_tage ?? '',
        mahn_wartefrist_tage: einstellungen.mahn_wartefrist_tage ?? '',
        mahn_zahlungsfrist_tage: einstellungen.mahn_zahlungsfrist_tage ?? '',
        frist_vorlauf_nka_tage: einstellungen.frist_vorlauf_nka_tage ?? '',
        frist_vorlauf_vertragsende_tage: einstellungen.frist_vorlauf_vertragsende_tage ?? '',
        frist_vorlauf_manuell_tage: einstellungen.frist_vorlauf_manuell_tage ?? '',
      });
    }
  }, [einstellungen, reset]);

  const saveMut = useMutation({
    mutationFn: (data: SmtpForm) => {
      const payload: Record<string, string> = {
        smtp_host: data.smtp_host,
        smtp_port: data.smtp_port,
        smtp_secure: data.smtp_secure ? 'true' : 'false',
        smtp_user: data.smtp_user,
        smtp_from: data.smtp_from,
        mahn_gebuehr: data.mahn_gebuehr,
        mahn_karenz_tage: data.mahn_karenz_tage,
        mahn_wartefrist_tage: data.mahn_wartefrist_tage,
        mahn_zahlungsfrist_tage: data.mahn_zahlungsfrist_tage,
        frist_vorlauf_nka_tage: data.frist_vorlauf_nka_tage,
        frist_vorlauf_vertragsende_tage: data.frist_vorlauf_vertragsende_tage,
        frist_vorlauf_manuell_tage: data.frist_vorlauf_manuell_tage,
      };
      if (data.smtp_pass) payload.smtp_pass = data.smtp_pass;
      return api.einstellungen.update(payload);
    },
    onSuccess: () => toast({ title: 'Einstellungen gespeichert', variant: 'success' as never }),
    onError: () => toast({ title: 'Fehler beim Speichern', variant: 'destructive' }),
  });

  const smtpSecure = watch('smtp_secure');

  return (
    <div>
      <PageHeader title="Systemeinstellungen" description="SMTP-Konfiguration, Mahnwesen und Fristen" />

      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="space-y-6">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">E-Mail / SMTP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>SMTP-Server (Host)</Label>
                <Input {...register('smtp_host')} placeholder="smtp.gmail.com" />
              </div>
              <div>
                <Label>Port</Label>
                <Input type="number" {...register('smtp_port')} placeholder="587" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="smtp_secure"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={smtpSecure}
                  onChange={(e) => setValue('smtp_secure', e.target.checked)}
                />
                <Label htmlFor="smtp_secure">SSL/TLS (Port 465)</Label>
              </div>
              <div className="col-span-2">
                <Label>Benutzername</Label>
                <Input {...register('smtp_user')} placeholder="deine@email.de" />
              </div>
              <div className="col-span-2">
                <Label>Passwort {einstellungen?.smtp_pass ? '(leer = unverändert)' : ''}</Label>
                <Input type="password" {...register('smtp_pass')} placeholder={einstellungen?.smtp_pass ? '••••••••' : 'Passwort eingeben'} />
              </div>
              <div className="col-span-2">
                <Label>Absender-Adresse</Label>
                <Input {...register('smtp_from')} placeholder='Mietverwaltung <noreply@example.com>' />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Mahnwesen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mahngebühr (€, ab 1. Mahnung)</Label>
                <Input type="number" step="0.5" placeholder="5.00" {...register('mahn_gebuehr')} />
              </div>
              <div>
                <Label>Karenztage nach Fälligkeit</Label>
                <Input type="number" placeholder="5" {...register('mahn_karenz_tage')} />
              </div>
              <div>
                <Label>Wartefrist zwischen Mahnstufen (Tage)</Label>
                <Input type="number" placeholder="14" {...register('mahn_wartefrist_tage')} />
              </div>
              <div>
                <Label>Zahlungsfrist im Schreiben (Tage)</Label>
                <Input type="number" placeholder="10" {...register('mahn_zahlungsfrist_tage')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Fristen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vorlauf NKA-Frist (Tage)</Label>
                <Input type="number" placeholder="90" {...register('frist_vorlauf_nka_tage')} />
              </div>
              <div>
                <Label>Vorlauf Vertragsende (Tage)</Label>
                <Input type="number" placeholder="90" {...register('frist_vorlauf_vertragsende_tage')} />
              </div>
              <div>
                <Label>Vorlauf manuelle Fristen (Tage)</Label>
                <Input type="number" placeholder="28" {...register('frist_vorlauf_manuell_tage')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saveMut.isPending} className="max-w-xl">
          {saveMut.isPending ? 'Speichern…' : 'Einstellungen speichern'}
        </Button>
      </form>
    </div>
  );
}
