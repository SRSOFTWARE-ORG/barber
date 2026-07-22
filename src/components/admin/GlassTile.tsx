import { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  highlight?: boolean;
  dim?: boolean;
};

/**
 * Tile quadrado usado na grade de módulos do Painel Admin.
 */
export default function GlassTile({
  icon: Icon, label, highlight = false, dim = false, className = '', ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={[
        'aspect-square rounded-[14px] border flex flex-col items-center justify-center gap-1 px-1 text-center transition-all',
        'bg-black/55 backdrop-blur-xl hover:bg-black/65 active:scale-[0.97]',
        highlight
          ? 'border-primary/80 ring-1 ring-primary/50 shadow-[0_0_20px_-6px_hsl(var(--primary)/0.55)]'
          : 'border-white/[0.06]',
        dim ? 'opacity-70' : '',
        className,
      ].join(' ')}
    >
      <Icon size={20} strokeWidth={1.5} className={highlight ? 'text-primary' : 'text-foreground/85'} />
      <span
        className={[
          'text-[11px] leading-tight font-heading tracking-wide',
          highlight ? 'text-primary' : 'text-foreground/90',
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  );
}
