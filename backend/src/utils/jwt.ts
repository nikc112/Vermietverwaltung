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

/**
 * Untergrenze fuer verschiedene Zeichen. Faengt Geheimnisse aus einem winzigen
 * Alphabet -- "ab" abwechselnd, ein achtstelliges Muster wiederholt.
 */
export const MINDESTVIELFALT_GEHEIMNIS = 10;

/**
 * Untergrenze fuer den Informationsgehalt in Bit.
 *
 * Frueher stand hier allein "mindestens 16 verschiedene Zeichen". Das war
 * falsch, und zwar auf eine Weise, die ausgerechnet die gute Empfehlung traf:
 * "openssl rand -hex 32" erzeugt 64 Zeichen aus einem Alphabet von 16, und in
 * 23 Prozent der Faelle kommen dabei nicht alle 16 vor. Ein
 * kryptografisch einwandfreies Geheimnis mit 256 Bit waere also in jedem
 * vierten Fall als "zu eintoenig" abgewiesen worden.
 *
 * Gezaehlt wird deshalb nicht mehr, WIE VIELE Zeichen vorkommen, sondern wie
 * viel Information darin steckt. 128 Bit sind die uebliche Schwelle, unterhalb
 * derer ein Geheimnis als angreifbar gilt; jede Ausgabe von "openssl rand"
 * liegt weit darueber (gemessen: schlechtester Fall aus 200.000 Durchlaeufen
 * 218 Bit bei -hex 32, 206 Bit bei -base64 36).
 */
export const MINDESTENTROPIE_BIT = 128;

/** Informationsgehalt nach Shannon, in Bit fuer die gesamte Zeichenkette. */
export function entropieBit(text: string): number {
  if (text.length === 0) return 0;
  const haeufigkeit = new Map<string, number>();
  for (const zeichen of text) {
    haeufigkeit.set(zeichen, (haeufigkeit.get(zeichen) ?? 0) + 1);
  }
  let jeZeichen = 0;
  for (const anzahl of haeufigkeit.values()) {
    const anteil = anzahl / text.length;
    jeZeichen -= anteil * Math.log2(anteil);
  }
  return jeZeichen * text.length;
}

// Platzhalter aus Vorlagen und Anleitungen. Sie sind lang genug, vielfaeltig
// genug und haben genug Entropie -- und stehen woertlich in einem oeffentlichen
// Repository. Keine Messung der Welt faengt das; nur eine Liste.
const PLATZHALTER = ['changeme', 'geheim', 'secret', 'example', 'password', 'bitte-aendern'];

/** Gibt den Grund der Ablehnung zurueck, oder null wenn das Geheimnis taugt. */
export function pruefeGeheimnis(geheimnis: string): string | null {
  if (geheimnis.length < MINDESTLAENGE_GEHEIMNIS) {
    return `JWT_SECRET muss mindestens ${MINDESTLAENGE_GEHEIMNIS} Zeichen lang sein`;
  }
  // Beide Pruefungen sind noetig. Die Entropie allein liesse ein achtstelliges
  // Muster durch, achtmal wiederholt: 192 Bit, aber nur acht verschiedene
  // Zeichen. Die Zeichenvielfalt allein wies zufaellige Hex-Geheimnisse ab.
  const verschiedene = new Set(geheimnis).size;
  if (verschiedene < MINDESTVIELFALT_GEHEIMNIS) {
    return `JWT_SECRET verwendet zu wenige verschiedene Zeichen (${verschiedene}, mindestens ${MINDESTVIELFALT_GEHEIMNIS} noetig) -- bitte "openssl rand -base64 36" verwenden`;
  }
  const bit = Math.round(entropieBit(geheimnis));
  if (bit < MINDESTENTROPIE_BIT) {
    return `JWT_SECRET ist zu vorhersehbar (${bit} Bit, mindestens ${MINDESTENTROPIE_BIT} noetig) -- bitte "openssl rand -base64 36" verwenden`;
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
