import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
});

export const changePasswordSchema = z.object({
  altesPasswort: z.string().min(1),
  neuesPasswort: z.string().min(8, 'Neues Passwort muss mindestens 8 Zeichen lang sein'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
