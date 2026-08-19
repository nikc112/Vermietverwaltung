import { z } from 'zod';

export const listFristenQuerySchema = z.object({
  status: z.enum(['OFFEN', 'ERLEDIGT', 'VERWORFEN']).optional(),
});

// Prueft, dass der String als Datum parsbar ist (verhindert Invalid Date bis tief in Prisma)
const datumString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Ungültiges Datum');

export const createFristSchema = z.object({
  titel: z.string().min(1),
  faelligAm: datumString, // ISO-Datum
  notizen: z.string().optional(),
  mietvertragID: z.number().int().positive().optional(),
  mietobjektID: z.number().int().positive().optional(),
  kontaktID: z.number().int().positive().optional(),
});

export const updateFristSchema = z.object({
  titel: z.string().min(1).optional(),
  faelligAm: datumString.optional(),
  notizen: z.string().nullable().optional(),
  status: z.enum(['OFFEN', 'ERLEDIGT', 'VERWORFEN']).optional(),
});

export const overrideAutoFristSchema = z.object({
  referenzJahr: z.number().int().optional(), // Pflicht bei NKA_ABRECHNUNG (Service prueft)
  faelligAm: datumString.optional(),
  notizen: z.string().nullable().optional(),
  status: z.enum(['OFFEN', 'ERLEDIGT', 'VERWORFEN']).optional(),
});

export type CreateFristInput = z.infer<typeof createFristSchema>;
export type UpdateFristInput = z.infer<typeof updateFristSchema>;
export type OverrideAutoFristInput = z.infer<typeof overrideAutoFristSchema>;
