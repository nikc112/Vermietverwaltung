import { describe, it, expect } from 'vitest';
import {
  Anmeldesperre, MAX_FEHLVERSUCHE, SPERRDAUER_MS, MERKDAUER_MS, MAX_EINTRAEGE,
} from '../anmeldesperre';

const T0 = 1_770_000_000_000;

describe('Anmeldesperre', () => {
  it('laesst die ersten Versuche durch', () => {
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_FEHLVERSUCHE - 1; i++) {
      sperre.vermerkeFehlschlag('a@example.org', T0 + i * 1000);
    }
    expect(sperre.pruefe('a@example.org', T0 + 10_000)).toBeNull();
  });

  it('sperrt das Konto beim erreichten Grenzwert', () => {
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) {
      sperre.vermerkeFehlschlag('a@example.org', T0 + i * 1000);
    }
    const rest = sperre.pruefe('a@example.org', T0 + MAX_FEHLVERSUCHE * 1000);
    expect(rest).not.toBeNull();
    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThanOrEqual(SPERRDAUER_MS);
  });

  it('sperrt nur das betroffene Konto, nicht die anderen', () => {
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) sperre.vermerkeFehlschlag('opfer@example.org', T0 + i);
    expect(sperre.pruefe('opfer@example.org', T0)).not.toBeNull();
    expect(sperre.pruefe('jemand.anderes@example.org', T0)).toBeNull();
  });

  it('greift unabhaengig davon, von welcher Adresse die Versuche kommen', () => {
    // Genau der Fall, den die adressgebundene Grenze nicht abdeckt: der
    // Angreifer wechselt bei jedem Versuch die vorgetaeuschte Absenderadresse.
    // Diese Sperre sieht davon nichts -- sie zaehlt am Konto.
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) sperre.vermerkeFehlschlag('opfer@example.org', T0 + i * 50);
    expect(sperre.pruefe('opfer@example.org', T0 + 300)).not.toBeNull();
  });

  it('unterscheidet Gross- und Kleinschreibung nicht', () => {
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) sperre.vermerkeFehlschlag(`  OPFER@Example.ORG `, T0 + i);
    expect(sperre.pruefe('opfer@example.org', T0)).not.toBeNull();
  });

  it('gibt das Konto nach Ablauf der Sperrzeit wieder frei', () => {
    const sperre = new Anmeldesperre();
    let zuletzt = T0;
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) { zuletzt = T0 + i; sperre.vermerkeFehlschlag('a@example.org', zuletzt); }
    // Die Sperre laeuft ab dem LETZTEN Fehlversuch, nicht ab dem ersten.
    expect(sperre.pruefe('a@example.org', zuletzt + SPERRDAUER_MS - 1)).not.toBeNull();
    expect(sperre.pruefe('a@example.org', zuletzt + SPERRDAUER_MS + 1)).toBeNull();
  });

  it('vergisst laengst vergangene Fehlversuche', () => {
    const sperre = new Anmeldesperre();
    // Vier Vertipper, dann ein Jahr Ruhe, dann wieder vier -- das darf nicht sperren.
    for (let i = 0; i < MAX_FEHLVERSUCHE - 1; i++) sperre.vermerkeFehlschlag('a@example.org', T0 + i);
    const spaeter = T0 + MERKDAUER_MS * 2;
    for (let i = 0; i < MAX_FEHLVERSUCHE - 1; i++) sperre.vermerkeFehlschlag('a@example.org', spaeter + i);
    expect(sperre.pruefe('a@example.org', spaeter + 100)).toBeNull();
  });

  it('hebt die Sperre nach erfolgreicher Anmeldung auf', () => {
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_FEHLVERSUCHE; i++) sperre.vermerkeFehlschlag('a@example.org', T0 + i);
    sperre.vermerkeErfolg('a@example.org');
    expect(sperre.pruefe('a@example.org', T0)).toBeNull();
  });

  it('laeuft nicht ueber, wenn jemand mit erfundenen Adressen um sich wirft', () => {
    // Ohne Obergrenze waere aus der Bremse gegen Passwortraten ein Hebel gegen
    // den Arbeitsspeicher des Servers geworden.
    const sperre = new Anmeldesperre();
    for (let i = 0; i < MAX_EINTRAEGE + 500; i++) {
      sperre.vermerkeFehlschlag(`erfunden-${i}@example.org`, T0 + i);
    }
    expect(sperre.groesse).toBeLessThanOrEqual(MAX_EINTRAEGE);
  });
});
