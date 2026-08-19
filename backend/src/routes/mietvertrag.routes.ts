import { FastifyPluginAsync } from 'fastify';
import {
  createMietvertragSchema,
  updateMietvertragSchema,
  kuendigenSchema,
} from '../schemas/mietvertrag.schema';
import * as svc from '../services/mietvertrag.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const mietvertragRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);

  server.get('/', auth, async (req) => {
    const q = req.query as { status?: string; mieteinheitID?: string; mieterID?: string };
    return svc.listMietvertraege(server.prisma, {
      status: q.status,
      mieteinheitID: q.mieteinheitID ? parseInt(q.mieteinheitID) : undefined,
      mieterID: q.mieterID ? parseInt(q.mieterID) : undefined,
    });
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createMietvertragSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createMietvertrag(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getMietvertrag(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMietvertragSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateMietvertrag(server.prisma, parseInt(id), body.data);
  });

  server.post('/:id/kuendigen', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = kuendigenSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.kuendigenMietvertrag(server.prisma, parseInt(id), body.data.kuendigungsdatum);
  });
};

export default mietvertragRoutes;
