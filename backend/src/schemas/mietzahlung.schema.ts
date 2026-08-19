import { z } from 'zod';

export const createMietzahlungSchema = z.object({
  mietvertragID: z.number().int().positive(),
  monat: z.number().int().min(1).max(12),
  jahr: z.number().int().min(1900).max(2100),
  sollBetrag: z.number().positive(),
  istBetrag: z.number().min(0).optional(),
  eingegangen: z.boolean().default(false),
  eingangsdat: z.string().optional().or(z.literal('')).transform(v => v || undefined),
  zahlungsart: z.enum(['UEBERWEISUNG', 'LASTSCHRIFT', 'BAR', 'SONSTIGE']).default('UEBERWEISUNG'),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateMietzahlungSchema = createMietzahlungSchema
  .partial()
  .omit({ mietvertragID: true, monat: true, jahr: true });

export const bulkAnlegenSchema = z.object({
  mietvertragID: z.number().int().positive(),
  jahr: z.number().int().min(1900).max(2100),
});

export type CreateMietzahlungInput = z.infer<typeof createMietzahlungSchema>;
export type UpdateMietzahlungInput = z.infer<typeof updateMietzahlungSchema>;
export type BulkAnlegenInput = z.infer<typeof bulkAnlegenSchema>;
