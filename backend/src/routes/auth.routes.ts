import { FastifyPluginAsync } from 'fastify';
import { loginSchema, changePasswordSchema } from '../schemas/auth.schema';
import * as authService from '../services/auth.service';

const authRoutes: FastifyPluginAsync = async (server) => {
  // Deutlich strenger als die Grundgrenze: hier wird geraten, nicht gearbeitet.
  // Zehn Versuche in fuenf Minuten reichen fuer Vertipper, bremsen aber das
  // Durchprobieren von Passwoertern wirksam aus.
  const anmeldeGrenze = { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } };

  server.post('/login', anmeldeGrenze, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }

    const benutzer = await authService.login(
      server.prisma,
      body.data.email,
      body.data.password,
    );

    const token = server.jwt.sign({
      id: benutzer.id,
      email: benutzer.email,
      rolle: benutzer.rolle,
    });

    return {
      token,
      benutzer: { id: benutzer.id, email: benutzer.email, name: benutzer.name, rolle: benutzer.rolle },
    };
  });

  server.get('/me', { preHandler: [server.authenticate] }, async (request) => {
    return authService.getMe(server.prisma, request.user.id);
  });

  server.put('/passwort', { preHandler: [server.authenticate] }, async (request, reply) => {
    const body = changePasswordSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }
    await authService.changePassword(
      server.prisma,
      request.user.id,
      body.data.altesPasswort,
      body.data.neuesPasswort,
    );
    return { message: 'Passwort erfolgreich geändert' };
  });
};

export default authRoutes;
