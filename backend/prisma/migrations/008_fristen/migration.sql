-- Fristenüberwachung: manuelle Fristen und Overrides für automatische Fristen

CREATE TYPE "FristTyp" AS ENUM ('MANUELL', 'NKA_ABRECHNUNG', 'VERTRAGSENDE');
CREATE TYPE "FristStatus" AS ENUM ('OFFEN', 'ERLEDIGT', 'VERWORFEN');

CREATE TABLE "fristen" (
    "id" SERIAL NOT NULL,
    "typ" "FristTyp" NOT NULL,
    "titel" TEXT NOT NULL,
    "faelligAm" TIMESTAMP(3) NOT NULL,
    "notizen" TEXT,
    "status" "FristStatus" NOT NULL DEFAULT 'OFFEN',
    "erledigtAm" TIMESTAMP(3),
    "referenzJahr" INTEGER,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "mietvertragID" INTEGER,
    "mietobjektID" INTEGER,
    "kontaktID" INTEGER,
    CONSTRAINT "fristen_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fristen_mietvertragID_fkey" FOREIGN KEY ("mietvertragID") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fristen_mietobjektID_fkey" FOREIGN KEY ("mietobjektID") REFERENCES "mietobjekte"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fristen_kontaktID_fkey" FOREIGN KEY ("kontaktID") REFERENCES "kontakte"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Pro Vertrag hoechstens ein Override je Auto-Typ (NKA zusaetzlich je Jahr).
-- MANUELL-Zeilen haben referenzJahr NULL und kollidieren dank NULL-Distinct nie.
CREATE UNIQUE INDEX "fristen_typ_mietvertragID_referenzJahr_key" ON "fristen"("typ", "mietvertragID", "referenzJahr");
