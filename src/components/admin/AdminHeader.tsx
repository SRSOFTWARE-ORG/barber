import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type Props = {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
};

/**
 * Header sticky padronizado das telas do Painel Admin.
 */
export default function AdminHeader({ title, onBack, right, subtitle }: Props) {
  const nav = useNavigate();
  const handleBack = onBack ?? (() => nav(-1));
  return (
    <header className="sticky top-0 z-10 bg-background/85 backdrop-blur border-b border-border/50">
      <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 h-14">
        <button
          onClick={handleBack}
          aria-label="Voltar"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/40 text-foreground"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-2xl text-foreground truncate leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
