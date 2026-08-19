-- Neue Rollen zum Enum hinzufügen
ALTER TYPE "Rolle" ADD VALUE IF NOT EXISTS 'VOLLZUGRIFF';
ALTER TYPE "Rolle" ADD VALUE IF NOT EXISTS 'VERTRAGSVERWALTER';
ALTER TYPE "Rolle" ADD VALUE IF NOT EXISTS 'KOSTENBUCHER';

-- Bestehende VERWALTER-Benutzer auf VOLLZUGRIFF umstellen
UPDATE "benutzer" SET "rolle" = 'VOLLZUGRIFF' WHERE "rolle" = 'VERWALTER';

-- Einstellungen-Tabelle anlegen
CREATE TABLE IF NOT EXISTS "einstellungen" (
    "schluessel" TEXT NOT NULL,
    "wert" TEXT NOT NULL,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "einstellungen_pkey" PRIMARY KEY ("schluessel")
);
