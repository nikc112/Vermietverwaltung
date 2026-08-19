import { FastifyPluginAsync } from 'fastify';
import { createKostenSchema, updateKostenSchema } from '../schemas/kosten.schema';
import * as svc from '../services/kosten.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const kostenRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.KOSTENBUCHER);

  server.get('/kategorien', auth, async () => {
    return Object.entries(svc.KATEGORIEN_META).map(([key, val]) => ({
      key,
      ...val,
    }));
  });

  server.get('/', auth, async (req) => {
    const q = req.query as {
      mietobjektID?: string;
      jahr?: string;
      kategorie?: string;
      umlagefaehig?: string;
    };
    return svc.listKosten(server.prisma, {
      mietobjektID: q.mietobjektID ? parseInt(q.mietobjektID) : undefined,
      jahr: q.jahr ? parseInt(q.jahr) : undefined,
      kategorie: q.kategorie,
      umlagefaehig: q.umlagefaehig === 'true' ? true : q.umlagefaehig === 'false' ? false : undefined,
    });
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createKostenSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createKosten(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getKosten(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateKostenSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateKosten(server.prisma, parseInt(id), body.data);
  });

  server.delete('/:id', schreiben, async (req) => {
    const { id } = req.params as { id: string };
    await svc.deleteKosten(server.prisma, parseInt(id));
    return { message: 'Kosten gelöscht' };
  });
};

export default kostenRoutes;
