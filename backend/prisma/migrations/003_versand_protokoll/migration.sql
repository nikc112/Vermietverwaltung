ALTER TABLE "nebenkostenabrechnungen"
  ADD COLUMN IF NOT EXISTS "versandFehlerlog" TEXT,
  ADD COLUMN IF NOT EXISTS "versandVersuche"  INTEGER NOT NULL DEFAULT 0;
