# Sicherheit

Dieses Dokument haelt fest, was die Anwendung an Schutzmassnahmen mitbringt,
welche Annahmen sie ueber ihre Umgebung trifft und welche Risiken bewusst
bestehen bleiben. Es ist die Antwort auf die Pruefung mit Gitleaks, Semgrep,
Trivy und OWASP ZAP.

## Stand der Abhaengigkeiten

| Bereich | `npm audit --omit=dev` | einschliesslich Entwicklungspaketen |
|---|---|---|
| Backend  | 0 Funde | 0 Funde |
| Frontend | 0 Funde | 0 Funde |

Die CI bricht ab, sobald `npm audit --omit=dev --audit-level=high` in einem der
beiden Teile anschlaegt. Es entsteht dann kein Abbild.

## Wovon die Anwendung ausgeht

Die Anwendung spricht **nur HTTP** und gehoert nicht ungeschuetzt ins Netz. Sie
setzt einen vorgelagerten Reverse Proxy mit TLS voraus. Zwei Dinge muss dieser
Proxy leisten, und beide liegen ausserhalb dessen, was die Anwendung selbst
erzwingen kann:

1. **`X-Forwarded-For` ueberschreiben, nicht anhaengen.** Also
   `proxy_set_header X-Forwarded-For $remote_addr;` und ausdruecklich *nicht*
   `$proxy_add_x_forwarded_for`. Siehe den Restbefund weiter unten.
2. **HSTS setzen.** Der Container tut das nur, wenn die Anfrage nachweislich
   ueber HTTPS hereinkam -- ein HSTS-Versprechen ueber Klartext waere falsch
   und sperrte die Domain fuer Monate aus.

Ein vollstaendiges Beispiel steht in `nginx/reverse-proxy-beispiel.conf`.

## Anmeldung und Sitzungen

- Signatur **HS256, fest verdrahtet** -- beim Signieren wie beim Pruefen. Der
  Algorithmus wird nicht aus dem Token uebernommen. Ohne diese Festlegung
  akzeptierte der Server ein mit HS512 signiertes Token; ein Test belegt das.
- `JWT_SECRET` wird beim Start auf Laenge (min. 32), Zeichenvielfalt (min. 16
  verschiedene) und Platzhalter geprueft. Der Container startet sonst nicht.
- `verify.maxAge` begrenzt die Gueltigkeit zusaetzlich zum `exp`-Feld
  serverseitig.
- **Die Rolle kommt bei jeder Anfrage frisch aus der Datenbank** und
  ueberschreibt die im Token. Ein Benutzer kann sich in seinem eigenen,
  korrekt signierten Token also keine hoehere Rolle eintragen. Entzogene
  Rechte wirken ausserdem sofort statt erst nach Ablauf des Tokens.
- Deaktivierte Konten werden trotz gueltigem Token abgewiesen.
- Fuenf Fehlversuche sperren das **Konto** fuer 15 Minuten -- unabhaengig
  davon, von welcher Adresse sie kommen.

## Dateien

- Groesse serverseitig auf 25 MB begrenzt.
- Der vom Browser gemeldete Typ wird nicht geglaubt: die ersten Bytes muessen
  zur Signatur des Typs passen.
- Der hochgeladene Dateiname wird **nie** zum Speicherpfad. Der Speichername
  entsteht aus Jahr, Monat und einer UUID; die Endung folgt dem geprueften Typ,
  nicht dem Namen. `rechnung.pdf.php` landet als `2026/08/<uuid>.pdf`.
- `absoluterPfad` prueft zusaetzlich, dass der Zielpfad das Ablageverzeichnis
  nicht verlaesst.
- Die Dateien liegen ausserhalb des Webroots, in einem eigenen Verzeichnis auf
  dem Host.
- Downloads gehen mit `Content-Disposition: attachment` und
  `X-Content-Type-Options: nosniff` heraus.
- Sensible Kategorien (Ausweis, SCHUFA, Selbstauskunft, Schriftwechsel) sind
  nur fuer dazu berechtigte Rollen sichtbar -- auch ueber die Volltextsuche.
  Fuer eine nicht berechtigte Rolle antwortet der Server mit **404 und nicht
  403**, sonst liesse sich durch Hochzaehlen der ID herausfinden, an welcher
  Stelle ein sensibles Dokument liegt.

## Container

| | Backend | Frontend | Datenbank |
|---|---|---|---|
| Benutzer | `node` (1000) | 101 | `postgres` |
| Wurzeldateisystem | schreibgeschuetzt | schreibgeschuetzt | beschreibbar |
| Faehigkeiten | alle entzogen | alle entzogen | 5 verbliebene |
| `no-new-privileges` | ja | ja | ja |
| Port nach aussen | keiner | `APP_PORT` | keiner |

Der Datenbank bleiben `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID` und `SETUID`:
ihr Einstiegsskript legt beim ersten Start das Datenverzeichnis an und wechselt
danach selbst auf den Benutzer `postgres`. Ohne diese fuenf startet sie nicht.

Die Datenbank veroeffentlicht **keinen** Host-Port. Auch das Backend nicht --
es ist nur ueber das Frontend erreichbar.

Dass all das am laufenden Container tatsaechlich zutrifft, prueft der Job
`rauchtest` in `.github/workflows/docker-publish.yml` bei jedem Push. Er startet
den echten Stapel und stellt fest, unter welcher Kennung die Prozesse laufen, ob
`/` beschreibbar ist und ob die Sicherheitsheader gesetzt sind. Ein Dockerfile
zu lesen genuegt dafuer nicht.

## Bewusst bestehende Risiken

### 1. Die adressgebundene Ratenbegrenzung ist umgehbar, sobald ein Proxy davorsteht

**Was:** Die Anwendung muss dem vorgelagerten Proxy sein `X-Forwarded-For`
glauben -- sonst saehe sie alle Nutzer als einen einzigen Absender und drosselte
sie gemeinsam. Sie kann dabei aber nicht unterscheiden, ob der Header vom Proxy
stammt oder vom Client, der ihn mitgeschickt hat. Wer bei jedem Versuch eine
andere Adresse hineinschreibt, bekommt jedes Mal einen frischen Zaehler.

**Warum nicht behebbar:** Das liegt in der Bauweise. Der innere Proxy kann die
Herkunft des Headers nicht pruefen; die Sicherheitsgrenze ist zwangslaeufig der
**aeusserste** Proxy, und der gehoert dem Betreiber, nicht dieser Anwendung.

**Welcher Codepfad:** `src/server.ts` (`trustProxy`), `@fastify/rate-limit`.

**Schutzmassnahme:** Die Bremse gegen Passwortraten haengt deshalb **am Konto**,
nicht an der Adresse (`src/utils/anmeldesperre.ts`). Fuenf Fehlversuche sperren
das Konto 15 Minuten, gleichgueltig woher sie kommen. Der Rauchtest in der CI
belegt das mit acht Versuchen von acht vorgetaeuschten Adressen.
`src/__tests__/ratenbegrenzung.test.ts` haelt die Grenze als solche fest, statt
sie gruen zu faerben.

**Was der Betreiber tun muss:** Am aeussersten Proxy
`proxy_set_header X-Forwarded-For $remote_addr;` setzen. Steht das dort, ist die
Adressbindung wieder verlaesslich. INSTALL.md, Schritt 5.

### 2. `style-src 'unsafe-inline'` in der Content-Security-Policy

**Was:** Die CSP erlaubt Inline-Styles.

**Warum:** Die Oberflaechenbausteine (Radix UI, Recharts) setzen Positionen und
Groessen als `style`-Attribut. Ohne die Freigabe bricht die Darstellung von
Dialogen, Auswahlfeldern und Diagrammen.

**Warum vertretbar:** `script-src` bleibt ohne `'unsafe-inline'` **und** ohne
`'unsafe-eval'` -- das gebaute `index.html` laedt ausschliesslich externe
Module. Die gefaehrliche der beiden Freigaben ist damit geschlossen. Ein
Inline-Style kann keinen Code ausfuehren.

**Wann behoben:** Erst mit einem Austausch der Bibliotheken; nicht geplant.

### 3. Die Anmeldesperre gilt je Prozess

**Was:** `Anmeldesperre` haelt ihre Zaehlung im Arbeitsspeicher. Bei mehreren
Backend-Instanzen zaehlte jede fuer sich.

**Warum vertretbar:** Der Stapel betreibt genau einen Backend-Container. Die
Zahl beobachteter Konten ist auf 10.000 gedeckelt, damit aus der Bremse kein
Hebel gegen den Arbeitsspeicher wird.

**Wann behoben:** Sobald mehr als eine Instanz betrieben wird. Dann gehoert die
Zaehlung in die Datenbank oder einen gemeinsamen Zwischenspeicher.

### 4. Das Backend braucht beschreibbaren Zwischenspeicher

**Was:** Trotz `read_only: true` sind `/tmp` (tmpfs, 64 MB) und `/app/tmp`
(Volume) beschreibbar.

**Warum:** Die Texterkennung rendert Seiten als Bilder, bevor sie sie durch
Tesseract schickt -- mehrere Megabyte je Seite. Laege das im tmpfs, waere es
Arbeitsspeicher, und ein langes Fax fuellte ihn. Deshalb zeigt `TMPDIR` auf ein
Volume auf der Platte.

**Schutzmassnahme:** Beide Orte liegen unterhalb von `/app` bzw. `/tmp` und sind
nicht ausfuehrbar relevant; der Rest des Dateisystems bleibt schreibgeschuetzt.
Liegengebliebene Ordner raeumt die Anwendung beim Start selbst weg.

## Geheimnisse

Im Repository liegen keine. `.env` steht in `.gitignore`, `.env.example`
enthaelt ausschliesslich Platzhalter. Die Werte in der CI (`rauchtest`) sind fuer
den Lauf erfunden und werden mit dem Stapel verworfen.

`POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_EMAIL` und `ADMIN_PASSWORD` haben
**keine** Vorgabewerte: fehlt einer, startet der Stapel nicht. Ein
Vorgabepasswort in einem oeffentlichen Repository waere fuer jede Installation
dasselbe -- und damit fuer jeden bekannt, der es vergisst.

## Selbst nachpruefen

```bash
gitleaks git . --redact
semgrep scan --config auto .
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL .

cd backend  && npm ci && npm audit --omit=dev && npm run lint && npm test && npm run build
cd frontend && npm ci && npm audit --omit=dev && npm run lint && npm run build
```

Die Haertung am laufenden Container laesst sich so nachstellen:

```bash
docker compose up -d --build --wait
docker compose exec backend id -u          # muss ungleich 0 sein
docker compose exec frontend id -u         # muss ungleich 0 sein
docker compose exec backend touch /probe   # muss scheitern
curl -sI http://localhost:8080/ | grep -i 'content-security-policy'
```

## Eine Luecke melden

Bitte nicht als oeffentliches Issue, sondern ueber die Sicherheitsmeldung von
GitHub (Reiter *Security* -> *Report a vulnerability*).
