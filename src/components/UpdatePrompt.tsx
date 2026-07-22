import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { ensurePwaRegistration, getPwaWorkbox, isPreviewPwaContext, triggerPwaUpdate } from '@/lib/pwa-updater';
import { useT } from '@/contexts/LanguageContext';

export default function UpdatePrompt() {
  const t = useT();
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if (isPreviewPwaContext()) return;

    const workbox = getPwaWorkbox();
    if (!workbox) return;

    const showRefresh = () => setNeedRefresh(true);

    workbox.addEventListener('waiting', showRefresh);
    ensurePwaRegistration().catch(() => undefined);

    return () => {
      workbox.removeEventListener('waiting', showRefresh);
    };
  }, []);

  useEffect(() => {
    if (!needRefresh) return;
    toast(t('update.title'), {
      description: t('update.body'),
      duration: Infinity,
      icon: <RefreshCw size={18} className="text-primary" />,
      action: {
        label: t('update.action'),
        onClick: async () => {
          await triggerPwaUpdate();
        },
      },
      onDismiss: () => setNeedRefresh(false),
    });
  }, [needRefresh, t]);

  return null;
}
