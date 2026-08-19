import { Decimal } from '@prisma/client/runtime/library';

export function toNumber(value: Decimal | number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

export function roundHalfUp(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatEuro(value: number | Decimal): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(toNumber(value));
}
