export const AUFBEWAHRUNG_JAHRE = 10;

export type LoeschfallErgebnis =
  | { fall: 'LOESCHEN' }
  | { fall: 'ANONYMISIEREN' }
  | { fall: 'GESPERRT'; grund: string; sperrBis: string | null };

export interface LoeschfallInput {
  objektAnzahl: number;
  vertraege: { ende: Date | null }[];
  letztesAbrechnungsjahr: number | null;
  letzteZahlung: { monat: number; jahr: number } | null;
  mahnungAnzahl: number;
  heute: Date;
}

export function ermittleLoeschfall(input: LoeschfallInput): LoeschfallErgebnis {
  if (input.objektAnzahl === 0 && input.vertraege.length === 0) {
    if (input.mahnungAnzahl > 0) {
      // Mahnungen sind Geschäftsunterlagen: kein Hard-Delete, Kontakt wird anonymisiert
      return { fall: 'ANONYMISIEREN' };
    }
    return { fall: 'LOESCHEN' };
  }
  if (input.objektAnzahl > 0) {
    return {
      fall: 'GESPERRT',
      grund: 'Kontakt ist Eigentümer von mindestens einem Mietobjekt',
      sperrBis: null,
    };
  }
  if (input.vertraege.some((v) => v.ende === null)) {
    return {
      fall: 'GESPERRT',
      grund: 'Mindestens ein Mietvertrag läuft noch',
      sperrBis: null,
    };
  }

  const kandidaten: Date[] = input.vertraege.map((v) => v.ende as Date);
  if (input.letztesAbrechnungsjahr !== null) {
    kandidaten.push(new Date(Date.UTC(input.letztesAbrechnungsjahr, 11, 31)));
  }
  if (input.letzteZahlung !== null) {
    // Tag 0 des Folgemonats = letzter Tag des Zahlungsmonats
    kandidaten.push(new Date(Date.UTC(input.letzteZahlung.jahr, input.letzteZahlung.monat, 0)));
  }

  const letzteAktivitaet = new Date(Math.max(...kandidaten.map((d) => d.getTime())));
  const sperrBis = new Date(
    Date.UTC(letzteAktivitaet.getUTCFullYear() + AUFBEWAHRUNG_JAHRE, 11, 31, 23, 59, 59),
  );

  if (input.heute.getTime() > sperrBis.getTime()) {
    return { fall: 'ANONYMISIEREN' };
  }
  return {
    fall: 'GESPERRT',
    grund: 'Aufbewahrungspflicht (§ 147 AO) läuft noch',
    sperrBis: sperrBis.toISOString(),
  };
}
