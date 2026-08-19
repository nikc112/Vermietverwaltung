import { describe, it, expect } from 'vitest';
import {
  MAX_ZEICHEN, TREFFER_ENDE, TREFFER_START,
  entferneMarkup, istHaengengeblieben, kuerzeText, normalisiereText,
  statusNachFehler, textebeneBrauchbar, verfahrenFuerMime, zerlegeTextstelle,
} from '../textextraktion';

describe('verfahrenFuerMime', () => {
  it('ordnet jedem erlaubten Typ ein Verfahren zu', () => {
    expect(verfahrenFuerMime('text/plain')).toBe('TEXT');
    expect(verfahrenFuerMime('application/pdf')).toBe('PDF');
    expect(verfahrenFuerMime('image/jpeg')).toBe('BILD');
    expect(verfahrenFuerMime('image/png')).toBe('BILD');
    expect(verfahrenFuerMime('image/webp')).toBe('BILD');
    expect(verfahrenFuerMime(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('DOCX');
    expect(verfahrenFuerMime(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('XLSX');
  });

  it('liefert null fuer unbekannte Typen', () => {
    expect(verfahrenFuerMime('application/x-msdownload')).toBeNull();
    expect(verfahrenFuerMime('')).toBeNull();
  });
});

describe('textebeneBrauchbar', () => {
  it('verlangt mindestens 100 Zeichen insgesamt', () => {
    expect(textebeneBrauchbar('A'.repeat(99), 1)).toBe(false);
    expect(textebeneBrauchbar('A'.repeat(100), 1)).toBe(true);
  });

  it('verlangt mindestens 20 Zeichen je Seite', () => {
    // 200 Zeichen auf 5 Seiten = 40 je Seite -> brauchbar
    expect(textebeneBrauchbar('A'.repeat(200), 5)).toBe(true);
    // 200 Zeichen auf 20 Seiten = 10 je Seite -> nur Kopfzeilen, OCR noetig
    expect(textebeneBrauchbar('A'.repeat(200), 20)).toBe(false);
  });

  it('zaehlt Leerraum nicht mit', () => {
    expect(textebeneBrauchbar(' \n'.repeat(500), 1)).toBe(false);
  });

  it('kommt mit unbekannter Seitenzahl zurecht', () => {
    expect(textebeneBrauchbar('A'.repeat(500), 0)).toBe(true);
  });
});

describe('normalisiereText', () => {
  it('fasst Leerraum zusammen und entfernt Rand', () => {
    expect(normalisiereText('  Hallo   \t Welt  ')).toBe('Hallo Welt');
  });

  it('behaelt Absaetze, aber hoechstens einen leeren', () => {
    expect(normalisiereText('A\n\n\n\n\nB')).toBe('A\n\nB');
  });

  it('vereinheitlicht Zeilenenden', () => {
    expect(normalisiereText('A\r\nB')).toBe('A\nB');
  });
});

describe('kuerzeText', () => {
  it('laesst kurze Texte unveraendert', () => {
    expect(kuerzeText('kurz')).toEqual({ text: 'kurz', gekuerzt: false });
  });

  it('kuerzt an der Grenze und meldet das', () => {
    const ergebnis = kuerzeText('A'.repeat(MAX_ZEICHEN + 1));
    expect(ergebnis.text).toHaveLength(MAX_ZEICHEN);
    expect(ergebnis.gekuerzt).toBe(true);
  });

  it('kuerzt exakt an der Grenze nicht', () => {
    expect(kuerzeText('A'.repeat(MAX_ZEICHEN)).gekuerzt).toBe(false);
  });

  it('trennt kein Ersatzzeichenpaar auseinander', () => {
    // Der Schnitt bei MAX_ZEICHEN faellt genau zwischen die beiden Haelften des
    // Emoji. Bliebe die erste stehen, waere das Ergebnis keine gueltige
    // Zeichenkette mehr und Postgres ersetzte sie durch U+FFFD.
    const ergebnis = kuerzeText(`${'A'.repeat(MAX_ZEICHEN - 1)}\u{1F600}Rest`);
    expect(ergebnis.gekuerzt).toBe(true);
    expect(ergebnis.text).toHaveLength(MAX_ZEICHEN - 1);
    expect(ergebnis.text.endsWith('A')).toBe(true);
  });
});

describe('entferneMarkup', () => {
  it('holt den Wortlaut aus OOXML', () => {
    const xml = '<w:p><w:r><w:t>Mietvertrag</w:t></w:r></w:p><w:p><w:t>Mueller</w:t></w:p>';
    expect(entferneMarkup(xml)).toBe('Mietvertrag Mueller');
  });

  it('loest Entitaeten auf, ohne doppelt zu entschluesseln', () => {
    expect(entferneMarkup('<t>Meier &amp; Sohn</t>')).toBe('Meier & Sohn');
    expect(entferneMarkup('<t>&amp;lt;</t>')).toBe('&lt;');
  });
});

describe('statusNachFehler', () => {
  it('laesst weitere Versuche zu, solange die Grenze nicht erreicht ist', () => {
    expect(statusNachFehler(0)).toBe('WARTEND');
    expect(statusNachFehler(1)).toBe('WARTEND');
    expect(statusNachFehler(2)).toBe('WARTEND');
  });

  it('gibt nach drei Versuchen auf, damit die Warteschlange frei bleibt', () => {
    expect(statusNachFehler(3)).toBe('FEHLGESCHLAGEN');
    expect(statusNachFehler(4)).toBe('FEHLGESCHLAGEN');
  });
});

describe('istHaengengeblieben', () => {
  const jetzt = new Date('2026-08-18T12:00:00.000Z');

  it('betrifft nur Dokumente in Arbeit', () => {
    expect(istHaengengeblieben('WARTEND', new Date('2026-08-18T10:00:00.000Z'), jetzt)).toBe(false);
    expect(istHaengengeblieben('FERTIG', new Date('2026-08-18T10:00:00.000Z'), jetzt)).toBe(false);
  });

  it('erkennt ein zu lange laufendes Dokument', () => {
    expect(istHaengengeblieben('IN_ARBEIT', new Date('2026-08-18T11:40:00.000Z'), jetzt)).toBe(true);
  });

  it('laesst ein frisch begonnenes Dokument in Ruhe', () => {
    expect(istHaengengeblieben('IN_ARBEIT', new Date('2026-08-18T11:55:00.000Z'), jetzt)).toBe(false);
  });

  it('behandelt einen fehlenden Zeitstempel als haengengeblieben', () => {
    expect(istHaengengeblieben('IN_ARBEIT', null, jetzt)).toBe(true);
  });
});

describe('zerlegeTextstelle', () => {
  it('trennt Fundstellen vom uebrigen Text', () => {
    const roh = `Die ${TREFFER_START}Miete${TREFFER_ENDE} ist faellig`;
    expect(zerlegeTextstelle(roh)).toEqual([
      { text: 'Die ', treffer: false },
      { text: 'Miete', treffer: true },
      { text: ' ist faellig', treffer: false },
    ]);
  });

  it('kommt mit mehreren Fundstellen zurecht', () => {
    const roh = `${TREFFER_START}A${TREFFER_ENDE} und ${TREFFER_START}B${TREFFER_ENDE}`;
    expect(zerlegeTextstelle(roh)).toEqual([
      { text: 'A', treffer: true },
      { text: ' und ', treffer: false },
      { text: 'B', treffer: true },
    ]);
  });

  it('liefert null, wenn keine Fundstelle markiert ist', () => {
    // ts_headline gibt die ersten Woerter des Textes zurueck, wenn der Suchbegriff
    // darin nicht vorkommt -- etwa wenn der Treffer nur ueber den Titel zustande
    // kam. Wuerde das ausgeliefert, zeigte die Oberflaeche den Anfang des
    // erkannten Dokumentinhalts, ohne dass jemand danach gesucht haette.
    expect(zerlegeTextstelle('nur Text')).toBeNull();
  });

  it('liefert null, wenn es keine Textstelle gibt', () => {
    expect(zerlegeTextstelle(null)).toBeNull();
    expect(zerlegeTextstelle('')).toBeNull();
  });

  it('verschluckt sich nicht an einer unvollstaendigen Markierung', () => {
    // Kein Absturz, keine Endlosschleife -- und da keine vollstaendige Fundstelle
    // entsteht, auch keine Ausgabe von Dokumentinhalt.
    expect(zerlegeTextstelle(`Rest ${TREFFER_START}ohne Ende`)).toBeNull();
  });

  it('behaelt den Text um eine echte Fundstelle herum', () => {
    const roh = `Vorher ${TREFFER_START}Treffer${TREFFER_ENDE} nachher`;
    expect(zerlegeTextstelle(roh)).toEqual([
      { text: 'Vorher ', treffer: false },
      { text: 'Treffer', treffer: true },
      { text: ' nachher', treffer: false },
    ]);
  });

  it('gibt Markup unveraendert als Text zurueck, nie als Auszeichnung', () => {
    const roh = `${TREFFER_START}<script>alert(1)</script>${TREFFER_ENDE}`;
    expect(zerlegeTextstelle(roh)).toEqual([
      { text: '<script>alert(1)</script>', treffer: true },
    ]);
  });
});
