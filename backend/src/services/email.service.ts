import nodemailer from 'nodemailer';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { MahnStufeTyp } from '../utils/mahnstufen';

async function getSmtpConfig(prisma?: PrismaClient) {
  const dbWerte: Record<string, string> = {};
  if (prisma) {
    const einstellungen = await prisma.einstellung.findMany({
      where: { schluessel: { in: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'] } },
    });
    for (const e of einstellungen) dbWerte[e.schluessel] = e.wert;
  }
  return {
    host: dbWerte['smtp_host'] || config.SMTP_HOST,
    port: parseInt(dbWerte['smtp_port'] || '') || config.SMTP_PORT,
    secure: dbWerte['smtp_secure'] !== undefined ? dbWerte['smtp_secure'] === 'true' : config.SMTP_SECURE,
    user: dbWerte['smtp_user'] || config.SMTP_USER,
    pass: dbWerte['smtp_pass'] || config.SMTP_PASS,
    from: dbWerte['smtp_from'] || config.SMTP_FROM,
  };
}

async function createTransport(prisma?: PrismaClient) {
  const smtp = await getSmtpConfig(prisma);
  if (!smtp.host) {
    throw new AppError(500, 'SMTP ist nicht konfiguriert');
  }
  return { transport: nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  }), from: smtp.from };
}

export function mapSmtpFehler(err: { code?: string }): string {
  switch (err.code) {
    case 'EAUTH':       return 'SMTP-Authentifizierung fehlgeschlagen. Bitte App-Passwort in den Einstellungen prüfen.';
    case 'ECONNECTION': return 'Verbindung zum SMTP-Server fehlgeschlagen. Host und Port prüfen.';
    case 'ETIMEDOUT':   return 'Zeitüberschreitung beim Verbinden mit dem SMTP-Server.';
    case 'EENVELOPE':   return 'Ungültige Empfänger-Adresse.';
    case 'EMESSAGE':    return 'Fehler beim Aufbau der E-Mail.';
    default:            return 'E-Mail konnte nicht versendet werden.';
  }
}

export async function sendeNebenkostenAbrechnung(params: {
  empfaengerEmail: string;
  empfaengerName: string;
  abrechnungsjahr: number;
  pdfPfad: string;
  saldo: number;
  prisma?: PrismaClient;
}) {
  const { transport, from } = await createTransport(params.prisma);
  const saldoText =
    params.saldo > 0
      ? `Nachzahlung: ${params.saldo.toFixed(2)} €`
      : params.saldo < 0
        ? `Guthaben: ${Math.abs(params.saldo).toFixed(2)} €`
        : 'kein Saldo';

  const pdfBuffer = fs.readFileSync(params.pdfPfad);

  await transport.sendMail({
    from,
    to: params.empfaengerEmail,
    subject: `Nebenkostenabrechnung ${params.abrechnungsjahr}`,
    text: `Sehr geehrte/r ${params.empfaengerName},

anbei erhalten Sie Ihre Nebenkostenabrechnung für das Jahr ${params.abrechnungsjahr}.

Ergebnis: ${saldoText}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Ihre Hausverwaltung`,
    html: `<p>Sehr geehrte/r <strong>${params.empfaengerName}</strong>,</p>
<p>anbei erhalten Sie Ihre Nebenkostenabrechnung für das Jahr <strong>${params.abrechnungsjahr}</strong>.</p>
<p><strong>Ergebnis: ${saldoText}</strong></p>
<p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
<p>Mit freundlichen Grüßen<br>Ihre Hausverwaltung</p>`,
    attachments: [
      {
        filename: `Nebenkostenabrechnung_${params.abrechnungsjahr}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

const MAHN_BETREFF: Record<MahnStufeTyp, string> = {
  ZAHLUNGSERINNERUNG: 'Zahlungserinnerung',
  MAHNUNG_1: '1. Mahnung',
  MAHNUNG_2: '2. Mahnung (letzte Mahnung)',
};

export async function sendeMahnung(params: {
  empfaengerEmail: string;
  empfaengerName: string;
  stufe: MahnStufeTyp;
  gesamtbetrag: number;
  zahlungsfrist: Date;
  pdfPfad: string;
  prisma?: PrismaClient;
}) {
  const { transport, from } = await createTransport(params.prisma);
  const betreff = MAHN_BETREFF[params.stufe];
  const frist = params.zahlungsfrist.toLocaleDateString('de-DE');
  const pdfBuffer = fs.readFileSync(params.pdfPfad);

  await transport.sendMail({
    from,
    to: params.empfaengerEmail,
    subject: `${betreff} – offener Betrag ${params.gesamtbetrag.toFixed(2)} €`,
    text: `Sehr geehrte/r ${params.empfaengerName},

anbei erhalten Sie eine ${betreff} über einen offenen Gesamtbetrag von ${params.gesamtbetrag.toFixed(2)} €.
Bitte überweisen Sie den Betrag bis zum ${frist}.

Details entnehmen Sie dem beigefügten Schreiben.

Mit freundlichen Grüßen
Ihre Hausverwaltung`,
    html: `<p>Sehr geehrte/r <strong>${params.empfaengerName}</strong>,</p>
<p>anbei erhalten Sie eine <strong>${betreff}</strong> über einen offenen Gesamtbetrag von <strong>${params.gesamtbetrag.toFixed(2)} €</strong>.</p>
<p>Bitte überweisen Sie den Betrag bis zum <strong>${frist}</strong>.</p>
<p>Details entnehmen Sie dem beigefügten Schreiben.</p>
<p>Mit freundlichen Grüßen<br>Ihre Hausverwaltung</p>`,
    attachments: [{ filename: `${betreff.replace(/[^\wäöüÄÖÜß. -]/g, '')}.pdf`, content: pdfBuffer }],
  });
}
