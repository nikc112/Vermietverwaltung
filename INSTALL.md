# Installation

Diese Anleitung beschreibt eine Produktivinstallation mit Docker Compose. Die
Anwendung wird dabei aus dem Quellcode gebaut — es wird kein Zugang zu einer
Container-Registry benötigt.

Rechnen Sie mit etwa 15 Minuten, davon der größte Teil Bauzeit.

## Voraussetzungen

- Ein Linux-Server mit **Docker** und **Docker Compose v2** (`docker compose version`)
- Etwa **3 GB** freier Plattenplatz für die Images. Das Backend-Abbild enthält die
  Texterkennung samt deutschem Sprachmodell und ist entsprechend groß.
- Ausreichend Platz für die hochgeladenen Dokumente, getrennt bedacht (siehe Schritt 2)
- Ein **Reverse Proxy mit TLS** davor. Die Anwendung selbst spricht nur HTTP und
  gehört nicht ungeschützt ins Netz — sie verwaltet personenbezogene Daten von
  Mietern, darunter Ausweiskopien und Bonitätsauskünfte.

## Schritt 1: Quellcode holen

```bash
git clone https://github.com/nikc112/Mietverwaltung.git
cd Mietverwaltung
```

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

Die Kennung 1000 ist der Benutzer `node` im Container. Soll ein anderer Pfad
verwendet werden, tragen Sie ihn in Schritt 3 unter `DOKUMENT_PFAD` ein.

Wählen Sie den Pfad so, dass er auf einem Datenträger mit genügend Platz liegt
und **von Ihrer Sicherung erfasst wird** — siehe unten.

## Schritt 3: Konfiguration anlegen

```bash
cp .env.example .env
```

Öffnen Sie die `.env` und ersetzen Sie jeden Wert, der mit `CHANGEME` beginnt.
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
docker compose up -d --build
```

Der erste Aufruf baut beide Images und dauert einige Minuten. Danach:

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
TRUST_PROXY=127.0.0.1, ::1, 172.16.0.0/12, 10.0.0.5
```

Ohne diesen Eintrag verwirft die Anwendung den Kopf des Proxys und hält alle
Nutzer für einen einzigen Absender — die Ratenbegrenzung träfe dann alle
gemeinsam. Tragen Sie hier nur ein, was Sie tatsächlich kontrollieren.

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
git pull
docker compose up -d --build
```

Migrationen laufen beim Start des Backend-Containers automatisch. Schlägt eine
fehl, bricht der Container ab und die Datenbank bleibt unverändert.

**Vor größeren Sprüngen** sollten Sie die Datenbank sichern. Ein Rückschritt auf
eine ältere Version ist nach einer Migration nicht ohne Weiteres möglich.

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

## Weiterentwicklung

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
