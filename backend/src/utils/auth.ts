import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const VOLLZUGRIFF_EQUIVALENT = ['ADMIN', 'VOLLZUGRIFF'];

export const ROLLEN = {
  ALLE: [] as string[],
  ADMIN_ONLY: ['ADMIN'],
  VOLLZUGRIFF: VOLLZUGRIFF_EQUIVALENT,
  VERTRAGSVERWALTER: [...VOLLZUGRIFF_EQUIVALENT, 'VERTRAGSVERWALTER'],
  KOSTENBUCHER: [...VOLLZUGRIFF_EQUIVALENT, 'KOSTENBUCHER'],
};

// Pfadparameter, die eine Datensatzkennung bezeichnen. Sie muessen reine
// Ziffernfolgen groesser null sein -- alle Kennungen im Datenmodell sind
// autoincrement-Ganzzahlen.
const KENNUNG_PARAMETER = ['id', 'vertragID'];

/**
 * Prueft die Kennungen im Pfad, BEVOR eine Route sie an parseInt weiterreicht.
 *
 * Ohne das gaebe parseInt('12xyz') die Zahl 12 zurueck und "/kontakte/12xyz"
 * lieferte Kontakt 12 aus -- kein Datenleck, aber eine Route, die etwas
 * anderes tut, als der Aufrufer geschrieben hat. parseInt('abc') gaebe NaN,
 * die Datenbank braeche ab, und der Aufrufer saehe einen Serverfehler, wo eine
 * fehlerhafte Eingabe vorlag.
 *
 * Bewusst hier und nicht an 42 einzelnen Stellen: so kann es beim Hinzufuegen
 * einer Route niemand vergessen.
 */
async function pruefeKennungen(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parameter = (req.params ?? {}) as Record<string, unknown>;
  for (const name of KENNUNG_PARAMETER) {
    const wert = parameter[name];
    if (wert === undefined) continue;
    if (typeof wert !== 'string' || !/^\d+$/.test(wert) || Number(wert) <= 0) {
      return reply.status(400).send({ error: 'Ungültige ID' });
    }
  }
}

export function makeAuth(server: FastifyInstance, ...roles: string[]) {
  const preHandler: ((req: FastifyRequest, reply: FastifyReply) => Promise<void>)[] = [
    server.authenticate,
  ];
  if (roles.length > 0) {
    preHandler.push(async (req: FastifyRequest, reply: FastifyReply) => {
      if (!roles.includes(req.user.rolle)) {
        return reply.status(403).send({ error: 'Keine Berechtigung für diese Aktion' });
      }
    });
  }
  // Erst anmelden, dann Rolle, dann Eingabe. Andersherum verriete eine
  // Fehlermeldung zur Kennung einem nicht angemeldeten Aufrufer, dass es die
  // Route ueberhaupt gibt.
  preHandler.push(pruefeKennungen);
  return { preHandler };
}
