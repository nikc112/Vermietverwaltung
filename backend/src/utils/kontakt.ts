type NameInput = { firma?: string | null; vorname: string; nachname: string };

export function kontaktName(k: NameInput): string {
  if (k.firma && k.firma.trim() !== '') return k.firma;
  return `${k.vorname} ${k.nachname}`.trim();
}

type KommEintrag = { typ: string; wert: string; istStandard: boolean };

export function standardEmail(kommunikation: KommEintrag[]): string | undefined {
  const std = kommunikation.find((k) => k.typ === 'EMAIL' && k.istStandard);
  if (std) return std.wert;
  return kommunikation.find((k) => k.typ === 'EMAIL')?.wert;
}

export function ersterTelefon(kommunikation: KommEintrag[]): string | undefined {
  return kommunikation.find((k) => k.typ === 'TELEFON' || k.typ === 'MOBIL')?.wert;
}
