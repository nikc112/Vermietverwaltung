import { FastifyPluginAsync } from 'fastify';
import { toNumber } from '../utils/currency';
import { standardEmail } from '../utils/kontakt';
import { zaehleFristenAmpel } from '../services/frist.service';

const dashboardRoutes: FastifyPluginAsync = async (server) => {
  const auth = { preHandler: [server.authenticate] };
  const today = new Date();

  const zahlungInclude = {
    mietvertrag: {
      include: {
        mieter: { select: { vorname: true, nachname: true, kommunikation: true } },
        mieteinheit: {
          include: { mietobjekt: { select: { bezeichnung: true, ort: true } } },
        },
      },
    },
  } as const;

  function mitMieterEmail<
    T extends { mietvertrag: { mieter: { kommunikation: { typ: string; wert: string; istStandard: boolean }[] } } },
  >(zahlung: T) {
    return {
      ...zahlung,
      mietvertrag: {
        ...zahlung.mietvertrag,
        mieter: { ...zahlung.mietvertrag.mieter, email: standardEmail(zahlung.mietvertrag.mieter.kommunikation) },
      },
    };
  }

  server.get('/kennzahlen', auth, async () => {
    const prisma = server.prisma;
    const monat = today.getMonth() + 1;
    const jahr = today.getFullYear();

    const [
      mietobjekteCount,
      mieteinheitenGesamt,
      mieteinheitenAktiv,
      aktiveVertraege,
      ausstehendCount,
      ausstehendSumme,
      teilbezahltRaw,
    ] = await Promise.all([
      prisma.mietobjekt.count({ where: { aktiv: true } }),
      prisma.mieteinheit.count({ where: { aktiv: true } }),
      prisma.mieteinheit.count({
        where: { aktiv: true, mietvertraege: { some: { status: 'AKTIV' } } },
      }),
      prisma.mietvertrag.count({ where: { status: 'AKTIV' } }),
      prisma.mietzahlung.count({
        where: { eingegangen: false, monat, jahr, mietvertrag: { status: 'AKTIV' } },
      }),
      prisma.mietzahlung.aggregate({
        where: { eingegangen: false, monat, jahr, mietvertrag: { status: 'AKTIV' } },
        _sum: { sollBetrag: true },
      }),
      prisma.mietzahlung.findMany({
        where: { eingegangen: true, monat, jahr, mietvertrag: { status: 'AKTIV' }, istBetrag: { not: null } },
        select: { sollBetrag: true, istBetrag: true },
      }),
    ]);

    const teilbezahlt = teilbezahltRaw.filter(
      (z) => z.istBetrag !== null && toNumber(z.istBetrag) < toNumber(z.sollBetrag),
    );
    const fehlbetrag = teilbezahlt.reduce(
      (s, z) => s + toNumber(z.sollBetrag) - toNumber(z.istBetrag!),
      0,
    );

    const leerstand = mieteinheitenGesamt - mieteinheitenAktiv;

    const monatsmietenSumme = await prisma.mietvertrag.aggregate({
      where: { status: 'AKTIV' },
      _sum: { kaltmiete: true, nebenkostenVorauszahlung: true },
    });

    const fristen = await zaehleFristenAmpel(prisma);

    return {
      mietobjekte: mietobjekteCount,
      mieteinheiten: { gesamt: mieteinheitenGesamt, vermietet: mieteinheitenAktiv, leerstand },
      aktiveVertraege,
      monatlicheSollMiete:
        toNumber(monatsmietenSumme._sum.kaltmiete ?? 0) +
        toNumber(monatsmietenSumme._sum.nebenkostenVorauszahlung ?? 0),
      ausstehend: {
        anzahl: ausstehendCount,
        summe: toNumber(ausstehendSumme._sum.sollBetrag ?? 0),
      },
      teilzahlungen: {
        anzahl: teilbezahlt.length,
        fehlbetrag,
      },
      fristen,
    };
  });

  server.get('/offene-zahlungen', auth, async () => {
    const zahlungen = await server.prisma.mietzahlung.findMany({
      where: {
        eingegangen: false,
        monat: today.getMonth() + 1,
        jahr: today.getFullYear(),
        mietvertrag: { status: 'AKTIV' },
      },
      include: zahlungInclude,
      orderBy: [{ jahr: 'asc' }, { monat: 'asc' }],
      take: 50,
    });
    return zahlungen.map(mitMieterEmail);
  });

  server.get('/teilzahlungen', auth, async () => {
    const monat = today.getMonth() + 1;
    const jahr = today.getFullYear();
    const alle = await server.prisma.mietzahlung.findMany({
      where: { eingegangen: true, monat, jahr, mietvertrag: { status: 'AKTIV' }, istBetrag: { not: null } },
      include: zahlungInclude,
      orderBy: [{ jahr: 'asc' }, { monat: 'asc' }],
    });
    return alle
      .filter((z) => z.istBetrag !== null && toNumber(z.istBetrag) < toNumber(z.sollBetrag))
      .map(mitMieterEmail);
  });

  server.get('/auslaufende-vertraege', auth, async () => {
    const in90Tagen = new Date(today);
    in90Tagen.setDate(in90Tagen.getDate() + 90);
    return server.prisma.mietvertrag.findMany({
      where: {
        status: 'AKTIV',
        ende: { gte: today, lte: in90Tagen },
      },
      include: {
        mieter: { select: { vorname: true, nachname: true } },
        mieteinheit: { select: { bezeichnung: true, mietobjekt: { select: { bezeichnung: true } } } },
      },
      orderBy: { ende: 'asc' },
    });
  });
};

export default dashboardRoutes;
