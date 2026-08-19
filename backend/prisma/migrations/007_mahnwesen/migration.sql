-- Mahnwesen: Mahnungen + Positionen; NKA-Nachzahlung als beglichen markierbar

CREATE TYPE "MahnStufe" AS ENUM ('ZAHLUNGSERINNERUNG', 'MAHNUNG_1', 'MAHNUNG_2');
CREATE TYPE "ForderungsTyp" AS ENUM ('MIETE', 'NEBENKOSTEN', 'MAHNGEBUEHR');

ALTER TABLE "nebenkostenabrechnungen" ADD COLUMN "nachzahlungBeglichenAm" TIMESTAMP(3);

CREATE TABLE "mahnungen" (
    "id" SERIAL NOT NULL,
    "stufe" "MahnStufe" NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zahlungsfrist" TIMESTAMP(3) NOT NULL,
    "gebuehr" DECIMAL(10,2) NOT NULL,
    "gebuehrBeglichenAm" TIMESTAMP(3),
    "gesamtbetrag" DECIMAL(10,2) NOT NULL,
    "pdfPfad" TEXT,
    "versandtAm" TIMESTAMP(3),
    "versandFehlerlog" TEXT,
    "versandVersuche" INTEGER NOT NULL DEFAULT 0,
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "kontaktID" INTEGER NOT NULL,
    CONSTRAINT "mahnungen_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mahnungen_kontaktID_fkey" FOREIGN KEY ("kontaktID") REFERENCES "kontakte"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "mahnung_positionen" (
    "id" SERIAL NOT NULL,
    "typ" "ForderungsTyp" NOT NULL,
    "beschreibung" TEXT NOT NULL,
    "offenerBetrag" DECIMAL(10,2) NOT NULL,
    "mahnungID" INTEGER NOT NULL,
    "mietzahlungID" INTEGER,
    "abrechnungID" INTEGER,
    "vorherigeMahnungID" INTEGER,
    CONSTRAINT "mahnung_positionen_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mahnung_positionen_mahnungID_fkey" FOREIGN KEY ("mahnungID") REFERENCES "mahnungen"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mahnung_positionen_mietzahlungID_fkey" FOREIGN KEY ("mietzahlungID") REFERENCES "mietzahlungen"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mahnung_positionen_abrechnungID_fkey" FOREIGN KEY ("abrechnungID") REFERENCES "nebenkostenabrechnungen"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mahnung_positionen_vorherigeMahnungID_fkey" FOREIGN KEY ("vorherigeMahnungID") REFERENCES "mahnungen"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
