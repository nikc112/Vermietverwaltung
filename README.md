# Mietverwaltung

Eine Webanwendung zur Verwaltung von Mietobjekten für private Vermieter und
kleine Hausverwaltungen im deutschsprachigen Raum. Sie deckt den Weg von der
Immobilie über den Mietvertrag bis zur Nebenkostenabrechnung und zum Mahnwesen
ab und läuft vollständig auf eigener Hardware.

**Alle Daten bleiben auf dem eigenen Server.** Das gilt ausdrücklich auch für die
Texterkennung: Ausweiskopien und Bonitätsauskünfte von Mietern werden lokal
ausgewertet, nicht bei einem Cloud-Anbieter.

## Funktionsumfang

**Stammdaten**
Eigentümer, Mietobjekte, Mieteinheiten, Mietverträge und Kontakte. Kontakte sind
zentral geführt, sodass dieselbe Person als Mieter, Eigentümer oder Dienstleister
auftreten kann, ohne doppelt erfasst zu werden.

**Zahlungen und Forderungen**
Erfassung der Mietzahlungen mit Soll-Ist-Abgleich und Erkennung von
Teilzahlungen. Offene Posten laufen in einer Forderungsübersicht zusammen; aus
ihr heraus entstehen Mahnungen in mehreren Stufen.

**Nebenkostenabrechnung**
Umlage nach wählbaren Schlüsseln, anteilige Abrechnung bei unterjährigem Ein-
oder Auszug, Ausweisung des Lohnanteils nach § 35a EStG und Erzeugung der
Abrechnung als PDF.

**Fristenüberwachung**
Die Anwendung berechnet Fristen selbst — die Abrechnungsfrist nach § 556 BGB und
das Ende befristeter Verträge — und zeigt sie als Ampel. Einzelne Fristen lassen
sich übersteuern, ohne die automatische Berechnung zu verlieren.

**Dokumentenablage mit Volltextsuche**
Verträge, Protokolle, Rechnungen und Nachweise werden mit Bezug zu Vertrag,
Objekt oder Kontakt abgelegt. Hochgeladene Dateien werden im Hintergrund
erschlossen: digitale PDFs und Office-Dateien über ihre Textebene, Scans und
Fotos per Zeichenerkennung. Gesucht wird anschließend über den **Inhalt**, nicht
nur über Titel und Schlagworte, mit Anzeige der Fundstelle im Treffer.

**Rollen und Datenschutz**
Fünf Rollen von der reinen Kostenbuchhaltung bis zur Verwaltung. Sensible
Kategorien wie Ausweiskopien und Bonitätsauskünfte sind nur für dazu berechtigte
Rollen sichtbar — auch über die Volltextsuche. Für Auskunfts- und Löschersuchen
nach DSGVO gibt es einen Export und eine Löschprüfung, die aufbewahrungs-
pflichtige Unterlagen nach § 147 AO erhält und lediglich von der Person löst.

## Technik

| Bereich | Verwendet |
|---|---|
| Backend | Fastify 5, TypeScript, Prisma, PostgreSQL 16 |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, React Query, React Router 7 |
| Texterkennung | Tesseract und Poppler, als Prozesse im Container |
| Suche | PostgreSQL-Volltextsuche mit deutschem Wörterbuch |
| Betrieb | Docker Compose, beide Container ohne Wurzelrechte |

Die Volltextsuche kommt ohne zusätzliche Suchmaschine aus. Sie nutzt eine
gewichtete `tsvector`-Spalte, die ein Datenbank-Trigger pflegt: Titel wiegen
schwerer als Schlagworte, diese schwerer als der erkannte Inhalt.

## Installation

Es werden **fertige Images** verwendet — kein Klonen, kein Bauen. Sie brauchen
zwei Dateien und eine ausgefüllte Konfiguration:

```bash
mkdir -p ~/mietverwaltung && cd ~/mietverwaltung
curl -O https://raw.githubusercontent.com/nikc112/Vermietverwaltung/master/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/nikc112/Vermietverwaltung/master/.env.example

sudo mkdir -p /data/mietverwaltung/dokumente
sudo chown -R 1000:1000 /data/mietverwaltung/dokumente

# .env öffnen und die vier Pflichtangaben setzen
docker compose up -d
```

Die vollständige Anleitung samt Sicherung und Fehlersuche steht in
**[INSTALL.md](INSTALL.md)**.

Ein Reverse Proxy mit TLS gehört davor. Welche Einstellungen er braucht, steht in
INSTALL.md und in `nginx/reverse-proxy-beispiel.conf`.

## Entwicklung

```bash
git clone https://github.com/nikc112/Vermietverwaltung.git
cd Vermietverwaltung
cp .env.example .env
docker compose -f docker-compose.dev.yml up      # Entwicklung, automatisches Neuladen
docker compose -f docker-compose.build.yml up -d --build   # eigener Bau statt fertiger Images
```

Die Prüfungen laufen getrennt für beide Teile:

```bash
cd backend  && npm ci && npm run lint && npm test && npm run build
cd frontend && npm ci && npm run lint && npm run build
```

Datenbankmigrationen werden von Hand als SQL geschrieben und liegen unter
`backend/prisma/migrations/`. Die CI spielt sie bei jedem Push in eine echte
PostgreSQL-16-Instanz ein und prüft anschließend das Verhalten des Suchindex
(`backend/prisma/tests/`) — erst danach entstehen Images.

## Sicherheit

Beide Container laufen als unprivilegierter Benutzer mit schreibgeschütztem
Wurzeldateisystem und ohne Linux-Capabilities. Die Anmeldung ist auf HS256
festgelegt, die Rolle wird bei jeder Anfrage aus der Datenbank geholt statt aus
dem Token übernommen, und fünf Fehlversuche sperren ein Konto für 15 Minuten.
`npm audit --omit=dev` meldet in beiden Teilen null Funde; die CI bricht ab,
sobald sich das ändert, und prüft die Härtung am laufenden Container.

Welche Annahmen die Anwendung über ihre Umgebung trifft — insbesondere über den
vorgelagerten TLS-Proxy — und welche Risiken bewusst bestehen bleiben, steht in
**[SECURITY.md](SECURITY.md)**.

## Stand

Die Anwendung ist im produktiven Einsatz. Sie ist auf die Bedürfnisse einer
konkreten Verwaltung zugeschnitten und erhebt nicht den Anspruch, jeden Fall
abzudecken. Die Oberfläche ist durchgehend deutsch.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
