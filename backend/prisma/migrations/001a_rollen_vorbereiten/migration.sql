-- Fuegt die drei Rollen zum Enum hinzu, damit sie BEREITS COMMITTET sind, wenn
-- 002 sie verwendet.
--
-- Warum diese Datei existiert: PostgreSQL lehnt es ab, einen frisch angelegten
-- Enum-Wert in derselben Transaktion zu benutzen ("unsafe use of new value ...
-- of enum type", SQLSTATE 55P04). Prisma schickt eine Migrationsdatei als EINE
-- implizite Transaktion. In 002 stehen das ADD VALUE und ein UPDATE mit
-- 'VOLLZUGRIFF' zusammen -- auf einer leeren Datenbank scheiterte "prisma
-- migrate deploy" daran, und damit scheiterte JEDE Neuinstallation. Bestehende
-- Installationen merkten davon nichts, weil 002 dort laengst als angewendet
-- vermerkt ist.
--
-- 002 bleibt bewusst unveraendert: Prisma vergleicht die Pruefsumme jeder
-- angewendeten Migration, und schon ein geaenderter Kommentar darin brachte
-- jede bestehende Installation zum Stehen. Die Datei sortiert sich zwischen
-- 001_initial und 002 ein ("_" liegt vor "a", "1" vor "2"). Ihr ADD VALUE
-- IF NOT EXISTS ist ein Nichttun, wo die Werte schon da sind -- und genau
-- deshalb laeuft in 002 anschliessend auch das UPDATE durch: die Werte stammen
-- dann nicht mehr aus der laufenden Transaktion.

ALTER TYPE "Rolle" ADD VALUE IF NOT EXISTS 'VOLLZUGRIFF';
ALTER TYPE "Rolle" ADD VALUE IF NOT EXISTS 'VERTRAGSVERWALTER';
ALTER TYPE "Rolle" ADD VALUE IF NOT EXISTS 'KOSTENBUCHER';
