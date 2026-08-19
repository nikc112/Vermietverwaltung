import { z } from 'zod';

export const createMieterSchema = z.object({
  anrede: z.enum(['HERR', 'FRAU', 'DIVERS', 'FIRMA']),
  vorname: z.string().min(1),
  nachname: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  telefon: z.string().optional(),
  geburtsdatum: z.string().optional().or(z.literal('')).transform(v => v || undefined),
  strasse: z.string().optional(),
  hausnummer: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateMieterSchema = createMieterSchema.partial();

export type CreateMieterInput = z.infer<typeof createMieterSchema>;
export type UpdateMieterInput = z.infer<typeof updateMieterSchema>;
