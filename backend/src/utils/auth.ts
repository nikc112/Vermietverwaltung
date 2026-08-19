import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const VOLLZUGRIFF_EQUIVALENT = ['ADMIN', 'VOLLZUGRIFF'];

export const ROLLEN = {
  ALLE: [] as string[],
  ADMIN_ONLY: ['ADMIN'],
  VOLLZUGRIFF: VOLLZUGRIFF_EQUIVALENT,
  VERTRAGSVERWALTER: [...VOLLZUGRIFF_EQUIVALENT, 'VERTRAGSVERWALTER'],
  KOSTENBUCHER: [...VOLLZUGRIFF_EQUIVALENT, 'KOSTENBUCHER'],
};

export function makeAuth(server: FastifyInstance, ...roles: string[]) {
  const preHandler: ((req: FastifyRequest, reply: FastifyReply) => Promise<void>)[] = [
    server.authenticate,
  ];
  if (roles.length > 0) {
    preHandler.push(async (req: FastifyRequest, reply: FastifyReply) => {
      if (!roles.includes(req.user.rolle)) {
        return reply.status(403).send({ error: 'Keine Berechtigung für diese Aktion' });
      }
    });
  }
  return { preHandler };
}
