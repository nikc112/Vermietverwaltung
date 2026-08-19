-- Dokumentenablage: Dateien liegen im Dateisystem, Metadaten hier

CREATE TYPE "DokumentKategorie" AS ENUM (
    'MIETVERTRAG', 'NACHTRAG', 'KUENDIGUNG', 'UEBERGABEPROTOKOLL', 'RECHNUNG',
    'ABRECHNUNG', 'GRUNDRISS', 'ENERGIEAUSWEIS', 'VERSICHERUNG', 'FOTO',
    'AUSWEIS', 'SCHUFA', 'SELBSTAUSKUNFT', 'SCHRIFTWECHSEL', 'SONSTIGES'
);

CREATE TABLE "dokumente" (
    "id" SERIAL NOT NULL,
    "dateiname" TEXT NOT NULL,
    "speicherName" TEXT NOT NULL,
    "mimeTyp" TEXT NOT NULL,
    "groesseBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT,
    "kategorie" "DokumentKategorie" NOT NULL,
    "schlagworte" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "hochgeladenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "hochgeladenVonID" INTEGER,
    "mietvertragID" INTEGER,
    "mietobjektID" INTEGER,
    "mieteinheitID" INTEGER,
    "kontaktID" INTEGER,
    "kostenID" INTEGER,
    "abrechnungID" INTEGER,
    CONSTRAINT "dokumente_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dokumente_hochgeladenVonID_fkey" FOREIGN KEY ("hochgeladenVonID") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "dokumente_mietvertragID_fkey" FOREIGN KEY ("mietvertragID") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dokumente_mietobjektID_fkey" FOREIGN KEY ("mietobjektID") REFERENCES "mietobjekte"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dokumente_mieteinheitID_fkey" FOREIGN KEY ("mieteinheitID") REFERENCES "mieteinheiten"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dokumente_kontaktID_fkey" FOREIGN KEY ("kontaktID") REFERENCES "kontakte"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "dokumente_kostenID_fkey" FOREIGN KEY ("kostenID") REFERENCES "kosten"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "dokumente_abrechnungID_fkey" FOREIGN KEY ("abrechnungID") REFERENCES "nebenkostenabrechnungen"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "dokumente_speicherName_key" ON "dokumente"("speicherName");
CREATE INDEX "dokumente_hochgeladenVonID_idx" ON "dokumente"("hochgeladenVonID");
CREATE INDEX "dokumente_mietvertragID_idx" ON "dokumente"("mietvertragID");
CREATE INDEX "dokumente_mietobjektID_idx" ON "dokumente"("mietobjektID");
CREATE INDEX "dokumente_mieteinheitID_idx" ON "dokumente"("mieteinheitID");
CREATE INDEX "dokumente_kontaktID_idx" ON "dokumente"("kontaktID");
CREATE INDEX "dokumente_kostenID_idx" ON "dokumente"("kostenID");
CREATE INDEX "dokumente_abrechnungID_idx" ON "dokumente"("abrechnungID");
CREATE INDEX "dokumente_kategorie_idx" ON "dokumente"("kategorie");
CREATE INDEX "dokumente_sha256_idx" ON "dokumente"("sha256");
