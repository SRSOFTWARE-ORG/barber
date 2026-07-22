import { useEffect, useRef, useState, ReactNode } from 'react';

interface Props {
  /** Conteúdo pesado renderizado apenas quando entra (ou se aproxima) da viewport. */
  children: ReactNode;
  /** Placeholder enquanto não está visível (mantém o layout estável). */
  placeholder?: ReactNode;
  /** Margem extra para começar a carregar um pouco antes de aparecer. */
  rootMargin?: string;
  className?: string;
}

/**
 * Só monta os filhos quando o wrapper fica visível na tela.
 * Ideal para iframes pesados (Google Maps), vídeos e mídias abaixo da dobra —
 * evita custo de rede/CPU no carregamento inicial e reduz lag de rolagem.
 */
export default function LazyVisible({ children, placeholder, rootMargin = '200px', className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : placeholder}
    </div>
  );
}
