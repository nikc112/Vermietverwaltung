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
RUN npm install
COPY . .
EXPOSE 3000
CMD ["dumb-init", "npm", "run", "dev"]

FROM base AS builder
RUN npm install
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
RUN npm install --omit=dev
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["dumb-init", "docker-entrypoint.sh"]
