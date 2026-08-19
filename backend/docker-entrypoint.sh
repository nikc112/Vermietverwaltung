#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding initial admin user..."
if [ -z "$ADMIN_PASSWORD" ] || [ -z "$ADMIN_EMAIL" ]; then
  echo "FEHLER: ADMIN_EMAIL und ADMIN_PASSWORD müssen gesetzt sein." >&2
  exit 1
fi
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const existing = await prisma.benutzer.findFirst({ where: { rolle: 'ADMIN' } });
  if (!existing) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await prisma.benutzer.create({
      data: {
        email: process.env.ADMIN_EMAIL,
        passwordHash: hash,
        name: 'Administrator',
        rolle: 'ADMIN',
      }
    });
    console.log('Admin-Benutzer erstellt.');
  } else {
    console.log('Admin-Benutzer existiert bereits.');
  }
}
main().catch(console.error).finally(() => prisma.\$disconnect());
" || echo "Seed-Schritt übersprungen."

echo "Starting server..."
exec node dist/server.js
