import { FastifyPluginAsync } from 'fastify';
import * as svc from '../services/forderung.service';
import { makeAuth } from '../utils/auth';

const forderungRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);

  server.get('/', auth, async () => {
    return svc.listeAlleForderungen(server.prisma);
  });

  server.get('/kontakt/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return svc.sammleKontaktForderungen(server.prisma, parseInt(id));
  });
};

export default forderungRoutes;
