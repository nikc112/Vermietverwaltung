import { z } from 'zod';

export const rolleEnum = z.enum(['ADMIN', 'VOLLZUGRIFF', 'VERTRAGSVERWALTER', 'KOSTENBUCHER']);

export const createBenutzerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  rolle: rolleEnum.default('VOLLZUGRIFF'),
  aktiv: z.boolean().default(true),
});

export const updateBenutzerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  rolle: rolleEnum.optional(),
  aktiv: z.boolean().optional(),
});

export const resetPasswortSchema = z.object({
  neuesPasswort: z.string().min(8),
});

export type CreateBenutzerInput = z.infer<typeof createBenutzerSchema>;
export type UpdateBenutzerInput = z.infer<typeof updateBenutzerSchema>;
export type ResetPasswortInput = z.infer<typeof resetPasswortSchema>;
