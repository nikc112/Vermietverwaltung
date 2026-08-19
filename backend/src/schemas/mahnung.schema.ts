import { z } from 'zod';

export const createMahnungSchema = z.object({
  kontaktID: z.number().int().positive(),
});

export const gebuehrBeglichenSchema = z.object({
  beglichen: z.boolean(),
});

export const nachzahlungBeglichenSchema = z.object({
  beglichen: z.boolean(),
});

export type CreateMahnungInput = z.infer<typeof createMahnungSchema>;
