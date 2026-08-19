-- Zentrale Kontaktverwaltung: kontakte ersetzt mieter + eigentuemer

CREATE TYPE "KontaktRollenTyp" AS ENUM ('MIETER', 'EIGENTUEMER', 'DIENSTLEISTER', 'VERSORGER', 'BEHOERDE', 'SONSTIGE');
CREATE TYPE "KommunikationsTyp" AS ENUM ('EMAIL', 'TELEFON', 'MOBIL', 'FAX', 'SONSTIGE');

CREATE TABLE "kontakte" (
    "id" SERIAL NOT NULL,
    "anrede" "Anrede" NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "firma" TEXT,
    "strasse" TEXT,
    "hausnummer" TEXT,
    "plz" TEXT,
    "ort" TEXT,
    "geburtsdatum" TIMESTAMP(3),
    "iban" TEXT,
    "steuernummer" TEXT,
    "notizen" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "anonymisiertAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,
    "altEigentuemerID" INTEGER,
    "altMieterID" INTEGER,
    CONSTRAINT "kontakte_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kontakt_rollen" (
    "kontaktID" INTEGER NOT NULL,
    "rolle" "KontaktRollenTyp" NOT NULL,
    CONSTRAINT "kontakt_rollen_pkey" PRIMARY KEY ("kontaktID", "rolle"),
    CONSTRAINT "kontakt_rollen_kontaktID_fkey" FOREIGN KEY ("kontaktID") REFERENCES "kontakte"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "kontakt_kommunikation" (
    "id" SERIAL NOT NULL,
    "typ" "KommunikationsTyp" NOT NULL,
    "wert" TEXT NOT NULL,
    "bezeichnung" TEXT,
    "istStandard" BOOLEAN NOT NULL DEFAULT false,
    "kontaktID" INTEGER NOT NULL,
    CONSTRAINT "kontakt_kommunikation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "kontakt_kommunikation_kontaktID_fkey" FOREIGN KEY ("kontaktID") REFERENCES "kontakte"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ansprechpartner" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "funktion" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "kontaktID" INTEGER NOT NULL,
    CONSTRAINT "ansprechpartner_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ansprechpartner_kontaktID_fkey" FOREIGN KEY ("kontaktID") REFERENCES "kontakte"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Eigentümer übernehmen
INSERT INTO "kontakte" ("anrede", "vorname", "nachname", "firma", "strasse", "hausnummer", "plz", "ort",
                        "iban", "steuernummer", "notizen", "aktiv", "erstelltAm", "aktualisiertAm", "altEigentuemerID")
SELECT "anrede", "vorname", "nachname", "firma", "strasse", "hausnummer", "plz", "ort",
       "iban", "steuernummer", "notizen", "aktiv", "erstelltAm", CURRENT_TIMESTAMP, "id"
FROM "eigentuemer";

INSERT INTO "kontakt_rollen" ("kontaktID", "rolle")
SELECT "id", 'EIGENTUEMER' FROM "kontakte" WHERE "altEigentuemerID" IS NOT NULL;

INSERT INTO "kontakt_kommunikation" ("kontaktID", "typ", "wert", "istStandard")
SELECT k."id", 'EMAIL', e."email", true
FROM "kontakte" k JOIN "eigentuemer" e ON e."id" = k."altEigentuemerID"
WHERE e."email" IS NOT NULL AND e."email" <> '';

INSERT INTO "kontakt_kommunikation" ("kontaktID", "typ", "wert", "istStandard")
SELECT k."id", 'TELEFON', e."telefon", false
FROM "kontakte" k JOIN "eigentuemer" e ON e."id" = k."altEigentuemerID"
WHERE e."telefon" IS NOT NULL AND e."telefon" <> '';

-- Mieter übernehmen
INSERT INTO "kontakte" ("anrede", "vorname", "nachname", "strasse", "hausnummer", "plz", "ort",
                        "geburtsdatum", "notizen", "aktiv", "erstelltAm", "aktualisiertAm", "altMieterID")
SELECT "anrede", "vorname", "nachname", "strasse", "hausnummer", "plz", "ort",
       "geburtsdatum", "notizen", true, "erstelltAm", CURRENT_TIMESTAMP, "id"
FROM "mieter";

INSERT INTO "kontakt_rollen" ("kontaktID", "rolle")
SELECT "id", 'MIETER' FROM "kontakte" WHERE "altMieterID" IS NOT NULL;

INSERT INTO "kontakt_kommunikation" ("kontaktID", "typ", "wert", "istStandard")
SELECT k."id", 'EMAIL', m."email", true
FROM "kontakte" k JOIN "mieter" m ON m."id" = k."altMieterID"
WHERE m."email" IS NOT NULL AND m."email" <> '';

INSERT INTO "kontakt_kommunikation" ("kontaktID", "typ", "wert", "istStandard")
SELECT k."id", 'TELEFON', m."telefon", false
FROM "kontakte" k JOIN "mieter" m ON m."id" = k."altMieterID"
WHERE m."telefon" IS NOT NULL AND m."telefon" <> '';

-- Fremdschlüssel umbiegen (Constraint-Namen aus 001_initial)
ALTER TABLE "mietobjekte" DROP CONSTRAINT "mietobjekte_eigentuemerID_fkey";
UPDATE "mietobjekte" mo SET "eigentuemerID" = k."id"
FROM "kontakte" k WHERE k."altEigentuemerID" = mo."eigentuemerID";
ALTER TABLE "mietobjekte" ADD CONSTRAINT "mietobjekte_eigentuemerID_fkey"
  FOREIGN KEY ("eigentuemerID") REFERENCES "kontakte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mietvertraege" DROP CONSTRAINT "mietvertraege_mieterID_fkey";
UPDATE "mietvertraege" mv SET "mieterID" = k."id"
FROM "kontakte" k WHERE k."altMieterID" = mv."mieterID";
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_mieterID_fkey"
  FOREIGN KEY ("mieterID") REFERENCES "kontakte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Konsistenzprüfung: bei Abweichung Abbruch (Transaktion rollt zurück)
DO $$
DECLARE
  anzahl_alt INTEGER;
  anzahl_neu INTEGER;
  verwaiste INTEGER;
BEGIN
  SELECT (SELECT COUNT(*) FROM "mieter") + (SELECT COUNT(*) FROM "eigentuemer") INTO anzahl_alt;
  SELECT COUNT(*) INTO anzahl_neu FROM "kontakte";
  IF anzahl_alt <> anzahl_neu THEN
    RAISE EXCEPTION 'Migration abgebrochen: % Kontakte, aber % Mieter+Eigentuemer', anzahl_neu, anzahl_alt;
  END IF;

  SELECT COUNT(*) INTO verwaiste FROM "mietobjekte" mo
  WHERE NOT EXISTS (SELECT 1 FROM "kontakte" k WHERE k."id" = mo."eigentuemerID");
  IF verwaiste > 0 THEN
    RAISE EXCEPTION 'Migration abgebrochen: % Mietobjekte ohne gueltigen Kontakt', verwaiste;
  END IF;

  SELECT COUNT(*) INTO verwaiste FROM "mietvertraege" mv
  WHERE NOT EXISTS (SELECT 1 FROM "kontakte" k WHERE k."id" = mv."mieterID");
  IF verwaiste > 0 THEN
    RAISE EXCEPTION 'Migration abgebrochen: % Mietvertraege ohne gueltigen Kontakt', verwaiste;
  END IF;
END $$;

-- Aufräumen
ALTER TABLE "kontakte" DROP COLUMN "altEigentuemerID";
ALTER TABLE "kontakte" DROP COLUMN "altMieterID";
DROP TABLE "mieter";
DROP TABLE "eigentuemer";
