import { useEffect, useState } from 'react';
import { Bell, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerPush } from '@/lib/push';
import { toast } from 'sonner';
import { useT } from '@/contexts/LanguageContext';

const DISMISS_KEY = 'push-prompt-dismissed-at';
const DISMISS_DAYS = 3;

/**
 * Modal estilizado para pedir permissão de notificações.
 * Aparece apenas se o usuário está logado, Notification.permission === 'default'
 * e não foi dispensado nos últimos N dias.
 */
export default function PushPermissionModal() {
  const { user } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const days = (Date.now() - dismissed) / (1000 * 60 * 60 * 24);
    if (dismissed && days < DISMISS_DAYS) return;
    // pequeno delay para não atrapalhar o splash
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, [user]);

  if (!open || !user) return null;

  const accept = async () => {
    setBusy(true);
    try {
      const permissionPromise = Notification.requestPermission();
      const p = await Promise.race([
        permissionPromise,
        new Promise<NotificationPermission>((resolve) => window.setTimeout(() => resolve(Notification.permission), 5000)),
      ]);
      if (p === 'granted') {
        await Promise.race([
          registerPush(user.id),
          new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
        ]);
        toast.success(t('push.enabled'));
      } else {
        toast(t('push.enableLater'));
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="wood-card relative w-full max-w-sm rounded-3xl overflow-hidden border border-primary/30 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full"
        >
          <X size={18} />
        </button>

        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent px-6 pt-7 pb-4 text-center">
          <div className="relative inline-flex">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 border border-primary/50 flex items-center justify-center shadow-lg">
              <Bell size={28} className="text-primary-foreground" />
              <Sparkles size={14} className="absolute -top-1 -right-1 text-accent animate-pulse" />
            </div>
          </div>
          <h2 className="font-display text-2xl text-foreground mt-4 tracking-wide">
            {t('push.title')}
          </h2>
          <p className="text-xs text-muted-foreground tracking-[0.2em] uppercase mt-1">
            • {t('push.subtitle')} •
          </p>
        </div>

        <div className="px-6 py-4 space-y-2.5 text-sm text-muted-foreground">
          <div className="flex items-start gap-2.5">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            <p>{t('push.benefit1')}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            <p>{t('push.benefit2')}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            <p>{t('push.benefit3')}</p>
          </div>
        </div>

        <div className="px-6 pb-6 pt-2 space-y-2">
          <button
            onClick={accept}
            disabled={busy}
            className="vintage-btn w-full py-3 rounded-2xl font-heading tracking-wide text-base disabled:opacity-50"
          >
            {busy ? t('push.allowing') : t('push.allow')}
          </button>
          <button
            onClick={dismiss}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('push.notNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
