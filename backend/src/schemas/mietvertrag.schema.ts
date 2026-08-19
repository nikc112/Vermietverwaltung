import { z } from 'zod';

const datumFeld = z.string().min(1);
const datumFeldOptional = z.string().optional().or(z.literal('')).transform(v => v || undefined);

export const createMietvertragSchema = z.object({
  mieteinheitID: z.number().int().positive(),
  mieterID: z.number().int().positive(),
  vertragsnummer: z.string().min(1),
  beginn: datumFeld,
  ende: datumFeldOptional,
  kuendigungsfristMonate: z.number().int().min(0).max(12).default(3),
  kaltmiete: z.number().positive(),
  nebenkostenVorauszahlung: z.number().min(0),
  kaution: z.number().min(0),
  kautionBezahlt: z.boolean().default(false),
  kautionBezahltAm: datumFeldOptional,
  zahlungstag: z.number().int().min(1).max(28).default(1),
  personenAnzahl: z.number().int().min(1).default(1),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateMietvertragSchema = createMietvertragSchema
  .partial()
  .omit({ mieteinheitID: true, mieterID: true });

export const kuendigenSchema = z.object({
  kuendigungsdatum: datumFeld,
});

export type CreateMietvertragInput = z.infer<typeof createMietvertragSchema>;
export type UpdateMietvertragInput = z.infer<typeof updateMietvertragSchema>;
export type KuendigenInput = z.infer<typeof kuendigenSchema>;
