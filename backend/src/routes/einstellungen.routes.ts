import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { makeAuth, ROLLEN } from '../utils/auth';
import { FRIST_SCHLUESSEL, MAHN_SCHLUESSEL } from '../services/einstellung.service';

const SMTP_SCHLUESSEL = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];

const einstellungenRoutes: FastifyPluginAsync = async (server) => {
  const adminOnly = makeAuth(server, ...ROLLEN.ADMIN_ONLY);
  const auth = makeAuth(server);

  server.get('/', auth, async () => {
    const einstellungen = await server.prisma.einstellung.findMany({
      where: { schluessel: { in: [...SMTP_SCHLUESSEL, ...MAHN_SCHLUESSEL, ...FRIST_SCHLUESSEL] } },
    });
    const result: Record<string, string> = {};
    for (const s of SMTP_SCHLUESSEL) {
      result[s] = einstellungen.find((e) => e.schluessel === s)?.wert ?? '';
    }
    // Passwort nicht zurückgeben
    result['smtp_pass'] = einstellungen.find((e) => e.schluessel === 'smtp_pass')?.wert ? '••••••••' : '';
    for (const s of MAHN_SCHLUESSEL) {
      result[s] = einstellungen.find((e) => e.schluessel === s)?.wert ?? '';
    }
    for (const s of FRIST_SCHLUESSEL) {
      result[s] = einstellungen.find((e) => e.schluessel === s)?.wert ?? '';
    }
    return result;
  });

  server.put('/', adminOnly, async (req, reply) => {
    const schema = z.object({
      smtp_host: z.string().optional(),
      smtp_port: z.string().optional(),
      smtp_secure: z.string().optional(),
      smtp_user: z.string().optional(),
      smtp_pass: z.string().optional(),
      smtp_from: z.string().optional(),
      mahn_gebuehr: z.string().optional(),
      mahn_karenz_tage: z.string().optional(),
      mahn_wartefrist_tage: z.string().optional(),
      mahn_zahlungsfrist_tage: z.string().optional(),
      frist_vorlauf_nka_tage: z.string().optional(),
      frist_vorlauf_vertragsende_tage: z.string().optional(),
      frist_vorlauf_manuell_tage: z.string().optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });

    const updates = Object.entries(body.data).filter(([, v]) => v !== undefined && v !== '••••••••');
    await Promise.all(
      updates.map(([schluessel, wert]) =>
        server.prisma.einstellung.upsert({
          where: { schluessel },
          update: { wert: wert as string },
          create: { schluessel, wert: wert as string },
        }),
      ),
    );
    return { message: 'Einstellungen gespeichert' };
  });
};

export default einstellungenRoutes;
