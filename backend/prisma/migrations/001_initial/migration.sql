-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('ADMIN', 'VERWALTER');

-- CreateEnum
CREATE TYPE "Anrede" AS ENUM ('HERR', 'FRAU', 'DIVERS', 'FIRMA');

-- CreateEnum
CREATE TYPE "MietobjektTyp" AS ENUM ('MEHRFAMILIENHAUS', 'EINFAMILIENHAUS', 'GEWERBEGEBAEUDE', 'GEMISCHT', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "HeizungsTyp" AS ENUM ('ZENTRALHEIZUNG', 'ETAGENHEIZUNG', 'FERNWAERME', 'ELEKTRO', 'SONSTIGE');

-- CreateEnum
CREATE TYPE "MieteinheitTyp" AS ENUM ('WOHNUNG', 'GEWERBE', 'GARAGE', 'STELLPLATZ', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "VertragStatus" AS ENUM ('AKTIV', 'BEENDET', 'GEKUENDIGT');

-- CreateEnum
CREATE TYPE "Zahlungsart" AS ENUM ('UEBERWEISUNG', 'LASTSCHRIFT', 'BAR', 'SONSTIGE');

-- CreateEnum
CREATE TYPE "KostenKategorie" AS ENUM ('GRUNDSTEUER', 'KALTWASSER', 'ABWASSER', 'HEIZUNG', 'WARMWASSER', 'AUFZUG', 'STRASSENREINIGUNG', 'MUELLABFUHR', 'GEBAEUDEREINIGUNG', 'GARTENPFLEGE', 'ALLGEMEINSTROM', 'SCHORNSTEINREINIGUNG', 'GEBAEUDEVERSICHERUNG', 'HAFTPFLICHTVERSICHERUNG', 'HAUSMEISTER', 'KABELFERNSEHEN', 'VERWALTUNGSKOSTEN', 'INSTANDHALTUNG', 'INSTANDSETZUNGSRUECKLAGE', 'BANKGEBUEHREN', 'RECHTSKOSTEN', 'SONSTIGE_UMLAGEFAEHIG', 'SONSTIGE_NICHT_UMLAGEFAEHIG');

-- CreateEnum
CREATE TYPE "UmlageSchluessel" AS ENUM ('FLAECHE', 'PERSONEN', 'EINHEIT', 'VERBRAUCH');

-- CreateEnum
CREATE TYPE "UmlageArt" AS ENUM ('ALLE_EINHEITEN', 'SPEZIFISCHE_EINHEITEN');

-- CreateTable
CREATE TABLE "benutzer" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rolle" "Rolle" NOT NULL DEFAULT 'VERWALTER',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "benutzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eigentuemer" (
    "id" SERIAL NOT NULL,
    "anrede" "Anrede" NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "firma" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "strasse" TEXT NOT NULL,
    "hausnummer" TEXT NOT NULL,
    "plz" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "iban" TEXT,
    "steuernummer" TEXT,
    "notizen" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "eigentuemer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mietobjekte" (
    "id" SERIAL NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "typ" "MietobjektTyp" NOT NULL,
    "strasse" TEXT NOT NULL,
    "hausnummer" TEXT NOT NULL,
    "plz" TEXT NOT NULL,
    "ort" TEXT NOT NULL,
    "baujahr" INTEGER,
    "heizungstyp" "HeizungsTyp",
    "notizen" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "eigentuemerID" INTEGER NOT NULL,
    CONSTRAINT "mietobjekte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mieteinheiten" (
    "id" SERIAL NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "typ" "MieteinheitTyp" NOT NULL,
    "flaeche" DECIMAL(8,2) NOT NULL,
    "zimmeranzahl" DECIMAL(4,1),
    "etage" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "mietobjektID" INTEGER NOT NULL,
    CONSTRAINT "mieteinheiten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mieter" (
    "id" SERIAL NOT NULL,
    "anrede" "Anrede" NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "email" TEXT,
    "telefon" TEXT,
    "geburtsdatum" TIMESTAMP(3),
    "strasse" TEXT,
    "hausnummer" TEXT,
    "plz" TEXT,
    "ort" TEXT,
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mieter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mietvertraege" (
    "id" SERIAL NOT NULL,
    "vertragsnummer" TEXT NOT NULL,
    "beginn" TIMESTAMP(3) NOT NULL,
    "ende" TIMESTAMP(3),
    "kuendigungsfristMonate" INTEGER NOT NULL DEFAULT 3,
    "kaltmiete" DECIMAL(10,2) NOT NULL,
    "nebenkostenVorauszahlung" DECIMAL(10,2) NOT NULL,
    "kaution" DECIMAL(10,2) NOT NULL,
    "kautionBezahlt" BOOLEAN NOT NULL DEFAULT false,
    "kautionBezahltAm" TIMESTAMP(3),
    "zahlungstag" INTEGER NOT NULL DEFAULT 1,
    "personenAnzahl" INTEGER NOT NULL DEFAULT 1,
    "status" "VertragStatus" NOT NULL DEFAULT 'AKTIV',
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "mieteinheitID" INTEGER NOT NULL,
    "mieterID" INTEGER NOT NULL,
    CONSTRAINT "mietvertraege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mietzahlungen" (
    "id" SERIAL NOT NULL,
    "monat" INTEGER NOT NULL,
    "jahr" INTEGER NOT NULL,
    "sollBetrag" DECIMAL(10,2) NOT NULL,
    "istBetrag" DECIMAL(10,2),
    "eingegangen" BOOLEAN NOT NULL DEFAULT false,
    "eingangsdat" TIMESTAMP(3),
    "zahlungsart" "Zahlungsart" NOT NULL DEFAULT 'UEBERWEISUNG',
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "mietvertragID" INTEGER NOT NULL,
    CONSTRAINT "mietzahlungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kosten" (
    "id" SERIAL NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "kategorie" "KostenKategorie" NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "jahr" INTEGER NOT NULL,
    "umlagefaehig" BOOLEAN NOT NULL DEFAULT true,
    "umlageSchluessel" "UmlageSchluessel" NOT NULL DEFAULT 'FLAECHE',
    "umlageArt" "UmlageArt" NOT NULL DEFAULT 'ALLE_EINHEITEN',
    "verbrauchswert" DECIMAL(10,3),
    "verbrauchEinheit" TEXT,
    "belegNummer" TEXT,
    "anbieter" TEXT,
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "mietobjektID" INTEGER NOT NULL,
    CONSTRAINT "kosten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kosten_umlage_zuordnungen" (
    "kostenID" INTEGER NOT NULL,
    "mieteinheitID" INTEGER NOT NULL,
    CONSTRAINT "kosten_umlage_zuordnungen_pkey" PRIMARY KEY ("kostenID","mieteinheitID")
);

-- CreateTable
CREATE TABLE "nebenkostenabrechnungen" (
    "id" SERIAL NOT NULL,
    "abrechnungsjahr" INTEGER NOT NULL,
    "gesamtkosten" DECIMAL(10,2) NOT NULL,
    "mieterAnteil" DECIMAL(10,2) NOT NULL,
    "geleisteteVZ" DECIMAL(10,2) NOT NULL,
    "saldo" DECIMAL(10,2) NOT NULL,
    "pdfPfad" TEXT,
    "versandtAm" TIMESTAMP(3),
    "notizen" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "mietvertragID" INTEGER NOT NULL,
    CONSTRAINT "nebenkostenabrechnungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nebenkosten_positionen" (
    "id" SERIAL NOT NULL,
    "kategorie" "KostenKategorie" NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "gesamtkosten" DECIMAL(10,2) NOT NULL,
    "umlageSchluessel" "UmlageSchluessel" NOT NULL,
    "anteilFaktor" DECIMAL(10,6) NOT NULL,
    "zeitraumFaktor" DECIMAL(10,6) NOT NULL,
    "mieterAnteil" DECIMAL(10,2) NOT NULL,
    "abrechnungID" INTEGER NOT NULL,
    CONSTRAINT "nebenkosten_positionen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "benutzer_email_key" ON "benutzer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mietvertraege_vertragsnummer_key" ON "mietvertraege"("vertragsnummer");

-- CreateIndex
CREATE UNIQUE INDEX "mietzahlungen_mietvertragID_monat_jahr_key" ON "mietzahlungen"("mietvertragID", "monat", "jahr");

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnungen_mietvertragID_abrechnungsjahr_key" ON "nebenkostenabrechnungen"("mietvertragID", "abrechnungsjahr");

-- AddForeignKey
ALTER TABLE "mietobjekte" ADD CONSTRAINT "mietobjekte_eigentuemerID_fkey" FOREIGN KEY ("eigentuemerID") REFERENCES "eigentuemer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mieteinheiten" ADD CONSTRAINT "mieteinheiten_mietobjektID_fkey" FOREIGN KEY ("mietobjektID") REFERENCES "mietobjekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_mieteinheitID_fkey" FOREIGN KEY ("mieteinheitID") REFERENCES "mieteinheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_mieterID_fkey" FOREIGN KEY ("mieterID") REFERENCES "mieter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietzahlungen" ADD CONSTRAINT "mietzahlungen_mietvertragID_fkey" FOREIGN KEY ("mietvertragID") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kosten" ADD CONSTRAINT "kosten_mietobjektID_fkey" FOREIGN KEY ("mietobjektID") REFERENCES "mietobjekte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kosten_umlage_zuordnungen" ADD CONSTRAINT "kosten_umlage_zuordnungen_kostenID_fkey" FOREIGN KEY ("kostenID") REFERENCES "kosten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kosten_umlage_zuordnungen" ADD CONSTRAINT "kosten_umlage_zuordnungen_mieteinheitID_fkey" FOREIGN KEY ("mieteinheitID") REFERENCES "mieteinheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnungen" ADD CONSTRAINT "nebenkostenabrechnungen_mietvertragID_fkey" FOREIGN KEY ("mietvertragID") REFERENCES "mietvertraege"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkosten_positionen" ADD CONSTRAINT "nebenkosten_positionen_abrechnungID_fkey" FOREIGN KEY ("abrechnungID") REFERENCES "nebenkostenabrechnungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
