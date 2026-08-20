# Installation

Diese Anleitung beschreibt eine Produktivinstallation mit Docker Compose. Es
werden **fertige Images** verwendet — der Quellcode wird nicht benötigt, und es
wird nichts gebaut.

Rechnen Sie mit etwa zehn Minuten.

## Voraussetzungen

- Ein Linux-Server mit **Docker** und **Docker Compose v2** (`docker compose version`)
- Etwa **2 GB** freier Plattenplatz für die Images. Das Backend-Abbild enthält die
  Texterkennung samt deutschem Sprachmodell und ist entsprechend groß.
- Ausreichend Platz für die hochgeladenen Dokumente, getrennt bedacht (siehe Schritt 2)
- Ein **Reverse Proxy mit TLS** davor. Die Anwendung selbst spricht nur HTTP und
  gehört nicht ungeschützt ins Netz — sie verwaltet personenbezogene Daten von
  Mietern, darunter Ausweiskopien und Bonitätsauskünfte.

## Schritt 1: Die beiden Dateien holen

Sie brauchen genau zwei: die Compose-Datei und eine Konfiguration.

```bash
mkdir -p ~/mietverwaltung && cd ~/mietverwaltung
curl -O https://raw.githubusercontent.com/nikc112/Vermietverwaltung/master/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/nikc112/Vermietverwaltung/master/.env.example
```

Kein Klonen, kein Bauen. Die Images liegen öffentlich in der GitHub Container
Registry und werden beim Start gezogen.

## Schritt 2: Verzeichnis für die Dokumente anlegen

**Diesen Schritt nicht überspringen.** Die hochgeladenen Dateien liegen auf dem
Host, nicht im Container. Fehlt das Verzeichnis beim ersten Start, kann die
Zuordnung danebengehen — die Dateien landen dann in der Container-Schicht und
sind beim nächsten `docker compose down` verloren, während die Datenbank
weiterhin Einträge dazu führt. Genau dieser Fall ist bereits eingetreten.

```bash
sudo mkdir -p /data/mietverwaltung/dokumente
sudo chown -R 1000:1000 /data/mietverwaltung/dokumente
```

Die Kennung 1000 ist der Benutzer `node` im Container -- die Anwendung läuft
nicht als root. Soll ein anderer Pfad verwendet werden, tragen Sie ihn in
Schritt 3 unter `DOKUMENT_PFAD` ein.

Wählen Sie den Pfad so, dass er auf einem Datenträger mit genügend Platz liegt
und **von Ihrer Sicherung erfasst wird** — siehe unten.

## Schritt 3: Konfiguration anlegen

Die `.env` haben Sie in Schritt 1 bereits heruntergeladen.

Öffnen Sie sie und ersetzen Sie jeden Wert, der mit `CHANGEME` beginnt.
Zufällige Geheimnisse erzeugen Sie so:

```bash
openssl rand -base64 36
```

Diese vier Werte sind Pflicht, ohne sie startet die Anwendung nicht:

| Variable | Bedeutung |
|---|---|
| `POSTGRES_PASSWORD` | Passwort der Datenbank |
| `JWT_SECRET` | Schlüssel für die Anmeldung, mindestens 32 zufällige Zeichen |
| `ADMIN_EMAIL` | Anmeldename des ersten Administrators |
| `ADMIN_PASSWORD` | dessen Passwort, mindestens 12 Zeichen |

Der Administrator wird **nur beim allerersten Start** angelegt. Eine spätere
Änderung von `ADMIN_PASSWORD` in der `.env` bleibt wirkungslos; ändern Sie das
Passwort dann in der Anwendung.

Prüfen Sie außerdem:

- **`APP_PORT`** — der Port auf dem Host, hinter den Ihr Reverse Proxy zeigt.
  Voreingestellt ist 8080.
- **`APP_URL`** — die öffentliche Adresse. Sie steht in E-Mails, welche die
  Anwendung versendet.
- **`TRUST_PROXY`** — siehe Schritt 5.

## Schritt 4: Starten

```bash
docker compose up -d
```

Der erste Aufruf lädt die Images herunter und dauert je nach Anbindung einige
Minuten. Danach:

```bash
docker compose logs -f backend
```

Erwartet werden der Reihe nach: die angewendeten Migrationen, `Admin-Benutzer
erstellt.` und `Server läuft`. Bricht der Container mit einer Meldung über
fehlende Variablen ab, fehlt ein Pflichtwert aus Schritt 3.

Ein kurzer Test ohne Proxy:

```bash
curl -I http://localhost:8080
```

## Schritt 5: Reverse Proxy einrichten

Die Anwendung erwartet vom vorgelagerten Proxy drei Dinge. Ein Beispiel liegt
unter `nginx/reverse-proxy-beispiel.conf`; die Einstellungen gelten sinngemäß
auch für Caddy, Traefik oder einen Nginx Proxy Manager.

**Erstens: die Grenze für die Dateigröße.**

```nginx
client_max_body_size 26M;
```

Ohne diese Zeile greift bei nginx die Voreinstellung von 1 MB, und jeder
Dokumenten-Upload scheitert mit einer HTML-Fehlerseite, bevor die Anwendung ihn
überhaupt sieht. Die 26 MB decken 25 MB Nutzdaten plus den Aufschlag der
Übertragungsform ab.

**Zweitens: die Absenderadresse.**

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

Bewusst `$remote_addr` und **nicht** `$proxy_add_x_forwarded_for`. Die äußerste
Schicht steht zum Internet hin: Hängte sie den vom Client mitgeschickten Wert an,
könnte dieser ihn frei wählen und damit die Sperre gegen das Durchprobieren von
Passwörtern bei jedem Versuch zurücksetzen.

**Drittens: `TRUST_PROXY` in der `.env`.**

Läuft der Proxy auf **derselben** Maschine, genügt der Vorgabewert. Läuft er auf
einer **anderen**, tragen Sie dessen Adresse ein:

```
TRUST_PROXY=127.0.0.1, ::1, 172.28.0.0/16, 10.0.0.5
```

Ohne diesen Eintrag verwirft die Anwendung den Kopf des Proxys und hält alle
Nutzer für einen einzigen Absender — die Ratenbegrenzung träfe dann alle
gemeinsam. Tragen Sie hier nur ein, was Sie tatsächlich kontrollieren.

**Warum der zweite Punkt wichtiger ist, als er aussieht.** Sobald die Anwendung
einem Proxy glaubt, kann sie nicht mehr unterscheiden, ob `X-Forwarded-For` von
diesem Proxy stammt oder vom Client mitgeschickt wurde. Überschreibt Ihr äußerer
Proxy den Kopf nicht, kann ein Angreifer bei jedem Versuch eine andere Adresse
behaupten und die adressgebundene Ratenbegrenzung damit umgehen. Die Bremse
gegen Passwortraten hängt deshalb zusätzlich am Konto und nicht an der Adresse —
fünf Fehlversuche sperren es 15 Minuten lang, gleich woher sie kommen. Die
Einzelheiten stehen in [SECURITY.md](SECURITY.md).

## Sicherung

Zwei Dinge müssen gesichert werden. Eines allein nützt nichts: Die Datenbank
kennt die Dokumente, die Dateien liegen daneben.

```bash
# Datenbank
docker compose exec -T db pg_dump -U mietuser mietverwaltung | gzip > mietverwaltung-$(date +%F).sql.gz

# Dokumente
tar czf dokumente-$(date +%F).tar.gz -C /data/mietverwaltung dokumente
```

Zum Zurückspielen der Datenbank in eine leere Installation:

```bash
gunzip -c mietverwaltung-2026-08-19.sql.gz | docker compose exec -T db psql -U mietuser mietverwaltung
```

Die Sicherungen enthalten personenbezogene Daten. Bewahren Sie sie entsprechend
auf.

## Aktualisieren

```bash
docker compose pull && docker compose up -d
```

Migrationen laufen beim Start des Backend-Containers automatisch. Schlägt eine
fehl, bricht der Container ab und die Datenbank bleibt unverändert.

**Vor größeren Sprüngen** sollten Sie die Datenbank sichern. Ein Rückschritt auf
eine ältere Version ist nach einer Migration nicht ohne Weiteres möglich.

Eine feste Version statt `latest` wählen Sie über `IMAGE_TAG` in der `.env`:

```
IMAGE_TAG=v1.1.0
```

### Umstieg auf 1.1.0 — zwei einmalige Handgriffe

Ab dieser Version laufen beide Container **ohne Wurzelrechte**. Eine bestehende
Installation muss dafür zwei Dinge nachziehen.

**Erstens: das Volume für die erzeugten PDF-Abrechnungen übereignen.** Es wurde
angelegt, als der Container noch als root lief, und gehört deshalb root. Der
Dienst könnte dort sonst nicht mehr schreiben:

```bash
docker compose down
docker run --rm -v mietverwaltung_pdf_storage:/v alpine chown -R 1000:1000 /v
```

Heißt Ihr Verzeichnis anders, heißt auch das Volume anders --
`docker volume ls | grep pdf_storage` nennt den richtigen Namen.

**Zweitens: die neue `docker-compose.yml` holen.** Der Frontend-Container hört
jetzt innen auf Port 8080 statt 80, weil nur Ports unter 1024 Wurzelrechte
verlangen. Wer die alte Datei behält und nur neue Images zieht, landet ins Leere.
Nach außen ändert sich nichts.

```bash
curl -O https://raw.githubusercontent.com/nikc112/Vermietverwaltung/master/docker-compose.yml
docker compose up -d
docker compose exec backend id -u    # muss 1000 melden, nicht 0
```

## Wenn etwas nicht funktioniert

**Der Backend-Container startet nicht.**
`docker compose logs backend`. Die häufigste Ursache ist ein fehlender Wert in
der `.env`; der Container sagt, welcher.

**Uploads scheitern mit „413" oder einer Fehlerseite.**
`client_max_body_size` im Reverse Proxy fehlt, siehe Schritt 5.

**Hochgeladene Dateien sind nach einem Neustart verschwunden.**
Das Verzeichnis aus Schritt 2 war beim ersten Start nicht vorhanden. Prüfen Sie
die Zuordnung:

```bash
docker inspect mietverwaltung_backend --format '{{json .Mounts}}'
```

Es muss ein Eintrag vom Typ `bind` auf Ihr Host-Verzeichnis zeigen.

**Dokumente bleiben auf „wird verarbeitet" stehen.**
Sehen Sie im Protokoll nach; die Texterkennung meldet ihre Fehler dort im
Klartext. Prüfen Sie, ob die Werkzeuge im Abbild vorhanden sind:

```bash
docker compose exec backend sh -c 'which pdftotext tesseract unzip'
```

**Anmeldung nicht möglich, obwohl das Passwort stimmt.**
Wurde `JWT_SECRET` nachträglich geändert, sind alle bestehenden Anmeldungen
ungültig. Einmal abmelden und neu anmelden.

**Die Anmeldung meldet „Zu viele fehlgeschlagene Anmeldungen".**
Nach fünf Fehlversuchen ist das Konto 15 Minuten gesperrt. Die Sperre gilt je
Konto und läuft von selbst ab; ein Neustart des Backend-Containers hebt sie
ebenfalls auf.

**Der Container startet mit einer Meldung zu `JWT_SECRET`.**
Geprüft wird nicht nur die Länge, sondern auch, ob genügend verschiedene Zeichen
vorkommen und ob noch ein Platzhalter aus der Vorlage darin steht. Erzeugen Sie
den Wert mit `openssl rand -base64 36`.

**Uploads oder die Texterkennung scheitern mit „read-only file system".**
Beide Container laufen mit schreibgeschütztem Wurzeldateisystem. Beschreibbar
sind nur `/app/storage/dokumente`, `/app/storage/pdfs`, `/app/tmp` und `/tmp`.
Prüfen Sie, ob Sie die aktuelle `docker-compose.yml` verwenden — insbesondere
das Volume `ocr_tmp` auf `/app/tmp`.

## Weiterentwicklung

Wer am Quellcode arbeiten oder eine eigene Abwandlung betreiben möchte, klont
das Repository und baut selbst:

```bash
git clone https://github.com/nikc112/Vermietverwaltung.git
cd Vermietverwaltung
cp .env.example .env
docker compose -f docker-compose.build.yml up -d --build
```

Für die Entwicklungsumgebung mit automatischem Neuladen:

```bash
docker compose -f docker-compose.dev.yml up
```

Tests und Prüfungen:

```bash
cd backend  && npm ci && npm run lint && npm test && npm run build
cd frontend && npm ci && npm run lint && npm run build
```

Die Migrationen und das Verhalten des Suchindex werden zusätzlich in der CI
gegen eine echte PostgreSQL-16-Instanz geprüft, siehe
`.github/workflows/docker-publish.yml` und `backend/prisma/tests/`.
