import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { DokumentFilter } from '@/types';
import { DOKUMENT_ROLLEN, DokumentUploadDialog } from './DokumentUploadDialog';
import { DokumenteTabelle } from './DokumenteTabelle';

// Bezug wird sowohl zum Filtern als auch als Vorbelegung des Uploads verwendet
export function DokumenteAbschnitt({ bezug }: { bezug: DokumentFilter }) {
  const rolle = useAuthStore((s) => s.benutzer?.rolle);
  const darfSchreiben = rolle ? DOKUMENT_ROLLEN.includes(rolle) : false;
  const [dialogOffen, setDialogOffen] = useState(false);

  const { data: dokumente = [], isLoading, isError } = useQuery({
    queryKey: ['dokumente', bezug],
    queryFn: () => api.dokumente.list(bezug).then((r) => r.data),
  });

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center pb-2">
        <CardTitle className="text-base">Dokumente ({dokumente.length})</CardTitle>
        {darfSchreiben && (
          <Button size="sm" className="ml-auto" onClick={() => setDialogOffen(true)}>Hochladen</Button>
        )}
      </CardHeader>
      <CardContent>
        {/* Ohne eigene Zustaende saehe ein Serverfehler aus wie ein leeres Archiv */}
        {isLoading && <p className="py-4 text-sm text-muted-foreground">Dokumente werden geladen …</p>}
        {isError && (
          <p className="py-4 text-sm text-destructive">Dokumente konnten nicht geladen werden.</p>
        )}
        {!isLoading && !isError && <DokumenteTabelle dokumente={dokumente} />}
        <DokumentUploadDialog offen={dialogOffen} onClose={() => setDialogOffen(false)} bezug={bezug} />
      </CardContent>
    </Card>
  );
}
