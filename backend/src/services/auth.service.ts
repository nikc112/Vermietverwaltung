import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AppError } from '../utils/errors';

export async function login(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const benutzer = await prisma.benutzer.findUnique({ where: { email } });
  if (!benutzer || !benutzer.aktiv) {
    throw new AppError(401, 'Ungültige Anmeldedaten');
  }

  const valid = await bcrypt.compare(password, benutzer.passwordHash);
  if (!valid) {
    throw new AppError(401, 'Ungültige Anmeldedaten');
  }

  return {
    id: benutzer.id,
    email: benutzer.email,
    name: benutzer.name,
    rolle: benutzer.rolle,
  };
}

export async function getMe(prisma: PrismaClient, id: number) {
  const benutzer = await prisma.benutzer.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, rolle: true, erstelltAm: true },
  });
  if (!benutzer) throw new AppError(404, 'Benutzer nicht gefunden');
  return benutzer;
}

export async function changePassword(
  prisma: PrismaClient,
  id: number,
  altesPasswort: string,
  neuesPasswort: string,
) {
  const benutzer = await prisma.benutzer.findUnique({ where: { id } });
  if (!benutzer) throw new AppError(404, 'Benutzer nicht gefunden');

  const valid = await bcrypt.compare(altesPasswort, benutzer.passwordHash);
  if (!valid) throw new AppError(400, 'Altes Passwort ist falsch');

  const passwordHash = await bcrypt.hash(neuesPasswort, 10);
  await prisma.benutzer.update({ where: { id }, data: { passwordHash } });
}
