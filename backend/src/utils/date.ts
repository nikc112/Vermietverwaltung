import dayjs from 'dayjs';
import 'dayjs/locale/de';

dayjs.locale('de');

export function formatDatum(date: Date | string): string {
  return dayjs(date).format('DD.MM.YYYY');
}

export function formatMonatJahr(monat: number, jahr: number): string {
  return dayjs(`${jahr}-${String(monat).padStart(2, '0')}-01`).format('MMMM YYYY');
}

export function tagImJahrFuer(date: Date | string): number {
  const d = dayjs(date);
  return d.diff(d.startOf('year'), 'day') + 1;
}

export function tageImJahr(jahr: number): number {
  return dayjs(`${jahr}-12-31`).diff(dayjs(`${jahr}-01-01`), 'day') + 1;
}

export function zeitraumFaktor(
  vertragBeginn: Date,
  vertragEnde: Date | null,
  abrechnungsjahr: number,
  periodStart?: Date,
  periodEnde?: Date,
): number {
  const jahresStart = periodStart ? dayjs(periodStart) : dayjs(`${abrechnungsjahr}-01-01`);
  const jahresEnde = periodEnde ? dayjs(periodEnde) : dayjs(`${abrechnungsjahr}-12-31`);

  const beginn = dayjs(vertragBeginn).isBefore(jahresStart) ? jahresStart : dayjs(vertragBeginn);
  const ende = vertragEnde === null || dayjs(vertragEnde).isAfter(jahresEnde)
    ? jahresEnde
    : dayjs(vertragEnde);

  if (ende.isBefore(beginn)) return 0;

  const tageImVertrag = ende.diff(beginn, 'day') + 1;
  const gesamtTage = jahresEnde.diff(jahresStart, 'day') + 1;
  return roundFaktor(tageImVertrag / gesamtTage);
}

function roundFaktor(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}
