import { z } from 'zod';

const optionalesISODatum = z.string().optional();

export const nebenkostenVorschauSchema = z.object({
  mietvertragID: z.number().int().positive(),
  abrechnungsjahr: z.number().int().min(1900).max(2100),
  abrechnungStart: optionalesISODatum,
  abrechnungEnde: optionalesISODatum,
});

export const createNebenkostenAbrechnungSchema = z.object({
  mietvertragID: z.number().int().positive(),
  abrechnungsjahr: z.number().int().min(1900).max(2100),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
  abrechnungStart: optionalesISODatum,
  abrechnungEnde: optionalesISODatum,
});

export const sendeAbrechnungSchema = z.object({
  empfaengerEmail: z.string().email().optional(),
});

export type NebenkostenVorschauInput = z.infer<typeof nebenkostenVorschauSchema>;
export type CreateNebenkostenAbrechnungInput = z.infer<typeof createNebenkostenAbrechnungSchema>;
export type SendeAbrechnungInput = z.infer<typeof sendeAbrechnungSchema>;
