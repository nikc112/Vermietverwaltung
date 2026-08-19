import { FastifyPluginAsync } from 'fastify';
import { createEigentuemerSchema, updateEigentuemerSchema } from '../schemas/eigentuemer.schema';
import * as svc from '../services/eigentuemer.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const eigentuemerRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VOLLZUGRIFF);

  server.get('/', auth, async (req) => {
    const aktiv = (req.query as { aktiv?: string }).aktiv;
    return svc.listEigentuemer(server.prisma, aktiv === 'true' ? true : aktiv === 'false' ? false : undefined);
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createEigentuemerSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createEigentuemer(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getEigentuemer(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateEigentuemerSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateEigentuemer(server.prisma, parseInt(id), body.data);
  });

  server.delete('/:id', schreiben, async (req) => {
    const { id } = req.params as { id: string };
    await svc.deleteEigentuemer(server.prisma, parseInt(id));
    return { message: 'Eigentümer deaktiviert' };
  });
};

export default eigentuemerRoutes;
