ALTER TABLE "kosten" ADD COLUMN IF NOT EXISTS "lohnanteil" DECIMAL(10,2);
ALTER TABLE "nebenkosten_positionen" ADD COLUMN IF NOT EXISTS "lohnanteilAnteil" DECIMAL(10,2);
