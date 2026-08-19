import { FastifyPluginAsync } from 'fastify';
import {
  createFristSchema, listFristenQuerySchema, overrideAutoFristSchema, updateFristSchema,
} from '../schemas/frist.schema';
import * as svc from '../services/frist.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const fristRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);

  server.get('/', auth, async (req, reply) => {
    const query = listFristenQuerySchema.safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: query.error.flatten().fieldErrors });
    return svc.listeFristen(server.prisma, query.data.status ?? 'OFFEN');
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createFristSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createFrist(server.prisma, body.data));
  });

  server.put('/auto/:typ/:vertragID', schreiben, async (req, reply) => {
    const { typ, vertragID } = req.params as { typ: string; vertragID: string };
    if (typ !== 'NKA_ABRECHNUNG' && typ !== 'VERTRAGSENDE') {
      return reply.status(400).send({ error: 'Ungültiger Fristtyp' });
    }
    const vertragIDNum = parseInt(vertragID);
    if (Number.isNaN(vertragIDNum)) return reply.status(400).send({ error: 'Ungültige ID' });
    const body = overrideAutoFristSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.overrideAutoFrist(server.prisma, typ, vertragIDNum, body.data);
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idNum = parseInt(id);
    if (Number.isNaN(idNum)) return reply.status(400).send({ error: 'Ungültige ID' });
    const body = updateFristSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateFrist(server.prisma, idNum, body.data);
  });

  server.delete('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idNum = parseInt(id);
    if (Number.isNaN(idNum)) return reply.status(400).send({ error: 'Ungültige ID' });
    return svc.deleteFrist(server.prisma, idNum);
  });
};

export default fristRoutes;
