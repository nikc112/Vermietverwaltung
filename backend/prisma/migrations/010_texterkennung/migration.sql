-- Teilprojekt 4b: Texterkennung und Volltextsuche

CREATE TYPE "TextStatus" AS ENUM ('WARTEND', 'IN_ARBEIT', 'FERTIG', 'FEHLGESCHLAGEN', 'UEBERSPRUNGEN');
CREATE TYPE "TextQuelle" AS ENUM ('TEXTEBENE', 'OCR');

ALTER TABLE "dokumente"
    ADD COLUMN "textInhalt" TEXT,
    ADD COLUMN "textStatus" "TextStatus" NOT NULL DEFAULT 'WARTEND',
    ADD COLUMN "textQuelle" "TextQuelle",
    ADD COLUMN "textVersuche" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "textHinweis" TEXT,
    ADD COLUMN "textAktualisiertAm" TIMESTAMP(3),
    ADD COLUMN "suchIndex" tsvector;

CREATE INDEX "dokumente_textStatus_idx" ON "dokumente"("textStatus");
CREATE INDEX "dokumente_suchIndex_idx" ON "dokumente" USING GIN ("suchIndex");

-- Der Suchindex wird bewusst in der Datenbank gepflegt, nicht im Anwendungscode:
-- er muss nach JEDEM Schreibvorgang stimmen, egal ueber welchen Pfad. Ein Aufruf
-- im Service waere eine Kopplung, die beim naechsten neuen Pfad vergessen wird --
-- und dann findet die Suche ein Dokument stillschweigend nicht mehr.
-- Gewichte: A Titel, B Schlagworte, C Beschreibung und Dateiname, D Inhalt.
CREATE OR REPLACE FUNCTION dokumente_suchindex_aktualisieren() RETURNS trigger AS $$
DECLARE
    -- Beschreibung des Notbehelfs, zugleich Erkennungsmerkmal gegen Mehrfacheintrag
    ueberlauf_hinweis CONSTANT TEXT := 'Inhalt zu vielfaeltig fuer den Suchindex; nur Metadaten durchsuchbar';
    metadaten tsvector;
BEGIN
    -- Bei einem reinen Statuswechsel (WARTEND -> IN_ARBEIT -> FERTIG, mehrfach je
    -- Dokument) aendert sich keine Quellspalte. Ohne diesen Riegel berechnete der
    -- Trigger jedes Mal den vollstaendigen Vektor samt der bis zu 500.000 Zeichen
    -- aus textInhalt neu und schriebe die GIN-Postingslisten mit -- Arbeit, die
    -- nichts aendert.
    -- Bewusst zwei IF-Ebenen statt einer AND-Kette: PostgreSQL sichert fuer AND
    -- KEINE Kurzschlussauswertung zu, Teilausdruecke duerfen umgeordnet werden
    -- (Handbuch 4.2.14). Bei INSERT ist OLD nicht belegt, und ein Zugriff darauf
    -- bricht mit "record old is not assigned yet" ab -- das wuerde jeden Upload
    -- treffen, nicht nur einen Randfall.
    IF TG_OP = 'UPDATE' THEN
        IF NEW."titel"        IS NOT DISTINCT FROM OLD."titel"
           AND NEW."schlagworte"  IS NOT DISTINCT FROM OLD."schlagworte"
           AND NEW."beschreibung" IS NOT DISTINCT FROM OLD."beschreibung"
           AND NEW."dateiname"    IS NOT DISTINCT FROM OLD."dateiname"
           AND NEW."textInhalt"   IS NOT DISTINCT FROM OLD."textInhalt"
        THEN
            RETURN NEW;
        END IF;
    END IF;

    -- A/B/C koennen die Groessengrenze nicht erreichen: titel ist auf 255 Zeichen
    -- begrenzt, beschreibung auf 2000, schlagworte sind kurze Einzelbegriffe.
    metadaten :=
        setweight(to_tsvector('german', coalesce(NEW."titel", '')), 'A') ||
        setweight(to_tsvector('german', coalesce(array_to_string(NEW."schlagworte", ' '), '')), 'B') ||
        setweight(to_tsvector('german',
            coalesce(NEW."beschreibung", '') || ' ' || coalesce(NEW."dateiname", '')), 'C');

    -- Dieser Block sichert eine KOPPLUNG ab, er repariert keinen belegten Fehler.
    -- Die 1-MB-Grenze eines tsvector bemisst sich an der Zahl unterschiedlicher
    -- Lexeme, nicht an Zeichen. Gemessen gegen PostgreSQL 16 (siehe
    -- prisma/tests/suchindex.test.sql): 83.337 Lexeme aus fuenfstelligen Zahlen
    -- und 100.003 aus vierstelligen Kennungen blieben beide darunter, und mehr
    -- Lexeme passen in 500.000 Zeichen nicht hinein. Der Deckel haelt also --
    -- aber nur er. Wird MAX_ZEICHEN im Anwendungscode erhoeht und diese 500000
    -- dabei uebersehen, schluege to_tsvector fehl, der BEFORE-Trigger risse die
    -- ganze Transaktion mit, und das Erkennungsergebnis ginge verloren, bei
    -- jedem Wiederholungsversuch erneut. Dann faellt der Vektor lieber auf die
    -- Metadaten zurueck: ueber Titel auffindbar schlaegt gar nicht auffindbar.
    BEGIN
        NEW."suchIndex" := metadaten ||
            setweight(to_tsvector('german', left(coalesce(NEW."textInhalt", ''), 500000)), 'D');
    EXCEPTION WHEN program_limit_exceeded THEN
        NEW."suchIndex" := metadaten;
        -- Anhaengen statt ersetzen, damit ein Hinweis des Dienstes (etwa zur
        -- Seitengrenze) erhalten bleibt; die Pruefung verhindert Doppeleintraege,
        -- wenn spaeter nur der Titel geaendert wird und der Ueberlauf erneut auftritt.
        IF NEW."textHinweis" IS NULL OR position(ueberlauf_hinweis in NEW."textHinweis") = 0 THEN
            NEW."textHinweis" := coalesce(NEW."textHinweis" || '; ', '') || ueberlauf_hinweis;
        END IF;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dokumente_suchindex
    BEFORE INSERT OR UPDATE ON "dokumente"
    FOR EACH ROW EXECUTE FUNCTION dokumente_suchindex_aktualisieren();

-- Bestand nachziehen: dieses UPDATE loest den Trigger aus und fuellt damit
-- suchIndex fuer alle vorhandenen Zeilen; zugleich landen sie in der Warteschlange.
UPDATE "dokumente" SET "textStatus" = 'WARTEND', "textAktualisiertAm" = CURRENT_TIMESTAMP;
