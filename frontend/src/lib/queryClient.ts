import { QueryClient } from '@tanstack/react-query';

// Eigenes Modul statt einer Konstante in main.tsx: so kann auch der Auth-Speicher
// den Cache leeren, ohne den Einstiegspunkt der Anwendung importieren zu müssen.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});
