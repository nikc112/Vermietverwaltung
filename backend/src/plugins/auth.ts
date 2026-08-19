import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import { config } from '../config';

const authPlugin: FastifyPluginAsync = fp(async (server) => {
  server.register(fjwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const benutzer = await server.prisma.benutzer.findUnique({
        where: { id: request.user.id },
        select: { aktiv: true, rolle: true },
      });
      if (!benutzer || !benutzer.aktiv) {
        return reply.status(401).send({ error: 'Nicht authentifiziert' });
      }
      request.user.rolle = benutzer.rolle;
    } catch {
      reply.status(401).send({ error: 'Nicht authentifiziert' });
    }
  });
});

export default authPlugin;
