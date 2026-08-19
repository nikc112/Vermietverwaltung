import { Plus, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KontaktKommunikation, KommunikationsTyp } from '@/types';

const TYPEN: { value: KommunikationsTyp; label: string }[] = [
  { value: 'EMAIL', label: 'E-Mail' },
  { value: 'TELEFON', label: 'Telefon' },
  { value: 'MOBIL', label: 'Mobil' },
  { value: 'FAX', label: 'Fax' },
  { value: 'SONSTIGE', label: 'Sonstige' },
];

interface Props {
  value: KontaktKommunikation[];
  onChange: (value: KontaktKommunikation[]) => void;
}

export function KommunikationFelder({ value, onChange }: Props) {
  const setEintrag = (index: number, patch: Partial<KontaktKommunikation>) => {
    onChange(value.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const setStandard = (index: number) => {
    onChange(value.map((e, i) => ({ ...e, istStandard: e.typ === 'EMAIL' ? i === index : e.istStandard })));
  };

  return (
    <div className="space-y-2">
      {value.map((eintrag, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={eintrag.typ} onValueChange={(v) => setEintrag(i, { typ: v as KommunikationsTyp, istStandard: false })}>
            <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPEN.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="flex-1" placeholder="Wert" value={eintrag.wert} onChange={(e) => setEintrag(i, { wert: e.target.value })} />
          <Input className="w-28" placeholder="Bezeichnung" value={eintrag.bezeichnung ?? ''} onChange={(e) => setEintrag(i, { bezeichnung: e.target.value })} />
          {eintrag.typ === 'EMAIL' && (
            <Button type="button" variant="ghost" size="icon" title="Als Standard-E-Mail setzen" onClick={() => setStandard(i)}>
              <Star className={`h-4 w-4 ${eintrag.istStandard ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { typ: 'EMAIL', wert: '', istStandard: !value.some((e) => e.typ === 'EMAIL' && e.istStandard) }])}
      >
        <Plus className="h-4 w-4 mr-1" /> Kommunikationsweg
      </Button>
    </div>
  );
}
