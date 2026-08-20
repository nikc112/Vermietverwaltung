import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { z } from 'zod';
import {
  nebenkostenVorschauSchema,
  createNebenkostenAbrechnungSchema,
  sendeAbrechnungSchema,
} from '../schemas/nebenkosten.schema';
import { nachzahlungBeglichenSchema } from '../schemas/mahnung.schema';
import * as svc from '../services/nebenkosten.service';
import { generiereNebenkostenPDF } from '../services/pdf.service';
import { sendeNebenkostenAbrechnung, mapSmtpFehler } from '../services/email.service';
import { toNumber } from '../utils/currency';
import { notFound } from '../utils/errors';
import { makeAuth, ROLLEN } from '../utils/auth';
import { kontaktName, standardEmail } from '../utils/kontakt';

function toSafeAbrechnung<T extends { pdfPfad?: string | null }>(obj: T): Omit<T, 'pdfPfad'> & { hatPdf: boolean } {
  const { pdfPfad, ...rest } = obj;
  return { ...rest, hatPdf: !!pdfPfad } as Omit<T, 'pdfPfad'> & { hatPdf: boolean };
}

const nebenkostenRoutes: FastifyPluginAsync = async (server) => {
  // makeAuth ohne Rollen: dieselbe Wirkung wie zuvor (nur angemeldet sein),
  // aber ueber denselben Weg wie alle anderen Routen -- damit greift auch
  // hier die Pruefung der Kennungen im Pfad.
  const auth = makeAuth(server);

  server.post('/vorschau', auth, async (req, reply) => {
    const body = nebenkostenVorschauSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    const start = body.data.abrechnungStart ? new Date(body.data.abrechnungStart) : undefined;
    const ende = body.data.abrechnungEnde ? new Date(body.data.abrechnungEnde) : undefined;
    return svc.berechneVorschau(server.prisma, body.data.mietvertragID, body.data.abrechnungsjahr, start, ende);
  });

  server.get('/abrechnungen', auth, async (req) => {
    const q = req.query as { mietvertragID?: string };
    const list = await svc.listAbrechnungen(server.prisma, {
      mietvertragID: q.mietvertragID ? parseInt(q.mietvertragID) : undefined,
    });
    return list.map(toSafeAbrechnung);
  });

  server.post('/abrechnungen', auth, async (req, reply) => {
    const body = createNebenkostenAbrechnungSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const start = body.data.abrechnungStart ? new Date(body.data.abrechnungStart) : undefined;
    const ende = body.data.abrechnungEnde ? new Date(body.data.abrechnungEnde) : undefined;
    const abrechnung = await svc.createAbrechnung(
      server.prisma,
      body.data.mietvertragID,
      body.data.abrechnungsjahr,
      body.data.notizen,
      start,
      ende,
    );

    const pdfPfad = await generiereNebenkostenPDF(abrechnung as Parameters<typeof generiereNebenkostenPDF>[0]);
    const updated = await server.prisma.nebenkostenAbrechnung.update({
      where: { id: abrechnung.id },
      data: { pdfPfad },
    });

    return reply.status(201).send(toSafeAbrechnung(updated));
  });

  server.post('/abrechnungen/bulk', auth, async (req, reply) => {
    const bodySchema = z.object({
      abrechnungsjahr: z.number().int().min(1900).max(2100),
      abrechnungStart: z.string().optional(),
      abrechnungEnde: z.string().optional(),
    });
    const body = bodySchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const { abrechnungsjahr, abrechnungStart, abrechnungEnde } = body.data;
    const start = abrechnungStart ? new Date(abrechnungStart) : undefined;
    const ende = abrechnungEnde ? new Date(abrechnungEnde) : undefined;

    const aktiveVertraege = await server.prisma.mietvertrag.findMany({
      where: { status: 'AKTIV' },
      select: {
        id: true,
        mieter: { select: { vorname: true, nachname: true, firma: true } },
        mieteinheit: { select: { bezeichnung: true } },
      },
    });

    const erstellt: { mieterName: string; einheit: string }[] = [];
    const uebersprungen: { mieterName: string; einheit: string }[] = [];
    const fehler: { mieterName: string; einheit: string; fehler: string }[] = [];

    for (const vertrag of aktiveVertraege) {
      const mieterName = kontaktName(vertrag.mieter);
      const einheit = vertrag.mieteinheit.bezeichnung;

      const existing = await server.prisma.nebenkostenAbrechnung.findUnique({
        where: { mietvertragID_abrechnungsjahr: { mietvertragID: vertrag.id, abrechnungsjahr } },
      });

      if (existing) {
        uebersprungen.push({ mieterName, einheit });
        continue;
      }

      try {
        const abrechnung = await svc.createAbrechnung(server.prisma, vertrag.id, abrechnungsjahr, undefined, start, ende);
        const pdfPfad = await generiereNebenkostenPDF(abrechnung as Parameters<typeof generiereNebenkostenPDF>[0]);
        await server.prisma.nebenkostenAbrechnung.update({ where: { id: abrechnung.id }, data: { pdfPfad } });
        erstellt.push({ mieterName, einheit });
      } catch (err: unknown) {
        fehler.push({ mieterName, einheit, fehler: (err as Error).message ?? 'Unbekannter Fehler' });
      }
    }

    return reply.send({ erstellt, uebersprungen, fehler });
  });

  server.get('/abrechnungen/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return toSafeAbrechnung(await svc.getAbrechnung(server.prisma, parseInt(id)));
  });

  server.delete('/abrechnungen/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    await svc.deleteAbrechnung(server.prisma, parseInt(id));
    return { message: 'Abrechnung gelöscht' };
  });

  server.get('/abrechnungen/:id/pdf', makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER), async (req, reply) => {
    const { id } = req.params as { id: string };
    const abrechnung = await svc.getAbrechnung(server.prisma, parseInt(id));

    if (!abrechnung.pdfPfad || !fs.existsSync(abrechnung.pdfPfad)) {
      throw notFound('PDF-Datei');
    }

    const pdfStream = fs.createReadStream(abrechnung.pdfPfad);
    reply.header('Content-Type', 'application/pdf');
    reply.header(
      'Content-Disposition',
      `attachment; filename="Nebenkostenabrechnung_${abrechnung.abrechnungsjahr}.pdf"`,
    );
    return reply.send(pdfStream);
  });

  server.post('/abrechnungen/:id/senden', makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER), async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = sendeAbrechnungSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const abrechnung = await svc.getAbrechnung(server.prisma, parseInt(id));
    if (!abrechnung.pdfPfad || !fs.existsSync(abrechnung.pdfPfad)) {
      return reply.status(400).send({ error: 'PDF muss zuerst generiert werden' });
    }

    const mieter = abrechnung.mietvertrag.mieter;
    const empfaengerEmail =
      (req.user.rolle === 'ADMIN' && body.data.empfaengerEmail)
        ? body.data.empfaengerEmail
        : standardEmail(mieter.kommunikation) ?? undefined;

    if (!empfaengerEmail) {
      return reply.status(400).send({ error: 'Keine E-Mail-Adresse vorhanden' });
    }

    try {
      await sendeNebenkostenAbrechnung({
        empfaengerEmail,
        empfaengerName: kontaktName(mieter),
        abrechnungsjahr: abrechnung.abrechnungsjahr,
        pdfPfad: abrechnung.pdfPfad,
        saldo: toNumber(abrechnung.saldo),
        prisma: server.prisma,
      });
      await svc.markiereVersendet(server.prisma, abrechnung.id);
      return { message: 'Abrechnung erfolgreich versendet' };
    } catch (err: unknown) {
      const smtpErr = err as { code?: string; message?: string };
      await svc.protokolliereVersandFehler(server.prisma, abrechnung.id, smtpErr.message ?? 'Unbekannter Fehler');
      return reply.status(500).send({ error: mapSmtpFehler(smtpErr) });
    }
  });

  server.put('/abrechnungen/:id/nachzahlung-beglichen', makeAuth(server, ...ROLLEN.KOSTENBUCHER), async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = nachzahlungBeglichenSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return toSafeAbrechnung(await svc.setzeNachzahlungBeglichen(server.prisma, parseInt(id), body.data.beglichen));
  });
};

export default nebenkostenRoutes;
