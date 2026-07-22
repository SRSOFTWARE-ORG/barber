import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Smartphone, Share, MoreVertical, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPage() {
  const { shopDisplayName } = useAuth();
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Check iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await Promise.race([
        deferredPrompt.prompt(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 4000)),
      ]);
      const { outcome } = await Promise.race([
        deferredPrompt.userChoice,
        new Promise<{ outcome: 'accepted' | 'dismissed' }>((resolve) => window.setTimeout(() => resolve({ outcome: 'dismissed' }), 5000)),
      ]);
      if (outcome === 'accepted') setIsInstalled(true);
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  return (
    <div className="page-shell min-h-screen">
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => navigate('/')} className="text-primary" aria-label="Voltar para início"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">Instalar App</h1>
      </div>

      <div className="px-4 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-3 py-6">
          <div className="w-24 h-24 mx-auto rounded-2xl overflow-hidden shadow-lg border-2 border-primary/30">
            <img src="/pwa-icon-512.png" alt={`Ícone do app ${shopDisplayName}`} className="w-full h-full object-cover" />
          </div>
          <h2 className="font-heading text-2xl text-primary">{shopDisplayName}</h2>
          <p className="text-muted-foreground text-sm">Tenha o app direto na tela do seu celular!</p>
        </div>

        {isInstalled ? (
          <div className="wood-card px-6 py-6 text-center space-y-3">
            <Check size={40} className="mx-auto text-accent" />
            <h3 className="font-heading text-lg text-foreground">App já instalado!</h3>
            <p className="text-sm text-muted-foreground">Você já tem o app na sua tela inicial. Aproveite!</p>
          </div>
        ) : (
          <>
            {/* Install button for Android/Chrome */}
            {deferredPrompt && (
              <button
                onClick={handleInstall}
                  disabled={installing}
                className="vintage-btn w-full py-4 rounded-xl flex items-center justify-center gap-3 text-base font-heading"
              >
                  <Download size={22} /> {installing ? 'Abrindo instalador...' : 'Instalar Agora'}
              </button>
            )}

            {/* Benefits */}
            <div className="wood-card px-5 py-5 space-y-4">
              <h3 className="font-heading text-base text-primary">Vantagens do App</h3>
              <div className="space-y-3">
                {[
                  { icon: Smartphone, text: 'Acesso rápido direto da tela inicial' },
                  { icon: Download, text: 'Funciona mesmo com internet instável' },
                  { icon: Check, text: 'Experiência como app nativo' },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-primary" />
                    </div>
                    <p className="text-sm text-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* iOS Instructions */}
            {isIOS && (
              <div className="wood-card px-5 py-5 space-y-3">
                <h3 className="font-heading text-base text-primary">Como instalar no iPhone</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 font-heading text-sm text-primary">1</div>
                    <p className="text-sm text-muted-foreground pt-1">Toque no botão <Share size={14} className="inline text-primary" /> <strong className="text-foreground">Compartilhar</strong> na barra do Safari</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 font-heading text-sm text-primary">2</div>
                    <p className="text-sm text-muted-foreground pt-1">Role para baixo e toque em <strong className="text-foreground">"Adicionar à Tela de Início"</strong></p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 font-heading text-sm text-primary">3</div>
                    <p className="text-sm text-muted-foreground pt-1">Toque em <strong className="text-foreground">"Adicionar"</strong> no canto superior direito</p>
                  </div>
                </div>
              </div>
            )}

            {/* Android Instructions (if no prompt available) */}
            {!isIOS && !deferredPrompt && (
              <div className="wood-card px-5 py-5 space-y-3">
                <h3 className="font-heading text-base text-primary">Como instalar no Android</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 font-heading text-sm text-primary">1</div>
                    <p className="text-sm text-muted-foreground pt-1">Toque no menu <MoreVertical size={14} className="inline text-primary" /> do Chrome (3 pontinhos)</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 font-heading text-sm text-primary">2</div>
                    <p className="text-sm text-muted-foreground pt-1">Toque em <strong className="text-foreground">"Instalar aplicativo"</strong> ou <strong className="text-foreground">"Adicionar à tela inicial"</strong></p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 font-heading text-sm text-primary">3</div>
                    <p className="text-sm text-muted-foreground pt-1">Confirme tocando em <strong className="text-foreground">"Instalar"</strong></p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
