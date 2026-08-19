import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '../lib/queryClient';
import { Benutzer } from '../types';

interface AuthState {
  token: string | null;
  benutzer: Benutzer | null;
  setAuth: (token: string, benutzer: Benutzer) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      benutzer: null,
      // Bei jedem Wechsel der Anmeldung wird der Abfrage-Cache geleert. Ohne das
      // überlebten die Daten des vorherigen Kontos das Abmelden: React Query
      // hält sie zwei Minuten lang für frisch und liefert sie ohne Rückfrage
      // aus. Ein Kostenbucher sah dadurch die Dokumentenliste des zuvor
      // angemeldeten Verwalters — samt der Kategorien, die ihm verschlossen
      // sind. Der Server hat jede einzelne Anfrage korrekt abgewiesen, aber
      // gefragt wurde er gar nicht erst.
      setAuth: (token, benutzer) => {
        queryClient.clear();
        set({ token, benutzer });
      },
      logout: () => {
        queryClient.clear();
        set({ token: null, benutzer: null });
      },
    }),
    { name: 'mietverwaltung-auth' },
  ),
);
