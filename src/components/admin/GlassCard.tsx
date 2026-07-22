import { forwardRef, HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & {
  highlight?: boolean;
  padded?: boolean;
};

/**
 * Glass surface compartilhada do Painel Admin.
 * Mantém a mesma linguagem visual do print: preto translúcido + blur + borda sutil.
 */
const GlassCard = forwardRef<HTMLDivElement, Props>(
  ({ highlight = false, padded = true, className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        {...rest}
        className={[
          'rounded-2xl bg-black/55 backdrop-blur-xl border',
          highlight
            ? 'border-primary/70 ring-1 ring-primary/40 shadow-[0_0_20px_-6px_hsl(var(--primary)/0.55)]'
            : 'border-white/[0.06]',
          padded ? 'p-4' : '',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    );
  },
);
GlassCard.displayName = 'GlassCard';
export default GlassCard;
