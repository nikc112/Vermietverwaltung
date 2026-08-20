import { FastifyPluginAsync } from 'fastify';
import { loginSchema, changePasswordSchema } from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { Anmeldesperre } from '../utils/anmeldesperre';

const authRoutes: FastifyPluginAsync = async (server) => {
  // Deutlich strenger als die Grundgrenze: hier wird geraten, nicht gearbeitet.
  // Zehn Versuche in fuenf Minuten reichen fuer Vertipper, bremsen aber das
  // Durchprobieren von Passwoertern wirksam aus.
  const anmeldeGrenze = { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } };

  // Zaehlt je Konto, nicht je Adresse. Die Grenze oben haengt am Absender und
  // laesst sich damit ueber X-Forwarded-For umgehen, sobald ein Proxy davor
  // steht -- diese hier nicht. Siehe utils/anmeldesperre.ts.
  const sperre = new Anmeldesperre();

  server.post('/login', anmeldeGrenze, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    }

    const restsperre = sperre.pruefe(body.data.email);
    if (restsperre !== null) {
      const minuten = Math.ceil(restsperre / 60000);
      reply.header('Retry-After', String(Math.ceil(restsperre / 1000)));
      return reply.status(429).send({
        error: `Zu viele fehlgeschlagene Anmeldungen. Bitte in ${minuten} Minuten erneut versuchen.`,
      });
    }

    let benutzer;
    try {
      benutzer = await authService.login(server.prisma, body.data.email, body.data.password);
    } catch (fehler) {
      // Der Fehlversuch wird vermerkt, die Antwort bleibt unveraendert: sie darf
      // nicht verraten, ob die Adresse ueberhaupt bekannt ist.
      sperre.vermerkeFehlschlag(body.data.email);
      throw fehler;
    }
    sperre.vermerkeErfolg(body.data.email);

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
