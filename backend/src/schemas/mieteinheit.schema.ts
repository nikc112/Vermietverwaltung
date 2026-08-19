import { z } from 'zod';

export const mieteinheitTypEnum = z.enum([
  'WOHNUNG',
  'GEWERBE',
  'GARAGE',
  'STELLPLATZ',
  'SONSTIGES',
]);

export const createMieteinheitSchema = z.object({
  mietobjektID: z.number().int().positive(),
  bezeichnung: z.string().min(1),
  typ: mieteinheitTypEnum,
  flaeche: z.number().positive(),
  zimmeranzahl: z.number().min(0).optional(),
  etage: z.string().optional(),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateMieteinheitSchema = createMieteinheitSchema
  .partial()
  .omit({ mietobjektID: true });

export type CreateMieteinheitInput = z.infer<typeof createMieteinheitSchema>;
export type UpdateMieteinheitInput = z.infer<typeof updateMieteinheitSchema>;
