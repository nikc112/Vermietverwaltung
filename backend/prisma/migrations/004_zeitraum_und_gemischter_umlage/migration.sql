-- AlterTable: NebenkostenAbrechnung – flexibler Abrechnungszeitraum
ALTER TABLE "nebenkostenabrechnungen" ADD COLUMN IF NOT EXISTS "abrechnungStart" TIMESTAMP(3);
ALTER TABLE "nebenkostenabrechnungen" ADD COLUMN IF NOT EXISTS "abrechnungEnde" TIMESTAMP(3);

-- AlterTable: NebenkostenPosition – Berechnungsbasis für PDF
ALTER TABLE "nebenkosten_positionen" ADD COLUMN IF NOT EXISTS "grundlageZaehler" DECIMAL(10,3);
ALTER TABLE "nebenkosten_positionen" ADD COLUMN IF NOT EXISTS "grundlageNenner" DECIMAL(10,3);
ALTER TABLE "nebenkosten_positionen" ADD COLUMN IF NOT EXISTS "grundlageEinheit" TEXT;

-- AlterTable: Kosten – gemischter Umlage-Schlüssel
ALTER TABLE "kosten" ADD COLUMN IF NOT EXISTS "umlageSchluessel2" TEXT;
ALTER TABLE "kosten" ADD COLUMN IF NOT EXISTS "umlageGewicht1" DECIMAL(5,2);
