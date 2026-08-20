/**
 * Regeln fuer die Anmelde-Tokens -- bewusst ohne Fastify-Import, damit sie ohne
 * laufenden Server pruefbar sind.
 */

// Fest verdrahtet und NICHT aus dem Token uebernommen. Wer den Algorithmus aus
// dem Header liest, laesst sich vom Angreifer vorschreiben, womit geprueft wird:
// "alg":"none" verlangt gar keine Signatur mehr, und ein HMAC-Verifier, dem man
// "RS256" unterschiebt, prueft den oeffentlichen Schluessel als HMAC-Geheimnis.
export const JWT_ALGORITHMUS = 'HS256' as const;

export const MINDESTLAENGE_GEHEIMNIS = 32;

// Laenge allein sagt nichts: 40-mal "a" ist 40 Zeichen und trotzdem in einem
// Versuch geraten. Verlangt wird zusaetzlich eine Mindestzahl verschiedener
// Zeichen. 16 passieren alle uebliche Zufallsausgaben (openssl rand -base64 36
// liefert typischerweise ueber 30) und scheitern an Wiederholungsmustern.
export const MINDESTVIELFALT_GEHEIMNIS = 16;

// Platzhalter aus Vorlagen und Anleitungen. Sie sind lang genug und vielfaeltig
// genug -- und stehen woertlich in einem oeffentlichen Repository.
const PLATZHALTER = ['changeme', 'geheim', 'secret', 'example', 'password', 'bitte-aendern'];

/** Gibt den Grund der Ablehnung zurueck, oder null wenn das Geheimnis taugt. */
export function pruefeGeheimnis(geheimnis: string): string | null {
  if (geheimnis.length < MINDESTLAENGE_GEHEIMNIS) {
    return `JWT_SECRET muss mindestens ${MINDESTLAENGE_GEHEIMNIS} Zeichen lang sein`;
  }
  const verschiedene = new Set(geheimnis).size;
  if (verschiedene < MINDESTVIELFALT_GEHEIMNIS) {
    return `JWT_SECRET ist zu eintoenig (${verschiedene} verschiedene Zeichen, mindestens ${MINDESTVIELFALT_GEHEIMNIS} noetig) -- bitte "openssl rand -base64 36" verwenden`;
  }
  const klein = geheimnis.toLowerCase();
  if (PLATZHALTER.some((p) => klein.includes(p))) {
    return 'JWT_SECRET enthält einen Platzhalter aus der Vorlage -- bitte "openssl rand -base64 36" verwenden';
  }
  return null;
}

// Erlaubt sind eine reine Millisekundenzahl oder die von fast-jwt verstandenen
// Kurzformen. Ein leerer Wert kaeme sonst durch und erzeugte ein Token ganz
// OHNE exp-Feld -- eine Anmeldung, die nie ablaeuft, und niemand merkte es.
const LAUFZEIT_MUSTER = /^\d+(\s?(ms|s|m|h|d|w|y|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|year|years))?$/i;

/** Gibt den Grund der Ablehnung zurueck, oder null wenn die Laufzeit taugt. */
export function pruefeLaufzeit(wert: string): string | null {
  if (!LAUFZEIT_MUSTER.test(wert.trim())) {
    return 'JWT_EXPIRES_IN muss eine Zeitspanne wie "7d", "12h" oder "3600000" sein';
  }
  return null;
}

export interface JwtOptionen {
  secret: string;
  sign: { algorithm: typeof JWT_ALGORITHMUS; expiresIn: string };
  verify: { algorithms: [typeof JWT_ALGORITHMUS]; maxAge: string };
}

/**
 * Beim Signieren wird der Algorithmus gesetzt, beim Pruefen wird er erzwungen.
 * maxAge begrenzt die Gueltigkeit zusaetzlich serverseitig: selbst ein Token mit
 * weit in der Zukunft liegendem exp wird abgelehnt, sobald es aelter als die
 * konfigurierte Laufzeit ist.
 */
export function erzeugeJwtOptionen(geheimnis: string, laufzeit: string): JwtOptionen {
  const grund = pruefeGeheimnis(geheimnis) ?? pruefeLaufzeit(laufzeit);
  if (grund) {
    throw new Error(grund);
  }
  return {
    secret: geheimnis,
    sign: { algorithm: JWT_ALGORITHMUS, expiresIn: laufzeit },
    verify: { algorithms: [JWT_ALGORITHMUS], maxAge: laufzeit },
  };
}
