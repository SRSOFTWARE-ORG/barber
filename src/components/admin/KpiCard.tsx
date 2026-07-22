import type { LucideIcon } from 'lucide-react';

type Tint = 'primary' | 'warning' | 'success';

type Props = {
  icon: LucideIcon;
  value: number | string;
  label: string;
  loading?: boolean;
  tint?: Tint;
  highlight?: boolean;
};

/**
 * KPI card no padrão do print: ícone pequeno no topo, valor grande, label discreto.
 */
export default function KpiCard({
  icon: Icon, value, label, loading = false, tint = 'primary', highlight = false,
}: Props) {
  const tintCls =
    tint === 'primary' ? 'text-primary' :
    tint === 'warning' ? 'text-amber-400' :
    'text-emerald-400';
  return (
    <div
      className={[
        'rounded-xl bg-black/55 backdrop-blur-xl border p-2.5 flex flex-col items-start gap-0.5',
        highlight
          ? 'border-primary/70 ring-1 ring-primary/40 shadow-[0_0_16px_-6px_hsl(var(--primary)/0.55)]'
          : 'border-white/[0.06]',
      ].join(' ')}
    >
      <Icon size={14} className={tintCls} strokeWidth={1.75} />
      <span className={`text-2xl font-bold leading-none mt-0.5 ${tintCls}`}>
        {loading ? '—' : value}
      </span>
      <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}
