import { LogIn, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Botão flutuante de Login/Logout exibido em todo o app.
 * Fica escondido nas rotas de autenticação para não poluir.
 */
export default function AuthButton() {
  const { user, role, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const hideOn = ['/auth', '/reset-password', '/supabase-config'];
  if (hideOn.includes(location.pathname)) return null;

  const handleLogout = async () => {
    await signOut();
    toast.success('Sessão encerrada.');
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed top-3 right-3 z-40 flex items-center gap-2">
      {user ? (
        <>
          <span className="hidden sm:inline text-[11px] text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded-md border border-border">
            {user.email}
            {role && <span className="ml-1 uppercase text-primary">· {role}</span>}
          </span>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border bg-background/80 backdrop-blur px-3 py-1.5 text-xs text-foreground hover:text-destructive hover:border-destructive/60 disabled:opacity-40"
            aria-label="Sair"
          >
            <LogOut size={14} /> Sair
          </button>
        </>
      ) : (
        <button
          onClick={() => navigate('/admin')}
          className="flex items-center gap-1 rounded-md border border-primary/40 bg-background/80 backdrop-blur px-3 py-1.5 text-xs text-primary hover:bg-primary hover:text-primary-foreground"
          aria-label="Entrar"
        >
          <LogIn size={14} /> Entrar
        </button>
      )}
    </div>
  );
}
