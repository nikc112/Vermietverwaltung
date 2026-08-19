import { z } from 'zod';

export const anredeEnum = z.enum(['HERR', 'FRAU', 'DIVERS', 'FIRMA']);
export const kontaktRolleEnum = z.enum([
  'MIETER', 'EIGENTUEMER', 'DIENSTLEISTER', 'VERSORGER', 'BEHOERDE', 'SONSTIGE',
]);
export const kommunikationsTypEnum = z.enum(['EMAIL', 'TELEFON', 'MOBIL', 'FAX', 'SONSTIGE']);

const kommunikationSchema = z.object({
  typ: kommunikationsTypEnum,
  wert: z.string().min(1),
  bezeichnung: z.string().optional(),
  istStandard: z.boolean().default(false),
});

const ansprechpartnerSchema = z.object({
  name: z.string().min(1),
  funktion: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')).transform((v) => v || undefined),
  telefon: z.string().optional(),
});

const kontaktBasis = z.object({
  anrede: anredeEnum,
  vorname: z.string().default(''),
  nachname: z.string().default(''),
  firma: z.string().optional(),
  strasse: z.string().optional(),
  hausnummer: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  geburtsdatum: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
  iban: z.string().optional(),
  steuernummer: z.string().optional(),
  notizen: z.string().nullable().optional().transform((v) => v ?? undefined),
  rollen: z.array(kontaktRolleEnum).default([]),
  kommunikation: z.array(kommunikationSchema).default([]),
  ansprechpartner: z.array(ansprechpartnerSchema).default([]),
});

function pruefeKontakt<T extends z.infer<typeof kontaktBasis>>(data: T, ctx: z.RefinementCtx) {
  if (!data.firma && (!data.vorname.trim() || !data.nachname.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nachname'],
      message: 'Entweder Firma oder Vor- und Nachname angeben',
    });
  }
  const standardEmails = data.kommunikation.filter((k) => k.typ === 'EMAIL' && k.istStandard);
  if (standardEmails.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['kommunikation'],
      message: 'Höchstens eine Standard-E-Mail erlaubt',
    });
  }
}

export const createKontaktSchema = kontaktBasis.superRefine(pruefeKontakt);
export const updateKontaktSchema = kontaktBasis.superRefine(pruefeKontakt);

export type CreateKontaktInput = z.infer<typeof createKontaktSchema>;
export type UpdateKontaktInput = z.infer<typeof updateKontaktSchema>;
