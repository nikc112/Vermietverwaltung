import { FastifyPluginAsync } from 'fastify';
import { createMieterSchema, updateMieterSchema } from '../schemas/mieter.schema';
import * as svc from '../services/mieter.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const mieterRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);

  server.get('/', auth, async (req) => {
    const q = req.query as { search?: string };
    return svc.listMieter(server.prisma, q.search);
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createMieterSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createMieter(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getMieter(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMieterSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateMieter(server.prisma, parseInt(id), body.data);
  });
};

export default mieterRoutes;
