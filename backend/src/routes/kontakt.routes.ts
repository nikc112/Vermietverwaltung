import { FastifyPluginAsync } from 'fastify';
import { KontaktRollenTyp } from '@prisma/client';
import { createKontaktSchema, updateKontaktSchema, kontaktRolleEnum } from '../schemas/kontakt.schema';
import * as svc from '../services/kontakt.service';
import { generiereDsgvoAuskunftPDF } from '../services/pdf.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const kontaktRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);
  const loeschen = makeAuth(server, ...ROLLEN.VOLLZUGRIFF);

  server.get('/', auth, async (req) => {
    const q = req.query as { suche?: string; rolle?: string; inaktive?: string };
    const rolle = kontaktRolleEnum.safeParse(q.rolle);
    return svc.listKontakte(server.prisma, {
      suche: q.suche,
      rolle: rolle.success ? (rolle.data as KontaktRollenTyp) : undefined,
      inaktive: q.inaktive === 'true',
    });
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getKontakt(server.prisma, parseInt(id));
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createKontaktSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createKontakt(server.prisma, body.data));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateKontaktSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateKontakt(server.prisma, parseInt(id), body.data);
  });

  server.get('/:id/loeschpruefung', loeschen, async (req) => {
    const { id } = req.params as { id: string };
    return svc.loeschpruefung(server.prisma, parseInt(id));
  });

  server.delete('/:id', loeschen, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ergebnis = await svc.deleteKontakt(server.prisma, parseInt(id));
    if (ergebnis.fall === 'GESPERRT') return reply.status(409).send(ergebnis);
    return ergebnis;
  });

  server.get('/:id/dsgvo-export', auth, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { format?: string };
    const daten = await svc.sammleDsgvoDaten(server.prisma, parseInt(id));
    if (q.format === 'json') return daten;
    const pdf = await generiereDsgvoAuskunftPDF(daten);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="dsgvo_auskunft_kontakt_${id}.pdf"`)
      .send(pdf);
  });
};

export default kontaktRoutes;
