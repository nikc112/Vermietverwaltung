import { z } from 'zod';

export const anredeEnum = z.enum(['HERR', 'FRAU', 'DIVERS', 'FIRMA']);

export const createEigentuemerSchema = z.object({
  anrede: anredeEnum,
  vorname: z.string().min(1),
  nachname: z.string().min(1),
  firma: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefon: z.string().optional(),
  strasse: z.string().min(1),
  hausnummer: z.string().min(1),
  plz: z.string().min(4).max(5),
  ort: z.string().min(1),
  iban: z.string().optional(),
  steuernummer: z.string().optional(),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateEigentuemerSchema = createEigentuemerSchema.partial();

export type CreateEigentuemerInput = z.infer<typeof createEigentuemerSchema>;
export type UpdateEigentuemerInput = z.infer<typeof updateEigentuemerSchema>;
