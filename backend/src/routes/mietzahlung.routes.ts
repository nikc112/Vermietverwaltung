import { FastifyPluginAsync } from 'fastify';
import {
  createMietzahlungSchema,
  updateMietzahlungSchema,
  bulkAnlegenSchema,
} from '../schemas/mietzahlung.schema';
import * as svc from '../services/mietzahlung.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const mietzahlungRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);

  server.get('/ausstehend', auth, async () => {
    return svc.getAusstehende(server.prisma);
  });

  server.get('/', auth, async (req) => {
    const q = req.query as { mietvertragID?: string; jahr?: string; eingegangen?: string };
    return svc.listMietzahlungen(server.prisma, {
      mietvertragID: q.mietvertragID ? parseInt(q.mietvertragID) : undefined,
      jahr: q.jahr ? parseInt(q.jahr) : undefined,
      eingegangen: q.eingegangen === 'true' ? true : q.eingegangen === 'false' ? false : undefined,
    });
  });

  server.post('/bulk-anlegen', schreiben, async (req, reply) => {
    const body = bulkAnlegenSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.bulkAnlegen(server.prisma, body.data.mietvertragID, body.data.jahr);
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createMietzahlungSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createMietzahlung(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getMietzahlung(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMietzahlungSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateMietzahlung(server.prisma, parseInt(id), body.data);
  });
};

export default mietzahlungRoutes;
