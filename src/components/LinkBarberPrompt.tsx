import { Lock, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

export default function LinkBarberPrompt({ feature }: { feature: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Lock size={28} className="text-primary" />
      </div>
      <h2 className="font-heading text-lg text-foreground mb-2">{t('restricted.title')}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        {user
          ? t('restricted.loggedIn', { feature })
          : t('restricted.loggedOut', { feature })}
      </p>
      <button
        onClick={() => navigate(user ? '/profile' : '/')}
        className="vintage-btn px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm"
      >
        <UserPlus size={16} />
        {user ? t('restricted.goProfile') : t('restricted.doLogin')}
      </button>
    </div>
  );
}
