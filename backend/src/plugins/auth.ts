import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import { config } from '../config';
import { erzeugeJwtOptionen } from '../utils/jwt';

const authPlugin: FastifyPluginAsync = fp(async (server) => {
  server.register(fjwt, erzeugeJwtOptionen(config.JWT_SECRET, config.JWT_EXPIRES_IN));

  server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      // Die Rolle wird bei JEDER Anfrage frisch aus der Datenbank geholt und
      // ueberschreibt die aus dem Token. Zwei Gruende: ein selbst gebasteltes
      // Token kann sich damit keine Rolle verschaffen, und ein Entzug von
      // Rechten wirkt sofort statt erst nach Ablauf des Tokens.
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
