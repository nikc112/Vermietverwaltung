import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions, ContentColumns, Content } from 'pdfmake/interfaces';
import path from 'path';
import fs from 'fs';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from '../config';
import { formatEuro, toNumber } from '../utils/currency';
import { formatDatum } from '../utils/date';
import { kontaktName } from '../utils/kontakt';
import { DsgvoDaten } from './kontakt.service';
import { MahnStufeTyp } from '../utils/mahnstufen';

type NumericField = Decimal | number | string;

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

const GRAU = '#555555';
const DUNKEL = '#1a1a1a';
const BLAU = '#1e3a5f';
const HELL_GRAU = '#f5f5f5';

export async function generiereNebenkostenPDF(
  abrechnung: {
    id: number;
    abrechnungsjahr: number;
    abrechnungStart?: Date | null;
    abrechnungEnde?: Date | null;
    gesamtkosten: NumericField;
    mieterAnteil: NumericField;
    geleisteteVZ: NumericField;
    saldo: NumericField;
    positionen: Array<{
      bezeichnung: string;
      gesamtkosten: NumericField;
      umlageSchluessel: string;
      anteilFaktor: NumericField;
      zeitraumFaktor: NumericField;
      mieterAnteil: NumericField;
      grundlageZaehler?: NumericField | null;
      grundlageNenner?: NumericField | null;
      grundlageEinheit?: string | null;
      lohnanteilAnteil?: NumericField | null;
    }>;
    mietvertrag: {
      vertragsnummer: string;
      personenAnzahl: number;
      nebenkostenVorauszahlung: NumericField;
      mieter: {
        vorname: string;
        nachname: string;
        firma?: string | null;
      };
      mieteinheit: {
        bezeichnung: string;
        flaeche: NumericField;
        mietobjekt: {
          bezeichnung: string;
          strasse: string;
          hausnummer: string;
          plz: string;
          ort: string;
          eigentuemer: {
            vorname: string;
            nachname: string;
            firma?: string | null;
            strasse: string | null;
            hausnummer: string | null;
            plz: string | null;
            ort: string | null;
          };
        };
      };
    };
  },
): Promise<string> {
  const mv = abrechnung.mietvertrag;
  const einheit = mv.mieteinheit;
  const objekt = einheit.mietobjekt;
  const eigentuemer = objekt.eigentuemer;
  const mieter = mv.mieter;

  const saldo = toNumber(abrechnung.saldo);
  const mieterFlaeche = toNumber(einheit.flaeche);

  const zeitraumStart = abrechnung.abrechnungStart
    ? formatDatum(abrechnung.abrechnungStart)
    : `01.01.${abrechnung.abrechnungsjahr}`;
  const zeitraumEnde = abrechnung.abrechnungEnde
    ? formatDatum(abrechnung.abrechnungEnde)
    : `31.12.${abrechnung.abrechnungsjahr}`;

  // Gesamtwerte aus gespeicherten Positionsdaten ableiten
  const gesamtFlaeche = abrechnung.positionen.find(p => p.umlageSchluessel === 'FLAECHE')?.grundlageNenner;
  const gesamtPersonen = abrechnung.positionen.find(p => p.umlageSchluessel === 'PERSONEN')?.grundlageNenner;
  const anzahlEinheiten = abrechnung.positionen.find(p => p.umlageSchluessel === 'EINHEIT')?.grundlageNenner;

  // §35a-Positionen
  const para35aPositionen = abrechnung.positionen.filter(
    p => p.lohnanteilAnteil != null && toNumber(p.lohnanteilAnteil) > 0,
  );
  const para35aSumme = para35aPositionen.reduce((s, p) => s + toNumber(p.lohnanteilAnteil!), 0);

  const eigentuemerName = kontaktName(eigentuemer);

  const hauptAbschnitt: Content[] = [
    // ─── Kopfzeile ─────────────────────────────────────────────────────────────
    {
      columns: [
        { text: 'Nebenkostenabrechnung', style: 'titel' },
        {
          stack: [
            { text: `Abrechnungsjahr ${abrechnung.abrechnungsjahr}`, alignment: 'right', fontSize: 11, bold: true, color: BLAU },
            { text: `${zeitraumStart} – ${zeitraumEnde}`, alignment: 'right', fontSize: 10, color: GRAU },
          ],
          width: 'auto',
        },
      ],
      margin: [0, 0, 0, 18],
    } as ContentColumns,

    // ─── Angaben zum Mietverhältnis ────────────────────────────────────────────
    { text: 'Angaben zum Mietverhältnis', style: 'abschnittTitel', margin: [0, 0, 0, 8] },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Vermieter / Verwalter', style: 'spaltenTitel' },
            { text: eigentuemerName, bold: true },
            { text: `${eigentuemer.strasse ?? ''} ${eigentuemer.hausnummer ?? ''}`.trim() },
            { text: `${eigentuemer.plz ?? ''} ${eigentuemer.ort ?? ''}`.trim() },
          ],
        },
        { width: 20, text: '' },
        {
          width: '*',
          stack: [
            { text: 'Mieter', style: 'spaltenTitel' },
            { text: kontaktName(mieter), bold: true },
            { text: `${objekt.strasse} ${objekt.hausnummer}` },
            { text: `${objekt.plz} ${objekt.ort}` },
            { text: einheit.bezeichnung, color: GRAU },
          ],
        },
      ],
      margin: [0, 0, 0, 12],
    } as ContentColumns,

    // Info-Tabelle
    {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            { text: 'Mietobjekt', style: 'infoLabel' },
            { text: `${objekt.bezeichnung}`, style: 'infoWert', colSpan: 3 },
            {}, {},
          ],
          [
            { text: 'Wohnfläche (Mieter)', style: 'infoLabel' },
            { text: `${mieterFlaeche.toFixed(2)} m²`, style: 'infoWert' },
            { text: 'Gesamtfläche Gebäude', style: 'infoLabel' },
            {
              text: gesamtFlaeche != null ? `${toNumber(gesamtFlaeche).toFixed(2)} m²` : '–',
              style: 'infoWert',
            },
          ],
          [
            { text: 'Personen (Mieter)', style: 'infoLabel' },
            { text: `${mv.personenAnzahl}`, style: 'infoWert' },
            { text: 'Personen (Gebäude)', style: 'infoLabel' },
            {
              text: gesamtPersonen != null ? `${toNumber(gesamtPersonen)}` : '–',
              style: 'infoWert',
            },
          ],
          [
            { text: 'Wohneinheiten', style: 'infoLabel' },
            {
              text: anzahlEinheiten != null ? `${toNumber(anzahlEinheiten)}` : '–',
              style: 'infoWert',
            },
            { text: 'Vertragsnummer', style: 'infoLabel' },
            { text: mv.vertragsnummer, style: 'infoWert' },
          ],
          [
            { text: 'Erstellungsdatum', style: 'infoLabel' },
            { text: formatDatum(new Date()), style: 'infoWert', colSpan: 3 },
            {}, {},
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#dddddd',
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 5,
        paddingBottom: () => 5,
        fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? HELL_GRAU : null,
      },
      margin: [0, 0, 0, 20],
    },

    // ─── Kostenaufstellung ─────────────────────────────────────────────────────
    { text: 'Kostenaufstellung', style: 'abschnittTitel', margin: [0, 0, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: ['*', 62, 48, 82, 42, 64],
        body: [
          [
            { text: 'Kostenart', style: 'tabelleHeader' },
            { text: 'Gesamtkosten', style: 'tabelleHeader', alignment: 'right' as const },
            { text: 'Schlüssel', style: 'tabelleHeader', alignment: 'center' as const },
            { text: 'Grundlage', style: 'tabelleHeader', alignment: 'center' as const },
            { text: 'Anteil', style: 'tabelleHeader', alignment: 'right' as const },
            { text: 'Ihr Anteil', style: 'tabelleHeader', alignment: 'right' as const },
          ],
          ...abrechnung.positionen.map((p) => [
            { text: p.bezeichnung, fontSize: 9 },
            { text: formatEuro(toNumber(p.gesamtkosten)), alignment: 'right' as const, fontSize: 9 },
            { text: schluesselLabel(p.umlageSchluessel), alignment: 'center' as const, fontSize: 9 },
            { text: grundlageText(p), alignment: 'center' as const, fontSize: 8 },
            { text: `${(toNumber(p.anteilFaktor) * 100).toFixed(2)}%`, alignment: 'right' as const, fontSize: 9 },
            { text: formatEuro(toNumber(p.mieterAnteil)), alignment: 'right' as const, fontSize: 9, bold: true },
          ]),
        ],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number) => i === 0 || i === 1 ? BLAU : '#dddddd',
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 5,
        paddingBottom: () => 5,
        fillColor: (rowIndex: number) => rowIndex === 0 ? BLAU : rowIndex % 2 === 0 ? HELL_GRAU : null,
      },
      margin: [0, 0, 0, 20],
    },

    // ─── Zusammenfassung ───────────────────────────────────────────────────────
    { text: 'Zusammenfassung', style: 'abschnittTitel', margin: [0, 0, 0, 8] },
    {
      table: {
        widths: ['*', 110],
        body: [
          [
            { text: 'Summe Betriebskosten (Ihr Anteil)', style: 'zusammenfassungLabel' },
            { text: formatEuro(toNumber(abrechnung.mieterAnteil)), alignment: 'right' as const, bold: true },
          ],
          [
            { text: './. Geleistete Vorauszahlungen', style: 'zusammenfassungLabel' },
            { text: `- ${formatEuro(toNumber(abrechnung.geleisteteVZ))}`, alignment: 'right' as const, color: GRAU },
          ],
          [
            {
              text: saldo > 0 ? 'Nachzahlung' : saldo < 0 ? 'Guthaben' : 'Saldo ausgeglichen',
              bold: true,
              fontSize: 12,
              color: saldo > 0 ? '#b91c1c' : saldo < 0 ? '#15803d' : GRAU,
            },
            {
              text: formatEuro(Math.abs(saldo)),
              alignment: 'right' as const,
              bold: true,
              fontSize: 12,
              color: saldo > 0 ? '#b91c1c' : saldo < 0 ? '#15803d' : GRAU,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: (i: number) => i === 2 ? 1.5 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number) => i === 2 ? BLAU : '#dddddd',
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
        fillColor: (rowIndex: number) => rowIndex === 2 ? '#f0f7ff' : null,
      },
      margin: [0, 0, 0, 16],
    },

    // ─── Hinweistext ───────────────────────────────────────────────────────────
    {
      text: saldo > 0
        ? `Bitte überweisen Sie den Nachzahlungsbetrag von ${formatEuro(saldo)} innerhalb von 30 Tagen nach Erhalt dieser Abrechnung.`
        : saldo < 0
          ? `Das Guthaben von ${formatEuro(Math.abs(saldo))} wird mit der nächsten Mietzahlung verrechnet oder auf Ihr Konto überwiesen.`
          : 'Die Abrechnung ergibt keinen Saldo.',
      italics: true,
      fontSize: 9,
      color: GRAU,
      margin: [0, 0, 0, 20],
    },

    // ─── Rechtliche Hinweise ───────────────────────────────────────────────────
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 0, 0, 8] },
    { text: 'Rechtliche Hinweise', style: 'abschnittTitel', fontSize: 9, margin: [0, 0, 0, 4] },
    {
      text: 'Diese Abrechnung umfasst die umlagefähigen Betriebskosten gemäß § 2 Betriebskostenverordnung (BetrKV). Sie haben das Recht, die Belege einzusehen (§ 259 BGB). Einwendungen gegen diese Abrechnung sind innerhalb von 12 Monaten nach Zugang schriftlich geltend zu machen (§ 556 Abs. 3 BGB).',
      fontSize: 8,
      color: GRAU,
    },
  ];

  // ─── §35a Bescheinigung ────────────────────────────────────────────────────
  const para35aAbschnitt: Content[] = para35aPositionen.length > 0
    ? [
        { text: '', pageBreak: 'before' },

        // Kopf
        {
          canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 4, color: BLAU }],
          margin: [0, 0, 0, 12],
        },
        {
          text: 'Bescheinigung – Haushaltsnahe Dienstleistungen',
          style: 'titel',
          margin: [0, 0, 0, 2],
        },
        {
          text: 'gemäß § 35a Abs. 2 EStG',
          fontSize: 13,
          color: BLAU,
          bold: true,
          margin: [0, 0, 0, 6],
        },
        {
          text: 'Diese Bescheinigung ist Bestandteil der Nebenkostenabrechnung und dient zur Vorlage beim Finanzamt.',
          fontSize: 9,
          italics: true,
          color: GRAU,
          margin: [0, 0, 0, 18],
        },

        // Kurzinfo
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: 'Mieter', style: 'infoLabel' },
                { text: kontaktName(mieter), style: 'infoWert' },
              ],
              [
                { text: 'Mietobjekt / Einheit', style: 'infoLabel' },
                { text: `${objekt.bezeichnung}, ${einheit.bezeichnung}`, style: 'infoWert' },
              ],
              [
                { text: 'Abrechnungszeitraum', style: 'infoLabel' },
                { text: `${zeitraumStart} – ${zeitraumEnde}`, style: 'infoWert' },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => '#dddddd',
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 5,
            paddingBottom: () => 5,
            fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? HELL_GRAU : null,
          },
          margin: [0, 0, 0, 20],
        },

        // Lohnkostentabelle
        { text: 'Lohnkostenanteile', style: 'abschnittTitel', margin: [0, 0, 0, 8] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 110, 110],
            body: [
              [
                { text: 'Dienstleistung', style: 'tabelleHeader' },
                { text: 'Lohnkosten gesamt', style: 'tabelleHeader', alignment: 'right' as const },
                { text: 'Ihr Anteil', style: 'tabelleHeader', alignment: 'right' as const },
              ],
              ...para35aPositionen.map((p) => {
                const lohnGesamt = p.lohnanteilAnteil && toNumber(p.anteilFaktor) > 0
                  ? toNumber(p.lohnanteilAnteil) / toNumber(p.anteilFaktor)
                  : null;
                return [
                  { text: p.bezeichnung, fontSize: 9 },
                  {
                    text: lohnGesamt != null ? formatEuro(lohnGesamt) : '–',
                    alignment: 'right' as const,
                    fontSize: 9,
                  },
                  {
                    text: formatEuro(toNumber(p.lohnanteilAnteil!)),
                    alignment: 'right' as const,
                    fontSize: 9,
                    bold: true,
                  },
                ];
              }),
              [
                { text: 'Summe haushaltsnahe Dienstleistungen', bold: true, fontSize: 10 },
                { text: '', alignment: 'right' as const },
                { text: formatEuro(para35aSumme), alignment: 'right' as const, bold: true, fontSize: 10 },
              ],
            ],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
              i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
            vLineWidth: () => 0,
            hLineColor: (i: number) => i === 0 || i === 1 ? BLAU : '#dddddd',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
            fillColor: (rowIndex: number, node: { table: { body: unknown[] } }) =>
              rowIndex === 0 ? BLAU : rowIndex === node.table.body.length - 1 ? '#f0f7ff' : rowIndex % 2 === 0 ? HELL_GRAU : null,
          },
          margin: [0, 0, 0, 20],
        },

        // Steuerhinweis
        {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  { text: 'Hinweis zur steuerlichen Geltendmachung', bold: true, fontSize: 9, margin: [0, 0, 0, 4] },
                  {
                    text: `Sie können 20 % der ausgewiesenen Aufwendungen (maximal 4.000 € pro Jahr) direkt von Ihrer Einkommensteuer abziehen (§ 35a Abs. 2 EStG). Bei mehreren Abzugsmöglichkeiten gilt der Gesamthöchstbetrag. Die aufgeführten Beträge enthalten ausschließlich Lohn-, Fahrt- und Maschinenkosten – Materialkosten sind nicht enthalten und nicht abzugsfähig.`,
                    fontSize: 8,
                    color: GRAU,
                  },
                ],
                fillColor: '#fffbeb',
                margin: [10, 10, 10, 10],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#d97706',
            vLineColor: () => '#d97706',
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
        },

        // Datum & Unterschrift
        {
          margin: [0, 40, 0, 0],
          columns: [
            {
              width: 200,
              stack: [
                { text: `Datum: ${formatDatum(new Date())}`, fontSize: 9 },
              ],
            },
            { width: '*', text: '' },
            {
              width: 200,
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1, lineColor: DUNKEL }] },
                { text: 'Unterschrift Vermieter / Verwalter', fontSize: 8, color: GRAU, margin: [0, 3, 0, 0] },
              ],
            },
          ],
        } as Content,
      ]
    : [];

  const docDefinition: TDocumentDefinitions = {
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: DUNKEL },
    pageMargins: [50, 55, 50, 55],
    content: [
      ...hauptAbschnitt,
      ...para35aAbschnitt,
    ],
    styles: {
      titel: { fontSize: 20, bold: true, color: BLAU },
      abschnittTitel: { fontSize: 11, bold: true, color: BLAU },
      spaltenTitel: { fontSize: 9, bold: true, color: GRAU, margin: [0, 0, 0, 3] },
      infoLabel: { fontSize: 8, color: GRAU, bold: false },
      infoWert: { fontSize: 9, bold: false },
      tabelleHeader: { fontSize: 9, bold: true, color: '#ffffff' },
      zusammenfassungLabel: { fontSize: 10 },
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  const storagePath = config.PDF_STORAGE_PATH;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const fileName = `nebenkosten_${abrechnung.id}_${abrechnung.abrechnungsjahr}.pdf`;
  const filePath = path.join(storagePath, fileName);

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    pdfDoc.pipe(writeStream);
    pdfDoc.end();
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
}

function schluesselLabel(schluessel: string): string {
  const labels: Record<string, string> = {
    FLAECHE: 'Fläche',
    PERSONEN: 'Personen',
    EINHEIT: 'Einheit',
    VERBRAUCH: 'Verbrauch',
  };
  return labels[schluessel] ?? schluessel;
}

function grundlageText(p: {
  grundlageZaehler?: NumericField | null;
  grundlageNenner?: NumericField | null;
  grundlageEinheit?: string | null;
}): string {
  if (p.grundlageZaehler == null || p.grundlageNenner == null) return '–';
  const einheit = p.grundlageEinheit ?? '';

  if (einheit === 'Gem.') return 'Gemischter\nSchlüssel';

  const z = toNumber(p.grundlageZaehler as NumericField);
  const n = toNumber(p.grundlageNenner as NumericField);

  if (einheit === 'm²') return `${z.toFixed(2)} m²\nvon ${n.toFixed(2)} m²`;
  if (einheit === 'Pers.' || einheit === 'Einh.') return `${z} ${einheit}\nvon ${n} ${einheit}`;
  return `${z}\nvon ${n} ${einheit}`;
}

export async function generiereDsgvoAuskunftPDF(daten: DsgvoDaten): Promise<Buffer> {
  const k = daten.kontakt;

  const stammdaten: [string, string][] = [
    ['Name', kontaktName(k)],
    ['Anrede', k.anrede],
    ['Anschrift', [`${k.strasse ?? ''} ${k.hausnummer ?? ''}`.trim(), `${k.plz ?? ''} ${k.ort ?? ''}`.trim()].filter(Boolean).join(', ') || '–'],
    ['Geburtsdatum', k.geburtsdatum ? formatDatum(k.geburtsdatum) : '–'],
    ['IBAN', k.iban ?? '–'],
    ['Steuernummer', k.steuernummer ?? '–'],
    ['Notizen', k.notizen ?? '–'],
    ['Rollen', k.rollen.map((r) => r.rolle).join(', ') || '–'],
    ['Erfasst am', formatDatum(k.erstelltAm)],
  ];

  function tabelle(kopf: string[], zeilen: (string | number)[][]): Content {
    return {
      table: {
        headerRows: 1,
        widths: kopf.map(() => '*'),
        body: [kopf.map((h) => ({ text: h, bold: true, fontSize: 8 })), ...zeilen.map((z) => z.map((c) => ({ text: String(c), fontSize: 8 })))],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 4, 0, 12] as [number, number, number, number],
    };
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    content: [
      { text: 'Datenauskunft gemäß Art. 15 DSGVO', fontSize: 14, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      { text: `Erstellt am ${formatDatum(new Date(daten.exportiertAm))}`, fontSize: 8, color: GRAU, margin: [0, 0, 0, 16] },

      { text: 'Stammdaten', fontSize: 11, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      tabelle(['Feld', 'Wert'], stammdaten),

      { text: 'Kommunikationswege', fontSize: 11, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      tabelle(
        ['Typ', 'Wert', 'Bezeichnung', 'Standard'],
        k.kommunikation.map((c) => [c.typ, c.wert, c.bezeichnung ?? '–', c.istStandard ? 'ja' : 'nein']),
      ),

      { text: 'Ansprechpartner', fontSize: 11, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      tabelle(
        ['Name', 'Funktion', 'E-Mail', 'Telefon'],
        k.ansprechpartner.map((a) => [a.name, a.funktion ?? '–', a.email ?? '–', a.telefon ?? '–']),
      ),

      { text: 'Mietverträge', fontSize: 11, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      tabelle(
        ['Vertragsnr.', 'Objekt / Einheit', 'Beginn', 'Ende', 'Zahlungen', 'Abrechnungen'],
        k.mietvertraege.map((v) => [
          v.vertragsnummer,
          `${v.mieteinheit.mietobjekt.bezeichnung} / ${v.mieteinheit.bezeichnung}`,
          formatDatum(v.beginn),
          v.ende ? formatDatum(v.ende) : 'laufend',
          v.mietzahlungen.length,
          v.nebenkostenabrechnungen.length,
        ]),
      ),

      { text: 'Mietobjekte (als Eigentümer)', fontSize: 11, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      tabelle(
        ['Bezeichnung', 'Adresse'],
        k.mietobjekte.map((o) => [o.bezeichnung, `${o.strasse} ${o.hausnummer}, ${o.plz} ${o.ort}`]),
      ),

      { text: 'Mahnungen', fontSize: 11, bold: true, color: BLAU, margin: [0, 0, 0, 4] },
      tabelle(
        ['Datum', 'Stufe', 'Gesamtbetrag', 'Gebühr', 'Versendet am'],
        k.mahnungen.map((m) => [
          formatDatum(m.datum),
          MAHN_TEXTE[m.stufe as MahnStufeTyp]?.titel ?? m.stufe,
          formatEuro(toNumber(m.gesamtbetrag)),
          formatEuro(toNumber(m.gebuehr)),
          m.versandtAm ? formatDatum(m.versandtAm) : '–',
        ]),
      ),
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (c: Buffer) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

const MAHN_TEXTE: Record<MahnStufeTyp, { titel: string; anrede: string; schluss: string }> = {
  ZAHLUNGSERINNERUNG: {
    titel: 'Zahlungserinnerung',
    anrede: 'sicherlich ist es Ihrer Aufmerksamkeit entgangen, dass die unten aufgeführten Beträge noch offen sind. Wir bitten Sie, den Gesamtbetrag bis zum genannten Datum zu überweisen.',
    schluss: 'Sollten Sie den Betrag bereits überwiesen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
  },
  MAHNUNG_1: {
    titel: '1. Mahnung',
    anrede: 'trotz unserer Zahlungserinnerung sind die unten aufgeführten Beträge weiterhin offen. Wir fordern Sie auf, den Gesamtbetrag einschließlich der Mahngebühr bis zum genannten Datum zu überweisen.',
    schluss: 'Sollten Sie den Betrag bereits überwiesen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
  },
  MAHNUNG_2: {
    titel: '2. Mahnung (letzte Mahnung)',
    anrede: 'trotz mehrfacher Aufforderung sind die unten aufgeführten Beträge weiterhin offen. Wir fordern Sie letztmalig auf, den Gesamtbetrag bis zum genannten Datum zu überweisen.',
    schluss: 'Sollte der Betrag nicht fristgerecht eingehen, behalten wir uns die Einleitung weiterer rechtlicher Schritte (gerichtliches Mahnverfahren, fristlose Kündigung bei Mietrückständen gemäß § 543 BGB) ausdrücklich vor.',
  },
};

export async function generiereMahnungPDF(daten: {
  mahnungID: number;
  stufe: MahnStufeTyp;
  datum: Date;
  zahlungsfrist: Date;
  gebuehr: number;
  gesamtbetrag: number;
  positionen: { beschreibung: string; offenerBetrag: number }[];
  empfaenger: { name: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null };
  absender: { name: string; strasse: string | null; hausnummer: string | null; plz: string | null; ort: string | null };
}): Promise<string> {
  const t = MAHN_TEXTE[daten.stufe];
  const adresse = (a: typeof daten.empfaenger) =>
    [`${a.strasse ?? ''} ${a.hausnummer ?? ''}`.trim(), `${a.plz ?? ''} ${a.ort ?? ''}`.trim()].filter(Boolean);

  const zeilen = daten.positionen.map((p) => [
    { text: p.beschreibung, fontSize: 9 },
    { text: formatEuro(p.offenerBetrag), fontSize: 9, alignment: 'right' as const },
  ]);
  if (daten.gebuehr > 0) {
    zeilen.push([
      { text: `Mahngebühr (${t.titel})`, fontSize: 9 },
      { text: formatEuro(daten.gebuehr), fontSize: 9, alignment: 'right' as const },
    ]);
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [50, 50, 50, 60],
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    content: [
      { text: `${daten.absender.name} · ${adresse(daten.absender).join(' · ')}`, fontSize: 7, color: GRAU, margin: [0, 40, 0, 4] },
      { text: [daten.empfaenger.name, ...adresse(daten.empfaenger)].join('\n'), margin: [0, 0, 0, 30] },
      { text: formatDatum(daten.datum), alignment: 'right', fontSize: 9, color: GRAU },
      { text: t.titel, fontSize: 14, bold: true, color: BLAU, margin: [0, 10, 0, 12] },
      { text: `Sehr geehrte Damen und Herren,\n\n${t.anrede}`, margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 100],
          body: [
            [
              { text: 'Offener Posten', bold: true, fontSize: 9 },
              { text: 'Betrag', bold: true, fontSize: 9, alignment: 'right' },
            ],
            ...zeilen,
            [
              { text: 'Gesamtbetrag', bold: true, fontSize: 10 },
              { text: formatEuro(daten.gesamtbetrag), bold: true, fontSize: 10, alignment: 'right' },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 14],
      },
      { text: `Zahlungsfrist: ${formatDatum(daten.zahlungsfrist)}`, bold: true, margin: [0, 0, 0, 12] },
      { text: t.schluss, margin: [0, 0, 0, 16] },
      { text: `Mit freundlichen Grüßen\n\n${daten.absender.name}` },
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const storagePath = config.PDF_STORAGE_PATH;
  if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
  const filePath = path.join(storagePath, `mahnung_${daten.mahnungID}.pdf`);
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    pdfDoc.pipe(ws);
    pdfDoc.end();
    ws.on('finish', () => resolve(filePath));
    ws.on('error', reject);
  });
}
