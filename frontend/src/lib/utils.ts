import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function formatDatum(dateStr: string | Date): string {
  return new Intl.DateTimeFormat('de-DE').format(new Date(dateStr));
}

// Liest eine Servermeldung aus einem Axios-Fehler aus. Manche Endpunkte antworten bei
// Validierungsfehlern mit einem Feldobjekt statt einer Zeichenkette — nur echte Strings
// werden angezeigt, sonst der uebergebene Standardtext (verhindert Absturz beim Toast-Rendering).
export function extractApiError(err: unknown, fallback: string): string {
  const nachricht = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof nachricht === 'string' ? nachricht : fallback;
}

export const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export const MONATE_KURZ = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];
