import { z } from 'zod';

export const kostenKategorieEnum = z.enum([
  'GRUNDSTEUER',
  'KALTWASSER',
  'ABWASSER',
  'HEIZUNG',
  'WARMWASSER',
  'AUFZUG',
  'STRASSENREINIGUNG',
  'MUELLABFUHR',
  'GEBAEUDEREINIGUNG',
  'GARTENPFLEGE',
  'ALLGEMEINSTROM',
  'SCHORNSTEINREINIGUNG',
  'GEBAEUDEVERSICHERUNG',
  'HAFTPFLICHTVERSICHERUNG',
  'HAUSMEISTER',
  'KABELFERNSEHEN',
  'VERWALTUNGSKOSTEN',
  'INSTANDHALTUNG',
  'INSTANDSETZUNGSRUECKLAGE',
  'BANKGEBUEHREN',
  'RECHTSKOSTEN',
  'SONSTIGE_UMLAGEFAEHIG',
  'SONSTIGE_NICHT_UMLAGEFAEHIG',
]);

export const NOT_UMLAGEFAEHIG_KATEGORIEN = new Set([
  'VERWALTUNGSKOSTEN',
  'INSTANDHALTUNG',
  'INSTANDSETZUNGSRUECKLAGE',
  'BANKGEBUEHREN',
  'RECHTSKOSTEN',
  'SONSTIGE_NICHT_UMLAGEFAEHIG',
]);

export const createKostenSchema = z.object({
  mietobjektID: z.number().int().positive(),
  bezeichnung: z.string().min(1),
  kategorie: kostenKategorieEnum,
  betrag: z.number().positive(),
  datum: z.string().min(1),
  jahr: z.number().int().min(1900).max(2100),
  umlagefaehig: z.boolean().default(true),
  umlageSchluessel: z.enum(['FLAECHE', 'PERSONEN', 'EINHEIT', 'VERBRAUCH']).default('FLAECHE'),
  umlageSchluessel2: z.enum(['FLAECHE', 'PERSONEN', 'EINHEIT', 'VERBRAUCH']).optional(),
  umlageGewicht1: z.number().min(0.01).max(0.99).optional(),
  umlageArt: z.enum(['ALLE_EINHEITEN', 'SPEZIFISCHE_EINHEITEN']).default('ALLE_EINHEITEN'),
  umlageEinheitenIDs: z.array(z.number().int().positive()).optional(),
  verbrauchswert: z.number().optional(),
  verbrauchEinheit: z.string().optional(),
  lohnanteil: z.number().min(0).optional(),
  belegNummer: z.string().optional(),
  anbieter: z.string().optional(),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateKostenSchema = createKostenSchema.partial().omit({ mietobjektID: true });

export type CreateKostenInput = z.infer<typeof createKostenSchema>;
export type UpdateKostenInput = z.infer<typeof updateKostenSchema>;
