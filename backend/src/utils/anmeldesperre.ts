/**
 * Bremse gegen das Durchprobieren von Passwoertern -- gezaehlt wird je Konto,
 * nicht je Absenderadresse.
 *
 * Warum nicht ueber die IP: die Anwendung steht hinter einem Reverse Proxy und
 * muss dessen X-Forwarded-For glauben, um ueberhaupt echte Absender zu sehen.
 * Ein Angreifer, der bei jedem Versuch eine andere Adresse hineinschreibt,
 * bekommt damit jedes Mal einen frischen Zaehler. Ob das gelingt, haengt an der
 * Konfiguration des aeussersten Proxys -- also an etwas, das ausserhalb dieser
 * Anwendung liegt. Die Zaehlung je Konto haengt an nichts davon: sie schuetzt
 * das Konto auch dann, wenn der Proxy falsch eingerichtet ist.
 *
 * Die Ratenbegrenzung je Adresse bleibt zusaetzlich bestehen. Diese hier ist
 * die Sicherung, die nicht umgangen werden kann.
 */

export const MAX_FEHLVERSUCHE = 5;
export const SPERRDAUER_MS = 15 * 60 * 1000;
/** Nach dieser Zeit ohne Fehlversuch verfaellt die Zaehlung. */
export const MERKDAUER_MS = 15 * 60 * 1000;
/**
 * Obergrenze fuer die Zahl beobachteter Konten. Ohne sie koennte ein Angreifer
 * mit erfundenen Adressen den Speicher volllaufen lassen -- aus einer Bremse
 * gegen Passwortraten wuerde ein Hebel gegen den Server selbst.
 */
export const MAX_EINTRAEGE = 10_000;

interface Eintrag {
  fehlversuche: number;
  zuletzt: number;
  gesperrtBis: number | null;
}

export class Anmeldesperre {
  private readonly eintraege = new Map<string, Eintrag>();

  /** Verbleibende Sperrzeit in Millisekunden, oder null wenn nicht gesperrt. */
  pruefe(kennung: string, jetzt: number = Date.now()): number | null {
    const eintrag = this.eintraege.get(schluessel(kennung));
    if (!eintrag?.gesperrtBis) return null;
    if (eintrag.gesperrtBis <= jetzt) return null;
    return eintrag.gesperrtBis - jetzt;
  }

  vermerkeFehlschlag(kennung: string, jetzt: number = Date.now()): void {
    this.raeumeAuf(jetzt);
    const k = schluessel(kennung);
    const vorher = this.eintraege.get(k);
    // Ein laengst vergangener Fehlversuch zaehlt nicht mehr mit: wer sich einmal
    // im Monat vertippt, soll dadurch nicht irgendwann ausgesperrt werden.
    const veraltet = !vorher || jetzt - vorher.zuletzt > MERKDAUER_MS;
    const fehlversuche = (veraltet ? 0 : vorher.fehlversuche) + 1;
    this.eintraege.set(k, {
      fehlversuche,
      zuletzt: jetzt,
      gesperrtBis: fehlversuche >= MAX_FEHLVERSUCHE ? jetzt + SPERRDAUER_MS : null,
    });
  }

  vermerkeErfolg(kennung: string): void {
    this.eintraege.delete(schluessel(kennung));
  }

  /** Nur fuer Tests: Zahl der beobachteten Konten. */
  get groesse(): number {
    return this.eintraege.size;
  }

  private raeumeAuf(jetzt: number): void {
    for (const [k, e] of this.eintraege) {
      const abgelaufen = jetzt - e.zuletzt > MERKDAUER_MS && (!e.gesperrtBis || e.gesperrtBis <= jetzt);
      if (abgelaufen) this.eintraege.delete(k);
    }
    // Reicht das Aufraeumen nicht, fliegen die aeltesten Eintraege heraus. Map
    // haelt die Einfuegereihenfolge, der erste Schluessel ist also der aelteste.
    while (this.eintraege.size >= MAX_EINTRAEGE) {
      const aeltester = this.eintraege.keys().next().value;
      if (aeltester === undefined) break;
      this.eintraege.delete(aeltester);
    }
  }
}

// Gross-/Kleinschreibung der E-Mail-Adresse darf keinen neuen Zaehler eroeffnen.
function schluessel(kennung: string): string {
  return kennung.trim().toLowerCase();
}
