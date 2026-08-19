-- Verhaltenspruefung des Suchindex-Triggers aus Migration 010.
-- Laeuft in der CI gegen eine echte PostgreSQL-16-Instanz, nachdem alle
-- Migrationen der Reihe nach eingespielt wurden. Jede Abweichung wirft eine
-- Ausnahme; psql laeuft mit ON_ERROR_STOP=1, der Job faellt damit rot aus.
--
-- Warum es diese Datei gibt: Ein BEFORE-Trigger auf dokumente entscheidet ueber
-- JEDEN Schreibvorgang der Tabelle. Zweimal hat statisches Lesen hier etwas
-- uebersehen, das erst beim Ausfuehren sichtbar wird.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. INSERT fuellt den Suchindex, und der Titel ist ueber ihn auffindbar
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    neue_id INTEGER;
    gefunden BOOLEAN;
BEGIN
    INSERT INTO "dokumente" ("dateiname", "speicherName", "mimeTyp", "groesseBytes",
                             "sha256", "titel", "beschreibung", "kategorie",
                             "schlagworte", "aktualisiertAm")
    VALUES ('mietvertrag.pdf', 'pruef-001', 'application/pdf', 1024,
            'a1', 'Mietvertrag Wohnung Erdgeschoss', 'Erstfassung', 'MIETVERTRAG',
            ARRAY['wichtig', 'unterschrieben'], CURRENT_TIMESTAMP)
    RETURNING "id" INTO neue_id;

    IF (SELECT "suchIndex" FROM "dokumente" WHERE "id" = neue_id) IS NULL THEN
        RAISE EXCEPTION '1a: suchIndex wurde beim INSERT nicht gefuellt';
    END IF;

    SELECT "suchIndex" @@ websearch_to_tsquery('german', 'Erdgeschoss')
      INTO gefunden FROM "dokumente" WHERE "id" = neue_id;
    IF NOT gefunden THEN
        RAISE EXCEPTION '1b: Titelwort Erdgeschoss nicht ueber den Suchindex auffindbar';
    END IF;

    SELECT "suchIndex" @@ websearch_to_tsquery('german', 'unterschrieben')
      INTO gefunden FROM "dokumente" WHERE "id" = neue_id;
    IF NOT gefunden THEN
        RAISE EXCEPTION '1c: Schlagwort nicht ueber den Suchindex auffindbar';
    END IF;
    RAISE NOTICE 'Test 1 bestanden: INSERT fuellt den Suchindex';
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 2. Erkannter Inhalt wird durchsuchbar, und die Gewichtung stimmt:
--    ein Titeltreffer muss vor einem reinen Inhaltstreffer stehen
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    rang_titel REAL;
    rang_inhalt REAL;
BEGIN
    INSERT INTO "dokumente" ("dateiname", "speicherName", "mimeTyp", "groesseBytes",
                             "sha256", "titel", "kategorie", "textInhalt", "aktualisiertAm")
    VALUES ('scan.pdf', 'pruef-002', 'application/pdf', 2048, 'a2',
            'Kaution Rueckzahlung', 'MIETVERTRAG', NULL, CURRENT_TIMESTAMP);

    INSERT INTO "dokumente" ("dateiname", "speicherName", "mimeTyp", "groesseBytes",
                             "sha256", "titel", "kategorie", "textInhalt", "aktualisiertAm")
    VALUES ('beleg.pdf', 'pruef-003', 'application/pdf', 2048, 'a3',
            'Beleg ohne Bezug', 'RECHNUNG',
            'Die Kaution betraegt drei Nettokaltmieten und wird verzinst angelegt.',
            CURRENT_TIMESTAMP);

    SELECT ts_rank_cd("suchIndex", websearch_to_tsquery('german', 'Kaution'))
      INTO rang_titel FROM "dokumente" WHERE "speicherName" = 'pruef-002';
    SELECT ts_rank_cd("suchIndex", websearch_to_tsquery('german', 'Kaution'))
      INTO rang_inhalt FROM "dokumente" WHERE "speicherName" = 'pruef-003';

    IF rang_inhalt IS NULL OR rang_inhalt = 0 THEN
        RAISE EXCEPTION '2a: Inhaltstreffer nicht auffindbar (Rang %)', rang_inhalt;
    END IF;
    IF rang_titel <= rang_inhalt THEN
        RAISE EXCEPTION '2b: Gewichtung falsch, Titel % steht nicht vor Inhalt %',
            rang_titel, rang_inhalt;
    END IF;
    RAISE NOTICE 'Test 2 bestanden: Inhalt durchsuchbar, Titel (%) vor Inhalt (%)',
        rang_titel, rang_inhalt;
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 3. Der Riegel gegen unnoetige Neuberechnung: ein reiner Statuswechsel darf
--    den Suchindex nicht antasten, eine Titelaenderung dagegen schon
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    vorher tsvector;
    nachher tsvector;
BEGIN
    SELECT "suchIndex" INTO vorher FROM "dokumente" WHERE "speicherName" = 'pruef-001';

    UPDATE "dokumente" SET "textStatus" = 'IN_ARBEIT', "textAktualisiertAm" = now()
     WHERE "speicherName" = 'pruef-001';
    SELECT "suchIndex" INTO nachher FROM "dokumente" WHERE "speicherName" = 'pruef-001';

    IF nachher IS NULL THEN
        RAISE EXCEPTION '3a: Statuswechsel hat den Suchindex geloescht, das Dokument waere aus der Suche verschwunden';
    END IF;
    IF nachher <> vorher THEN
        RAISE EXCEPTION '3b: Statuswechsel hat den Suchindex veraendert, obwohl keine Quellspalte betroffen war';
    END IF;

    UPDATE "dokumente" SET "titel" = 'Mietvertrag Dachgeschoss'
     WHERE "speicherName" = 'pruef-001';
    SELECT "suchIndex" INTO nachher FROM "dokumente" WHERE "speicherName" = 'pruef-001';
    IF nachher = vorher THEN
        RAISE EXCEPTION '3c: Titelaenderung hat den Suchindex NICHT erneuert, die Suche faende weiter den alten Titel';
    END IF;
    IF NOT (nachher @@ websearch_to_tsquery('german', 'Dachgeschoss')) THEN
        RAISE EXCEPTION '3d: neuer Titel nach der Aenderung nicht auffindbar';
    END IF;
    RAISE NOTICE 'Test 3 bestanden: Riegel greift bei Statuswechsel, nicht bei Inhaltsaenderung';
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 4. Misst den Abstand zur 1-MB-Grenze eines tsvector bei groesstmoeglicher
--    Lexemdichte. Zwei Anlaeufe stehen dahinter: fuenfstellige Zahlen ergaben
--    83.337 Lexeme, vierstellige Kennungen 100.003 -- beide blieben unter der
--    Grenze. Mehr Lexeme passen in 500.000 Zeichen nicht hinein, damit ist die
--    Frage beantwortet: der Zeichendeckel haelt den Vektor zuverlaessig klein.
--    Der Test bleibt trotzdem, denn er bewacht genau diese Aussage. Wird
--    MAX_ZEICHEN je erhoeht, faellt hier auf, dass die Rechnung nicht mehr
--    aufgeht. Die Buchstabenvariante des ersten Anlaufs war uebrigens
--    untauglich: der deutsche Stemmer fuehrt einen Teil solcher Kunstwoerter
--    auf denselben Stamm zurueck und entschaerfte den Test unbemerkt. Die
--    Ziffer an zweiter Stelle macht jedes Token zu einem numword.
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    viele TEXT;
    hinweis TEXT;
    index_da BOOLEAN;
    lexeme INTEGER;
    bytes INTEGER;
BEGIN
    -- VIERSTELLIGE Kennungen aus Buchstabe, Ziffer und zwei Basis-36-Stellen.
    -- Zwei Eigenschaften sind hier wesentlich: Die Ziffer an zweiter Stelle
    -- macht jedes Token zu einem numword, das der deutsche Stemmer unangetastet
    -- laesst -- anders als reine Buchstabenfolgen, von denen ein Teil auf
    -- denselben Stamm faellt. Und vier Zeichen statt fuenf lassen 100.000 statt
    -- 83.337 Token in dieselben 500.000 Zeichen. Ein Lauf mit fuenfstelligen
    -- Zahlen kam auf 83.337 Lexeme und blieb knapp unter der Grenze; kuerzere
    -- Kennungen sind genau der Fall, der sie reisst. Kurze Belegnummern sind
    -- nichts Ausgefallenes.
    SELECT string_agg(
             substr('abcdefghijklmnopqrstuvwxyz', (g / 12960) % 26 + 1, 1) ||
             substr('0123456789', (g / 1296) % 10 + 1, 1) ||
             substr('0123456789abcdefghijklmnopqrstuvwxyz', (g / 36) % 36 + 1, 1) ||
             substr('0123456789abcdefghijklmnopqrstuvwxyz', g % 36 + 1, 1), ' ')
      INTO viele FROM generate_series(0, 99999) g;

    RAISE NOTICE 'Test 4: Textlaenge % Zeichen vor der Kuerzung auf 500000', length(viele);

    INSERT INTO "dokumente" ("dateiname", "speicherName", "mimeTyp", "groesseBytes",
                             "sha256", "titel", "kategorie", "textInhalt", "aktualisiertAm")
    VALUES ('riesige-tabelle.xlsx', 'pruef-004',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            4096, 'a4', 'Belegliste Nebenkosten', 'ABRECHNUNG', viele, CURRENT_TIMESTAMP);

    SELECT "textHinweis", "suchIndex" IS NOT NULL, length("suchIndex"),
           octet_length("suchIndex"::text)
      INTO hinweis, index_da, lexeme, bytes
      FROM "dokumente" WHERE "speicherName" = 'pruef-004';

    -- Gemessen statt geschaetzt: die 1-MB-Grenze gilt fuer die interne Darstellung,
    -- die Textfassung ist nur ein Naeherungswert. Beide Zahlen zeigen, wie weit
    -- wir tatsaechlich von der Grenze entfernt sind.
    RAISE NOTICE 'Test 4: % Lexeme, Textfassung % Byte (Grenze der internen Darstellung: 1048575)',
        lexeme, bytes;

    IF NOT index_da THEN
        RAISE EXCEPTION '4a: suchIndex ist NULL, das Dokument waere ueberhaupt nicht auffindbar';
    END IF;

    IF hinweis IS NOT NULL AND position('zu vielfaeltig' in hinweis) > 0 THEN
        -- Der Ueberlauf ist eingetreten und wurde abgefangen: genau der Zweck des Blocks
        IF NOT ((SELECT "suchIndex" FROM "dokumente" WHERE "speicherName" = 'pruef-004')
                @@ websearch_to_tsquery('german', 'Belegliste')) THEN
            RAISE EXCEPTION '4b: nach dem Rueckfall sind nicht einmal die Metadaten auffindbar';
        END IF;
        RAISE NOTICE 'Test 4 bestanden: Ueberlauf eingetreten und abgefangen, Metadaten weiter durchsuchbar (Hinweis: %)', hinweis;
    ELSE
        RAISE NOTICE 'Test 4 bestanden: kein Ueberlauf bei groesstmoeglicher Lexemdichte, der Zeichendeckel haelt. Der Rueckfallpfad des Triggers bleibt damit ungeprueft -- er ist Absicherung gegen eine Erhoehung von MAX_ZEICHEN, nicht gegen den Normalbetrieb.';
    END IF;
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 5. Die zweite Groessengrenze: EIN Lexem mit sehr vielen Positionen. Postgres
--    wirft dafuer "positions array too long" OHNE Fehlercode (XX000), was der
--    Ausnahmeblock bewusst nicht abfaengt -- WHEN OTHERS wuerde auch eine
--    umbenannte Spalte verschlucken und aus einem lauten Fehler ein stilles
--    Falschverhalten machen. Diese Pruefung klaert, ob der Fall ueberhaupt
--    erreichbar ist. Faellt sie rot aus, brauchen wir eine Antwort darauf;
--    laeuft sie durch, ist die Restluecke theoretisch.
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    index_da BOOLEAN;
BEGIN
    INSERT INTO "dokumente" ("dateiname", "speicherName", "mimeTyp", "groesseBytes",
                             "sha256", "titel", "kategorie", "textInhalt", "aktualisiertAm")
    VALUES ('monotonie.txt', 'pruef-005', 'text/plain', 4096, 'a5',
            'Ein Wort hunderttausendmal', 'SONSTIGES',
            repeat('nebenkostenabrechnung ', 100000), CURRENT_TIMESTAMP);

    SELECT "suchIndex" IS NOT NULL INTO index_da
      FROM "dokumente" WHERE "speicherName" = 'pruef-005';
    IF NOT index_da THEN
        RAISE EXCEPTION '5a: suchIndex ist NULL';
    END IF;
    RAISE NOTICE 'Test 5 bestanden: 100000 Positionen eines einzigen Lexems ohne Abbruch verarbeitet';
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 6. ts_headline liefert die Textstelle mit den neutralen Marken [[[ und ]]],
--    die das Backend serverseitig zerlegt. Bewusst kein HTML: der Inhalt eines
--    hochgeladenen Dokuments ist nicht vertrauenswuerdig.
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    stelle TEXT;
BEGIN
    SELECT ts_headline('german', "textInhalt",
                       websearch_to_tsquery('german', 'Kaution'),
                       'StartSel=[[[,StopSel=]]],MaxWords=28,MinWords=12,MaxFragments=1')
      INTO stelle FROM "dokumente" WHERE "speicherName" = 'pruef-003';

    IF stelle IS NULL OR position('[[[' in stelle) = 0 OR position(']]]' in stelle) = 0 THEN
        RAISE EXCEPTION '6a: ts_headline hat keine Marken gesetzt: %', stelle;
    END IF;
    RAISE NOTICE 'Test 6 bestanden: Textstelle mit Marken: %', stelle;
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 7. Der GIN-Index ist vorhanden. Ohne ihn liefe jede Suche als vollstaendiger
--    Tabellendurchlauf -- dieselbe Antwort, aber unbrauchbar langsam, sobald
--    Dokumente zusammenkommen.
-- ---------------------------------------------------------------------------
DO $pruefung$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE tablename = 'dokumente' AND indexname = 'dokumente_suchIndex_idx'
    ) THEN
        RAISE EXCEPTION '7a: GIN-Index dokumente_suchIndex_idx fehlt';
    END IF;
    RAISE NOTICE 'Test 7 bestanden: GIN-Index vorhanden';
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 8. Die Abfrage aus volltextTreffer (dokument.service.ts) in derselben Form.
--    Sie wird ueber Prisma als $queryRaw abgesetzt und lief deshalb bis hierher
--    nie gegen eine echte Datenbank -- ein Syntaxfehler waere erst im Betrieb
--    aufgefallen, und zwar bei jeder Suche. Besonders die Verbindung von
--    dokumente mit websearch_to_tsquery in der FROM-Klausel ist der Teil, den
--    man gesehen haben will.
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    zeilen INTEGER;
    rang_titel DOUBLE PRECISION;
    rang_inhalt DOUBLE PRECISION;
    stelle_inhalt TEXT;
    stelle_ohne TEXT;
BEGIN
    CREATE TEMP TABLE treffer AS
    SELECT d.id,
           d."speicherName" AS quelle,
           ts_rank_cd(d."suchIndex", frage)::float8 AS rang,
           CASE WHEN d."textInhalt" IS NOT NULL AND d."textInhalt" <> ''
                THEN ts_headline('german', d."textInhalt", frage,
                                 'StartSel=[[[,StopSel=]]],MaxWords=28,MinWords=12,MaxFragments=1')
                ELSE NULL
           END AS textstelle
      FROM "dokumente" d, websearch_to_tsquery('german', 'Kaution') AS frage
     WHERE d."suchIndex" @@ frage
     ORDER BY rang DESC
     LIMIT 500;

    SELECT count(*) INTO zeilen FROM treffer;
    IF zeilen < 2 THEN
        RAISE EXCEPTION '8a: Abfrage lieferte nur % Zeilen, erwartet mindestens 2', zeilen;
    END IF;

    SELECT rang, textstelle INTO rang_titel, stelle_ohne FROM treffer WHERE quelle = 'pruef-002';
    SELECT rang, textstelle INTO rang_inhalt, stelle_inhalt FROM treffer WHERE quelle = 'pruef-003';

    IF rang_titel IS NULL OR rang_inhalt IS NULL THEN
        RAISE EXCEPTION '8b: erwartete Dokumente fehlen in der Trefferliste';
    END IF;
    IF rang_titel <= rang_inhalt THEN
        RAISE EXCEPTION '8c: Rangfolge falsch, Titel % nicht vor Inhalt %', rang_titel, rang_inhalt;
    END IF;

    -- Ohne textInhalt darf keine Textstelle entstehen, sonst zeigte die
    -- Oberflaeche einen leeren Kasten unter jedem Titeltreffer.
    IF stelle_ohne IS NOT NULL THEN
        RAISE EXCEPTION '8d: Dokument ohne Inhalt hat eine Textstelle bekommen: %', stelle_ohne;
    END IF;
    IF stelle_inhalt IS NULL OR position('[[[' in stelle_inhalt) = 0 THEN
        RAISE EXCEPTION '8e: Inhaltstreffer ohne markierte Textstelle: %', stelle_inhalt;
    END IF;

    DROP TABLE treffer;
    RAISE NOTICE 'Test 8 bestanden: Abfrage aus volltextTreffer laeuft, % Zeilen, Textstelle nur bei Inhalt', zeilen;
END
$pruefung$;

-- ---------------------------------------------------------------------------
-- 9. websearch_to_tsquery vertraegt beliebige Eingabe. Das ist der Grund fuer
--    diese Funktion statt to_tsquery: eine Suche nach einem einzelnen
--    Anfuehrungszeichen darf keinen Fehler werfen, sondern nichts finden --
--    sonst quittierte die Oberflaeche einen Tippfehler mit Serverfehler.
-- ---------------------------------------------------------------------------
DO $pruefung$
DECLARE
    eingabe TEXT;
    zeilen INTEGER;
BEGIN
    FOREACH eingabe IN ARRAY ARRAY['', '   ', '"', '&|!()', 'und oder', '', ':*', 'Kaution -verzinst']
    LOOP
        SELECT count(*) INTO zeilen
          FROM "dokumente" d, websearch_to_tsquery('german', eingabe) AS frage
         WHERE d."suchIndex" @@ frage;
        RAISE NOTICE 'Test 9: Eingabe %L ergab % Treffer', eingabe, zeilen;
    END LOOP;
    RAISE NOTICE 'Test 9 bestanden: keine Eingabe hat die Abfrage zum Fehler gebracht';
END
$pruefung$;

ROLLBACK;
