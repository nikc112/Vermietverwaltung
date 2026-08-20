import { AppError } from './errors';

export interface Fehlerantwort {
  status: number;
  nachricht: string;
  /** 5xx wird protokolliert, 4xx nicht -- sonst fuellt jeder Tippfehler das Protokoll. */
  protokollieren: boolean;
}

/**
 * Uebersetzt einen geworfenen Fehler in das, was der Client zu sehen bekommt.
 *
 * Leitgedanke: 4xx sind Fehler des Aufrufers und duerfen erklaert werden, 5xx
 * sind Fehler des Servers und duerfen es nicht. Ein Stacktrace, ein Dateipfad
 * oder eine Datenbankmeldung nach aussen verraet Aufbau und Ablageorte --
 * genau die Aufklaerung, die ein Angreifer vor dem eigentlichen Versuch sucht.
 */
export function bestimmeFehlerantwort(fehler: unknown): Fehlerantwort {
  if (fehler instanceof AppError) {
    return { status: fehler.statusCode, nachricht: fehler.message, protokollieren: false };
  }
  const status = leseStatus(fehler);
  if (status >= 400 && status < 500) {
    return { status, nachricht: leseNachricht(fehler, status), protokollieren: false };
  }
  return { status: 500, nachricht: 'Interner Serverfehler', protokollieren: true };
}

function leseStatus(fehler: unknown): number {
  if (typeof fehler !== 'object' || fehler === null) return 500;
  const wert = (fehler as { statusCode?: unknown }).statusCode;
  return typeof wert === 'number' ? wert : 500;
}

// Die Meldungen, die Fastify und seine Plugins selbst erzeugen (415, 413, 429,
// fehlerhaftes JSON), sind fuer den Aufrufer gedacht und enthalten nichts
// Internes. Fehlt eine, bleibt es beim Sammelbegriff der Statusklasse.
function leseNachricht(fehler: unknown, status: number): string {
  const roh = typeof fehler === 'object' && fehler !== null
    ? (fehler as { message?: unknown }).message
    : undefined;
  if (typeof roh === 'string' && roh.length > 0) return roh;
  return status === 429 ? 'Zu viele Anfragen. Bitte kurz warten.' : 'Ungültige Anfrage';
}
