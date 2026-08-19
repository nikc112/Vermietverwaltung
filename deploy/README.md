# Betrieb mit fertigen Images (ghcr.io)

> **Dieser Weg setzt Zugriff auf die privaten Images voraus** und richtet sich an
> die Betreiber dieses Repositories. Wer die Anwendung selbst aufsetzen moechte,
> folgt stattdessen [INSTALL.md](../INSTALL.md) — dort wird aus dem Quellcode
> gebaut, ohne Registry und ohne Zugangstoken.

Bei jedem Push nach `master` oder auf einen `feature/*`-Branch baut GitHub Actions
automatisch die Images und veröffentlicht sie privat in der GitHub Container Registry:

- `ghcr.io/nikc112/mietverwaltung-backend`
- `ghcr.io/nikc112/mietverwaltung-frontend`

Tags: `latest` (= master), sonst der Branch-Name mit `-` statt `/`
(z.B. `feature-ocr-volltextsuche`).

## Server einrichten (Test oder Produktion)

Voraussetzung: Docker + Docker Compose. Kein git, kein Quellcode nötig.

1. **Einmalig: bei ghcr.io anmelden** (Images sind privat).
   Auf GitHub ein Personal Access Token (classic) mit Scope `read:packages` erstellen
   (Settings → Developer settings → Personal access tokens), dann auf dem Server:

   ```bash
   docker login ghcr.io -u nikc112 -p <TOKEN>
   ```

2. **Dateien anlegen:** `deploy/docker-compose.yml` aus diesem Repo als
   `docker-compose.yml` auf den Server kopieren und daneben eine `.env`
   (Vorlage: `.env.example` im Repo-Root; Pflicht: `POSTGRES_PASSWORD`,
   `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; ausserdem `DOKUMENT_PFAD` — das
   Verzeichnis muss VOR dem ersten Start existieren, siehe INSTALL.md Schritt 2).
   Für den Testserver zusätzlich:

   ```
   IMAGE_TAG=feature-ocr-volltextsuche
   ```

   Nach dem Zusammenfuehren nach master wieder auf `IMAGE_TAG=latest` stellen —
   sonst bleibt der Server dauerhaft am Branch-Abbild haengen und bekommt keine
   weiteren Staende mehr.

3. **Starten:**

   ```bash
   docker compose up -d
   ```

   Der Backend-Container führt beim Start automatisch `prisma migrate deploy`
   aus (Migrationen inkl. Konsistenzprüfung; bricht bei Fehlern ab, DB bleibt
   unverändert) und legt beim allerersten Start den Admin-Benutzer an.

4. **Update einspielen:**

   ```bash
   docker compose pull && docker compose up -d
   ```

## Migrationstest mit Produktionskopie (Testserver)

Um eine neue Migration gegen echte Daten zu testen, BEVOR sie auf die
Produktion geht:

```bash
# 1. Auf dem PRODUKTIONS-Server: Dump ziehen
docker compose exec db pg_dump -U mietuser mietverwaltung > mietverwaltung_prod.sql

# 2. Dump auf den Testserver kopieren (scp o.ä.)

# 3. Auf dem TEST-Server: erst nur die Datenbank starten und Dump einspielen
docker compose up -d db
docker compose exec -T db psql -U mietuser -d mietverwaltung < mietverwaltung_prod.sql

# 4. Alles starten — wendet ausstehende Migrationen auf die Kopie an
docker compose up -d
docker compose logs backend | head -30   # "Running database migrations..." ohne Fehler?
```

Zum Zurücksetzen des Testservers: `docker compose down -v` (löscht die Test-DB!).
