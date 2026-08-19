import { z } from 'zod';

export const mietobjektTypEnum = z.enum([
  'MEHRFAMILIENHAUS',
  'EINFAMILIENHAUS',
  'GEWERBEGEBAEUDE',
  'GEMISCHT',
  'SONSTIGES',
]);

export const heizungsTypEnum = z.enum([
  'ZENTRALHEIZUNG',
  'ETAGENHEIZUNG',
  'FERNWAERME',
  'ELEKTRO',
  'SONSTIGE',
]);

export const createMietobjektSchema = z.object({
  bezeichnung: z.string().min(1),
  typ: mietobjektTypEnum,
  strasse: z.string().min(1),
  hausnummer: z.string().min(1),
  plz: z.string().min(4).max(5),
  ort: z.string().min(1),
  baujahr: z.number().int().min(1800).max(2100).optional(),
  heizungstyp: heizungsTypEnum.optional(),
  eigentuemerID: z.number().int().positive(),
  notizen: z.string().nullable().optional().transform(v => v ?? undefined),
});

export const updateMietobjektSchema = createMietobjektSchema.partial().omit({ eigentuemerID: true });

export type CreateMietobjektInput = z.infer<typeof createMietobjektSchema>;
export type UpdateMietobjektInput = z.infer<typeof updateMietobjektSchema>;
