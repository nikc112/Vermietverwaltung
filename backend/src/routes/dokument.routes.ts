import { FastifyPluginAsync } from 'fastify';
import {
  listDokumenteQuerySchema, updateDokumentSchema, uploadMetaSchema,
} from '../schemas/dokument.schema';
import * as svc from '../services/dokument.service';
import { makeAuth, ROLLEN } from '../utils/auth';
import { badRequest } from '../utils/errors';

// Nur reine Ziffernfolgen groesser null gelten — parseInt('12xyz', 10) waere sonst faelschlich 12
function parseID(wert: string): number | null {
  if (!/^\d+$/.test(wert)) return null;
  const id = parseInt(wert, 10);
  return id > 0 ? id : null;
}

// Fallback-Dateiname fuer den nicht-* Teil von Content-Disposition: nur druckbare ASCII-Zeichen,
// ohne Anfuehrungszeichen/Backslashes (wuerden die Header-Syntax brechen) und ohne Steuerzeichen
function asciiDateiname(name: string): string {
  const bereinigt = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').trim();
  return bereinigt.length > 0 ? bereinigt : 'dokument';
}

const dokumentRoutes: FastifyPluginAsync = async (server) => {
  const auth = makeAuth(server);
  const schreiben = makeAuth(server, ...ROLLEN.VERTRAGSVERWALTER);
  const loeschen = makeAuth(server, ...ROLLEN.VOLLZUGRIFF);
  // Ein Upload bindet bis zu 25 MB Arbeitsspeicher und schreibt auf die Platte.
  // Sechzig Dateien in fuenf Minuten sind mehr, als jemand von Hand hochlaedt,
  // begrenzen aber den Schaden, den ein fehlerhaftes Skript anrichten kann.
  const hochladeGrenze = { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } };
  // Ein erneuter Versuch stoesst eine Texterkennung an: bis zu 30 Seiten rendern
  // und durch die Zeichenerkennung schicken. Ohne eigene Grenze koennte ein
  // Konto mit Vollzugriff im Minutentakt Hunderte Dokumente neu vormerken und
  // die Warteschlange fuer alle anderen dichtsetzen -- der Upload wird aus
  // demselben Grund begrenzt.
  const wiederholGrenze = { config: { rateLimit: { max: 30, timeWindow: '5 minutes' } } };

  server.get('/', auth, async (req, reply) => {
    const query = listDokumenteQuerySchema.safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: query.error.flatten().fieldErrors });
    return svc.listeDokumente(server.prisma, query.data, req.user.rolle);
  });

  server.get('/schlagworte', auth, async (req) => {
    return svc.listeSchlagworte(server.prisma, req.user.rolle);
  });

  server.get('/:id', auth, async (req, reply) => {
    const id = parseID((req.params as { id: string }).id);
    if (id === null) return reply.status(400).send({ error: 'Ungültige ID' });
    return svc.getDokument(server.prisma, id, req.user.rolle);
  });

  server.get('/:id/download', auth, async (req, reply) => {
    const id = parseID((req.params as { id: string }).id);
    if (id === null) return reply.status(400).send({ error: 'Ungültige ID' });
    const dokument = await svc.getDokumentIntern(server.prisma, id, req.user.rolle);
    reply.header('Content-Type', dokument.mimeTyp);
    reply.header('X-Content-Type-Options', 'nosniff');
    // RFC 6266: ASCII-Fallback fuer alte Clients, filename* fuer korrekte Umlaute/Sonderzeichen
    // (sonst zeigt der Browser bei "Mietvertrag Müller.pdf" die Prozent-Kodierung an)
    reply.header(
      'Content-Disposition',
      `attachment; filename="${asciiDateiname(dokument.dateiname)}"; filename*=UTF-8''${encodeURIComponent(dokument.dateiname)}`,
    );
    return reply.send(svc.leseStream(dokument.speicherName));
  });

  server.post('/', { ...schreiben, ...hochladeGrenze }, async (req, reply) => {
    const teil = await req.file();
    if (!teil) return reply.status(400).send({ error: 'Keine Datei übermittelt' });

    // @fastify/multipart parst Teile seriell — steht die Datei im FormData vor den
    // Metadatenfeldern, sind diese erst NACH toBuffer() vollstaendig geparst. Felder daher
    // erst danach auslesen, sonst fehlen kategorie/titel/schlagworte/Bezugs-IDs kommentarlos.
    let inhalt: Buffer;
    try {
      inhalt = await teil.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw badRequest('Datei ist größer als 25 MB');
      }
      throw err;
    }

    const felder: Record<string, string> = {};
    for (const [name, feld] of Object.entries(teil.fields)) {
      const wert = Array.isArray(feld) ? feld[0] : feld;
      if (wert && 'value' in wert && typeof wert.value === 'string') felder[name] = wert.value;
    }
    const meta = uploadMetaSchema.safeParse(felder);
    if (!meta.success) return reply.status(400).send({ error: meta.error.flatten().fieldErrors });

    const ergebnis = await svc.speichereDokument(
      server.prisma,
      { dateiname: teil.filename, mimeTyp: teil.mimetype, inhalt, abgeschnitten: teil.file.truncated },
      meta.data,
      req.user.id,
    );
    return reply.status(201).send(ergebnis);
  });

  server.put('/:id', schreiben, async (req, reply) => {
    const id = parseID((req.params as { id: string }).id);
    if (id === null) return reply.status(400).send({ error: 'Ungültige ID' });
    const body = updateDokumentSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten().fieldErrors });
    return svc.updateDokument(server.prisma, id, body.data, req.user.rolle);
  });

  server.delete('/:id', loeschen, async (req, reply) => {
    const id = parseID((req.params as { id: string }).id);
    if (id === null) return reply.status(400).send({ error: 'Ungültige ID' });
    return svc.deleteDokument(server.prisma, id, req.user.rolle);
  });

  server.post('/:id/text-neu', { ...loeschen, ...wiederholGrenze }, async (req, reply) => {
    const id = parseID((req.params as { id: string }).id);
    if (id === null) return reply.status(400).send({ error: 'Ungültige ID' });
    return svc.textErneutVersuchen(server.prisma, id, req.user.rolle);
  });
};

export default dokumentRoutes;
