import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/toaster';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { EigentuemerListe } from '@/pages/Eigentuemer/EigentuemerListe';
import { EigentuemerDetail } from '@/pages/Eigentuemer/EigentuemerDetail';
import { MietobjekteListe } from '@/pages/Mietobjekte/MietobjekteListe';
import { MietobjektDetail } from '@/pages/Mietobjekte/MietobjektDetail';
import { MieteinheitDetail } from '@/pages/Mieteinheiten/MieteinheitDetail';
import { MieterListe } from '@/pages/Mieter/MieterListe';
import { MieterDetail } from '@/pages/Mieter/MieterDetail';
import { MietvertraegeListe } from '@/pages/Mietvertraege/MietvertraegeListe';
import { MietvertragDetail } from '@/pages/Mietvertraege/MietvertragDetail';
import { KontakteListe } from '@/pages/Kontakte/KontakteListe';
import { KontaktDetail } from '@/pages/Kontakte/KontaktDetail';
import { ForderungenSeite } from '@/pages/Forderungen/ForderungenSeite';
import { FristenSeite } from '@/pages/Fristen/FristenSeite';
import { DokumenteSeite } from '@/pages/Dokumente/DokumenteSeite';
import { KostenListe } from '@/pages/Kosten/KostenListe';
import { NebenkostenSeite } from '@/pages/Nebenkosten/NebenkostenSeite';
import { Benutzerverwaltung } from '@/pages/Einstellungen/Benutzerverwaltung';
import { Systemeinstellungen } from '@/pages/Einstellungen/Systemeinstellungen';
import { useAuthStore } from '@/store/authStore';

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const benutzer = useAuthStore((s) => s.benutzer);
  if (!benutzer || !roles.includes(benutzer.rolle)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kontakte" element={<KontakteListe />} />
          <Route path="/kontakte/:id" element={<KontaktDetail />} />
          <Route path="/eigentuemer" element={<EigentuemerListe />} />
          <Route path="/eigentuemer/:id" element={<EigentuemerDetail />} />
          <Route path="/mietobjekte" element={<MietobjekteListe />} />
          <Route path="/mietobjekte/:id" element={<MietobjektDetail />} />
          <Route path="/mieteinheiten/:id" element={<MieteinheitDetail />} />
          <Route path="/mieter" element={<MieterListe />} />
          <Route path="/mieter/:id" element={<MieterDetail />} />
          <Route path="/mietvertraege" element={<MietvertraegeListe />} />
          <Route path="/mietvertraege/:id" element={<MietvertragDetail />} />
          <Route path="/forderungen" element={<ForderungenSeite />} />
          <Route path="/fristen" element={<FristenSeite />} />
          <Route path="/dokumente" element={<DokumenteSeite />} />
          <Route path="/kosten" element={<KostenListe />} />
          <Route path="/nebenkosten" element={<NebenkostenSeite />} />
          <Route path="/einstellungen/benutzer" element={
            <RequireRole roles={['ADMIN']}>
              <Benutzerverwaltung />
            </RequireRole>
          } />
          <Route path="/einstellungen/system" element={
            <RequireRole roles={['ADMIN']}>
              <Systemeinstellungen />
            </RequireRole>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
