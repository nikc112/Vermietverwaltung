import { z } from 'zod';
import { pruefeGeheimnis, pruefeLaufzeit } from './utils/jwt';

// Bewusst von config.ts getrennt: dort wird geparst und bei Fehlern der Prozess
// beendet. Ein Test, der eine ungueltige Konfiguration pruefen will, kann diese
// Datei importieren, ohne dabei den Testlauf mit abzuschiessen.
export const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ist erforderlich'),
  // Laenge, Vielfalt und Platzhalter-Erkennung stecken in pruefeGeheimnis.
  JWT_SECRET: z.string().superRefine((wert, ctx) => {
    const grund = pruefeGeheimnis(wert);
    if (grund) ctx.addIssue({ code: z.ZodIssueCode.custom, message: grund });
  }),
  // .default() greift nur bei undefined. Ein in der Umgebung gesetztes, aber
  // leeres JWT_EXPIRES_IN kaeme sonst als "" durch -- und fast-jwt erzeugt
  // daraus ein Token ganz ohne exp, das also nie ablaeuft.
  JWT_EXPIRES_IN: z.string().default('7d').superRefine((wert, ctx) => {
    const grund = pruefeLaufzeit(wert);
    if (grund) ctx.addIssue({ code: z.ZodIssueCode.custom, message: grund });
  }),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.string().transform((v) => v === 'true').default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('Mietverwaltung <noreply@example.com>'),
  APP_URL: z.string().default('http://localhost'),
  PDF_STORAGE_PATH: z.string().default('/app/storage/pdfs'),
  DOKUMENT_STORAGE_PATH: z.string().default('/app/storage/dokumente'),
  ADMIN_EMAIL: z.string().default('admin@mietverwaltung.local'),
  // Adressen der vorgelagerten Proxys, denen X-Forwarded-For geglaubt wird.
  // Alles, was ein Client selbst in den Header schreibt, wird dadurch verworfen —
  // sonst koennte er die Ratenbegrenzung der Anmeldung bei jedem Versuch
  // zuruecksetzen. Standard deckt das Docker-Netz und die Loopback-Adressen ab;
  // steht ein Reverse Proxy auf einer anderen Maschine davor, gehoert dessen
  // Adresse ueber TRUST_PROXY in die .env.
  TRUST_PROXY: z.string().default('127.0.0.1, ::1, 172.16.0.0/12'),
});

export type Config = z.infer<typeof configSchema>;
