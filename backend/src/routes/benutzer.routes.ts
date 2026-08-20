import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { createBenutzerSchema, updateBenutzerSchema, resetPasswortSchema } from '../schemas/benutzer.schema';
import { makeAuth, ROLLEN } from '../utils/auth';
import { conflict, notFound } from '../utils/errors';

const benutzerRoutes: FastifyPluginAsync = async (server) => {
  const adminOnly = makeAuth(server, ...ROLLEN.ADMIN_ONLY);
  // Eigene Grenze fuer die Vergabe von Passwoertern. Die Route ist zwar
  // Administratoren vorbehalten, aber genau deshalb lohnend: wer ein
  // Verwaltungskonto uebernommen hat, koennte damit im Sekundentakt fremde
  // Passwoerter neu setzen. Zwanzig in fuenf Minuten reichen fuer jede
  // Verwaltungsarbeit von Hand.
  const passwortGrenze = { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } };

  server.get('/', adminOnly, async () => {
    return server.prisma.benutzer.findMany({
      select: { id: true, email: true, name: true, rolle: true, aktiv: true, erstelltAm: true },
      orderBy: { name: 'asc' },
    });
  });

  server.post('/', adminOnly, async (req, reply) => {
    const body = createBenutzerSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const exists = await server.prisma.benutzer.findUnique({ where: { email: body.data.email } });
    if (exists) throw conflict('E-Mail-Adresse bereits vergeben');

    const passwordHash = await bcrypt.hash(body.data.password, 10);
    const benutzer = await server.prisma.benutzer.create({
      data: {
        email: body.data.email,
        name: body.data.name,
        passwordHash,
        rolle: body.data.rolle as never,
        aktiv: body.data.aktiv,
      },
      select: { id: true, email: true, name: true, rolle: true, aktiv: true, erstelltAm: true },
    });
    return reply.status(201).send(benutzer);
  });

  server.put('/:id', adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateBenutzerSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const existing = await server.prisma.benutzer.findUnique({ where: { id: parseInt(id) } });
    if (!existing) throw notFound('Benutzer');

    const benutzer = await server.prisma.benutzer.update({
      where: { id: parseInt(id) },
      data: body.data as never,
      select: { id: true, email: true, name: true, rolle: true, aktiv: true, erstelltAm: true },
    });
    return benutzer;
  });

  server.put('/:id/passwort', { ...adminOnly, ...passwortGrenze }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = resetPasswortSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const existing = await server.prisma.benutzer.findUnique({ where: { id: parseInt(id) } });
    if (!existing) throw notFound('Benutzer');

    const passwordHash = await bcrypt.hash(body.data.neuesPasswort, 10);
    await server.prisma.benutzer.update({
      where: { id: parseInt(id) },
      data: { passwordHash },
    });
    return { message: 'Passwort zurückgesetzt' };
  });

  server.delete('/:id', adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const reqUser = req.user as { id: number };
    if (parseInt(id) === reqUser.id) {
      return reply.status(400).send({ error: 'Eigenen Account nicht deaktivierbar' });
    }
    const existing = await server.prisma.benutzer.findUnique({ where: { id: parseInt(id) } });
    if (!existing) throw notFound('Benutzer');

    await server.prisma.benutzer.update({
      where: { id: parseInt(id) },
      data: { aktiv: false },
    });
    return { message: 'Benutzer deaktiviert' };
  });
};

export default benutzerRoutes;
