import { FastifyPluginAsync } from 'fastify';
import { createMietobjektSchema, updateMietobjektSchema } from '../schemas/mietobjekt.schema';
import * as svc from '../services/mietobjekt.service';
import * as kostenSvc from '../services/kosten.service';
import { listMieteinheiten } from '../services/mieteinheit.service';
import { makeAuth, ROLLEN } from '../utils/auth';

const mietobjektRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);

  server.get('/', auth, async (req) => {
    const q = req.query as { eigentuemerID?: string; typ?: string; aktiv?: string };
    return svc.listMietobjekte(server.prisma, {
      eigentuemerID: q.eigentuemerID ? parseInt(q.eigentuemerID) : undefined,
      typ: q.typ,
      aktiv: q.aktiv === 'true' ? true : q.aktiv === 'false' ? false : undefined,
    });
  });

  server.post('/', schreiben, async (req, reply) => {
    const body = createMietobjektSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return reply.status(201).send(await svc.createMietobjekt(server.prisma, body.data));
  });

  server.get('/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.getMietobjekt(server.prisma, parseInt(id));
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMietobjektSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateMietobjekt(server.prisma, parseInt(id), body.data);
  });

  server.delete('/:id', schreiben, async (req) => {
    const { id } = req.params as { id: string };
    await svc.deleteMietobjekt(server.prisma, parseInt(id));
    return { message: 'Mietobjekt deaktiviert' };
  });

  server.get('/:id/einheiten', auth, async (req) => {
    const { id } = req.params as { id: string };
    return listMieteinheiten(server.prisma, { mietobjektID: parseInt(id) });
  });

  server.get('/:id/kosten', auth, async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { jahr?: string; kategorie?: string; umlagefaehig?: string };
    return kostenSvc.listKosten(server.prisma, {
      mietobjektID: parseInt(id),
      jahr: q.jahr ? parseInt(q.jahr) : undefined,
      kategorie: q.kategorie,
      umlagefaehig: q.umlagefaehig === 'true' ? true : q.umlagefaehig === 'false' ? false : undefined,
    });
  });

  server.get('/:id/kosten/zusammenfassung', auth, async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { jahr?: string };
    const jahr = q.jahr ? parseInt(q.jahr) : new Date().getFullYear();
    return svc.getKostenZusammenfassung(server.prisma, parseInt(id), jahr);
  });
};

export default mietobjektRoutes;
