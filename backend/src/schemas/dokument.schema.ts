import { z } from 'zod';

export const dokumentKategorieEnum = z.enum([
  'MIETVERTRAG', 'NACHTRAG', 'KUENDIGUNG', 'UEBERGABEPROTOKOLL', 'RECHNUNG',
  'ABRECHNUNG', 'GRUNDRISS', 'ENERGIEAUSWEIS', 'VERSICHERUNG', 'FOTO',
  'AUSWEIS', 'SCHUFA', 'SELBSTAUSKUNFT', 'SCHRIFTWECHSEL', 'SONSTIGES',
]);

const bezugFelder = {
  mietvertragID: z.coerce.number().int().positive().optional(),
  mietobjektID: z.coerce.number().int().positive().optional(),
  mieteinheitID: z.coerce.number().int().positive().optional(),
  kontaktID: z.coerce.number().int().positive().optional(),
  kostenID: z.coerce.number().int().positive().optional(),
  abrechnungID: z.coerce.number().int().positive().optional(),
};

// Multipart liefert alle Felder als Strings — daher coerce und Komma-Trennung
export const uploadMetaSchema = z.object({
  titel: z.string().min(1).max(255).optional(),
  beschreibung: z.string().max(2000).optional(),
  kategorie: dokumentKategorieEnum,
  schlagworte: z.string().optional().transform((v) =>
    (v ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ),
  ...bezugFelder,
});

export const updateDokumentSchema = z.object({
  titel: z.string().min(1).max(255).optional(),
  beschreibung: z.string().max(2000).nullable().optional(),
  kategorie: dokumentKategorieEnum.optional(),
  schlagworte: z.array(z.string().min(1)).optional(),
  mietvertragID: z.number().int().positive().nullable().optional(),
  mietobjektID: z.number().int().positive().nullable().optional(),
  mieteinheitID: z.number().int().positive().nullable().optional(),
  kontaktID: z.number().int().positive().nullable().optional(),
  kostenID: z.number().int().positive().nullable().optional(),
  abrechnungID: z.number().int().positive().nullable().optional(),
});

export const listDokumenteQuerySchema = z.object({
  // Begrenzt, weil jede Suche ueber websearch_to_tsquery und ts_rank_cd auf den
  // gesamten Index laeuft. 200 Zeichen sind mehr, als jemand eintippt, und
  // verhindern, dass eine sehr lange Eingabe unnoetig Last erzeugt.
  suche: z.string().max(200).optional(),
  kategorie: dokumentKategorieEnum.optional(),
  schlagwort: z.string().optional(),
  // z.coerce.boolean() wuerde "false" zu true machen (jeder nichtleere String ist truthy) —
  // daher explizit nur "true"/"1" als wahr werten, alles andere (inkl. fehlendem Parameter) als falsch
  ohneBezug: z.string().optional().transform((v) => v === 'true' || v === '1'),
  ...bezugFelder,
});

export type UploadMetaInput = z.infer<typeof uploadMetaSchema>;
export type UpdateDokumentInput = z.infer<typeof updateDokumentSchema>;
export type ListDokumenteQuery = z.infer<typeof listDokumenteQuerySchema>;
