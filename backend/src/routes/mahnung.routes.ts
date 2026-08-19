import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import { createMahnungSchema, gebuehrBeglichenSchema } from '../schemas/mahnung.schema';
import * as svc from '../services/mahnung.service';
import { sammleKontaktForderungen } from '../services/forderung.service';
import { sendeMahnung, mapSmtpFehler } from '../services/email.service';
import { standardEmail, kontaktName } from '../utils/kontakt';
import { toNumber } from '../utils/currency';
import { makeAuth, ROLLEN } from '../utils/auth';
import { notFound } from '../utils/errors';

const mahnungRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);
  const loeschen = makeAuth(server, ...ROLLEN.VOLLZUGRIFF);

  server.get('/', auth, async (req) => {
    const q = req.query as { kontaktID?: string };
    return svc.listMahnungen(server.prisma, q.kontaktID ? parseInt(q.kontaktID) : undefined);
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createMahnungSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const forderungen = await sammleKontaktForderungen(server.prisma, body.data.kontaktID);
    if (!forderungen.vorschlag.mahnreif) {
      return reply.status(409).send(forderungen.vorschlag);
    }
    return reply.status(201).send(await svc.erzeugeMahnung(server.prisma, body.data.kontaktID));
  });

  server.get('/:id/pdf', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const mahnung = await svc.getMahnungIntern(server.prisma, parseInt(id));
    if (!mahnung.pdfPfad || !fs.existsSync(mahnung.pdfPfad)) throw notFound('PDF-Datei');
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="Mahnung_${mahnung.id}.pdf"`);
    return reply.send(fs.createReadStream(mahnung.pdfPfad));
  });

  server.post('/:id/versenden', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const mahnung = await svc.getMahnungIntern(server.prisma, parseInt(id));
    if (!mahnung.pdfPfad || !fs.existsSync(mahnung.pdfPfad)) {
      return reply.status(400).send({ error: 'PDF nicht vorhanden' });
    }
    const email = standardEmail(mahnung.kontakt.kommunikation);
    if (!email) return reply.status(400).send({ error: 'Keine E-Mail-Adresse vorhanden' });

    try {
      await sendeMahnung({
        empfaengerEmail: email,
        empfaengerName: kontaktName(mahnung.kontakt),
        stufe: mahnung.stufe,
        gesamtbetrag: toNumber(mahnung.gesamtbetrag),
        zahlungsfrist: mahnung.zahlungsfrist,
        pdfPfad: mahnung.pdfPfad,
        prisma: server.prisma,
      });
      await svc.markiereVersendet(server.prisma, mahnung.id);
      return { message: 'Mahnung erfolgreich versendet' };
    } catch (err: unknown) {
      const smtpErr = err as { code?: string; message?: string };
      await svc.protokolliereVersandFehler(server.prisma, mahnung.id, smtpErr.message ?? 'Unbekannter Fehler');
      return reply.status(500).send({ error: mapSmtpFehler(smtpErr) });
    }
  });

  server.put('/:id/gebuehr-beglichen', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = gebuehrBeglichenSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.setzeGebuehrBeglichen(server.prisma, parseInt(id), body.data.beglichen);
  });

  server.delete('/:id', loeschen, async (req) => {
    const { id } = req.params as { id: string };
    return svc.deleteMahnung(server.prisma, parseInt(id));
  });
};

export default mahnungRoutes;
