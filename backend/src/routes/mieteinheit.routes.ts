import { FastifyPluginAsync } from 'fastify';
import { createMieteinheitSchema, updateMieteinheitSchema } from '../schemas/mieteinheit.schema';
import * as svc from '../services/mieteinheit.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const mieteinheitRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);

  server.get('/', auth, async (req) => {
    const q = req.query as { mietobjektID?: string; aktiv?: string };
    return svc.listMieteinheiten(server.prisma, {
      mietobjektID: q.mietobjektID ? parseInt(q.mietobjektID) : undefined,
      aktiv: q.aktiv === 'true' ? true : q.aktiv === 'false' ? false : undefined,
    });
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createMieteinheitSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createMieteinheit(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getMieteinheit(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMieteinheitSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateMieteinheit(server.prisma, parseInt(id), body.data);
  });

  server.delete('/:id', schreiben, async (req) => {
    const { id } = req.params as { id: string };
    await svc.deleteMieteinheit(server.prisma, parseInt(id));
    return { message: 'Mieteinheit deaktiviert' };
  });
};

export default mieteinheitRoutes;
