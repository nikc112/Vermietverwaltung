FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init openssl
COPY package*.json ./
COPY prisma ./prisma/

FROM base AS development
# Dieselben Erkennungsprogramme wie in der Produktionsstufe. Ohne sie scheitert
# in der Entwicklungsumgebung JEDER Upload an einem fehlenden pdfinfo, und zwar
# mit der wenig hilfreichen Meldung "Abbruch mit Code unbekannt" -- execFile
# meldet ENOENT als Zeichenkette, nicht als Zahl. Bewusst hier statt in base:
# die builder-Stufe braucht sie nicht.
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-deu unzip
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["dumb-init", "npm", "run", "dev"]

FROM base AS builder
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
# poppler-utils liefert pdftotext/pdftoppm/pdfinfo, tesseract-ocr die Texterkennung
# mit deutschem Sprachpaket, unzip das Auslesen von DOCX/XLSX (beides ZIP-Behaelter).
RUN apk add --no-cache dumb-init openssl poppler-utils tesseract-ocr tesseract-ocr-data-deu unzip
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma/
# npm ci statt npm install: baut genau die in package-lock.json festgehaltenen
# Versionen. npm install darf abweichen, womit das gebaute Abbild nicht mehr
# dem entspricht, was geprueft wurde.
RUN npm ci --omit=dev
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# npm und corepack fliegen aus dem Produktionsabbild. Zur Laufzeit wird beides
# nicht gebraucht: der Entrypoint ruft ./node_modules/.bin/prisma und
# "node dist/server.js", der Healthcheck "node -e".
#
# Der Anlass war ein Trivy-Befund. npm bringt seine eigenen Abhaengigkeiten
# mit -- sigstore, minimatch, glob, brace-expansion und weitere --, und zehn
# davon hatten offene HIGH-Meldungen. In der package.json dieses Projekts steht
# keines davon, "npm audit" konnte sie also nie sehen. Sie lagen einfach im
# Grundabbild.
#
# Ein Paketmanager in einem Produktionscontainer ist ohnehin schwer zu
# rechtfertigen: er kann Code aus dem Netz nachladen und ausfuehren. Genau das
# soll dort nichts koennen.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

# Ab hier laeuft nichts mehr als root. Die Speicherverzeichnisse werden hier
# angelegt und uebereignet, damit Docker sie beim ersten Anlegen eines Volumes
# mit dieser Eigentuemerschaft uebernimmt -- sonst gehoerte das frische Volume
# root und der Dienst koennte nicht hineinschreiben.
# Der Benutzer "node" ist im Node-Abbild bereits vorhanden und hat die Kennung
# 1000, dieselbe, die INSTALL.md fuer das Dokumentenverzeichnis auf dem Host
# vorgibt.
# /app/tmp muss hier entstehen: liegt der Einhaengepunkt nicht im Abbild,
# legt Docker ihn beim ersten Start als root an -- und die Texterkennung
# koennte ihre Seitenrenderings nicht ablegen.
RUN mkdir -p /app/storage/pdfs /app/storage/dokumente /app/tmp && chown -R node:node /app
USER node

EXPOSE 3000
ENTRYPOINT ["dumb-init", "docker-entrypoint.sh"]
