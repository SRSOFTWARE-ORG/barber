import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, RefreshCw, ShieldCheck, ImageIcon, Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerPush, unregisterPush, pushPermissionState } from '@/lib/push';
import { toast } from 'sonner';
import { nukePwaAndReload } from '@/lib/pwa-updater';
import BiometricButton from '@/components/BiometricButton';
import Seo from '@/components/Seo';
import PasskeyDiagnostics from '@/components/PasskeyDiagnostics';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useT } from '@/contexts/LanguageContext';
import { Languages } from 'lucide-react';
import SocialLinkCard from '@/components/SocialLinkCard';

export default function SettingsPage() {
  const navigate = useNavigate();
  const t = useT();
  const { user, role, loading: authLoading } = useAuth();
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setPerm(pushPermissionState());
  }, []);

  const enableNotifications = async () => {
    if (!user) {
      toast.error('Faça login para ativar notificações');
      return;
    }
    if (perm === 'unsupported') {
      toast.error('Seu navegador não suporta notificações');
      return;
    }
    setBusy(true);
    try {
      if (Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p !== 'granted') {
          toast.error('Permissão negada. Ative manualmente nas configurações do navegador.');
          return;
        }
      } else if (Notification.permission === 'denied') {
        toast.error('Permissão bloqueada. Ative manualmente nas configurações do navegador / sistema.');
        return;
      }
      await registerPush(user.id);
      toast.success('Notificações ativadas!');
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await unregisterPush(user.id);
      toast.success('Notificações desativadas neste dispositivo.');
    } finally {
      setBusy(false);
    }
  };

  const forceUpdate = async () => {
    setChecking(true);
    try {
      // Executa a limpeza imediatamente (sem delay artificial) para a atualização ser instantânea.
      await nukePwaAndReload();
    } catch (e: any) {
      // Fallback: recarrega forçando bypass de cache
      const url = new URL(window.location.href);
      url.searchParams.set('_fresh', Date.now().toString());
      window.location.replace(url.toString());
    }
  };



  const isGranted = perm === 'granted';
  const isDenied = perm === 'denied';

  return (
    <div className="min-h-screen pb-20">
      <Seo path="/settings" title="Configurações da Conta — Barbearia" description="Gerencie notificações, login biométrico, segurança e preferências da sua conta na barbearia." />
      <div className="page-header flex items-center gap-3 px-4">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/more'))} className="text-primary" aria-label="Voltar"><ArrowLeft size={24} /></button>
        <h1 className="font-heading text-xl text-foreground">Configurações</h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Idioma */}
        <div className="wood-card rounded-2xl px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Languages size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-base text-foreground">{t('settings.language')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.languageHint')}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Notificações */}
        <div className="wood-card rounded-2xl px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Bell size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-base text-foreground">Notificações Push</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Status: {isGranted ? <span className="text-green-500 font-medium">Permitido</span>
                  : isDenied ? <span className="text-destructive font-medium">Bloqueado</span>
                  : perm === 'unsupported' ? <span className="text-muted-foreground">Não suportado</span>
                  : <span className="text-amber-500 font-medium">Pendente</span>}
              </p>
            </div>
          </div>

          {!isGranted && (
            <button
              onClick={enableNotifications}
              disabled={busy || perm === 'unsupported'}
              className="vintage-btn w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <Bell size={16} />
              {busy ? 'Ativando...' : 'Ativar Notificações'}
            </button>
          )}

          {isGranted && (
            <button
              onClick={disableNotifications}
              disabled={busy}
              className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm bg-destructive/15 border border-destructive/40 text-destructive disabled:opacity-50"
            >
              <BellOff size={16} />
              {busy ? 'Desativando...' : 'Desativar Notificações'}
            </button>
          )}

          {isDenied && (
            <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
              As notificações foram bloqueadas no navegador. Abra as configurações do site e mude para "Permitir".
            </p>
          )}
        </div>

        {/* Segurança — Biometria / Passkeys */}
        <div className="wood-card rounded-2xl px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-base text-foreground">Segurança</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cadastre a biometria deste aparelho (Face ID, Touch ID, digital ou senha do celular) para entrar sem digitar a senha.
              </p>
            </div>
          </div>

          {user ? (
            <BiometricButton mode="register" />
          ) : (
            <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
              Faça login para cadastrar a biometria.
            </p>
          )}
        </div>

        {/* Vincular contas sociais — apenas usuários logados */}
        {user && <SocialLinkCard />}

        {/* Diagnóstico de Passkey — visível apenas para o CEO */}
        {!authLoading && role === 'ceo' && <PasskeyDiagnostics />}

        {/* Branding / Logotipo oficial — visível APENAS para o CEO (uso no Google Console) */}
        {!authLoading && role === 'ceo' && (
        <div className="wood-card rounded-2xl px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <ImageIcon size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-base text-foreground">Logotipo & Branding</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Logo oficial em SVG de alta resolução e links públicos para a tela de consentimento do Google.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center bg-background/50 border border-border/50 rounded-2xl py-6">
            <img src="/logo.svg" alt="Logotipo oficial do aplicativo" className="w-28 h-28" width={112} height={112} />
          </div>

          <div className="space-y-2">
            <BrandingLink label="Logotipo (SVG)" url="https://barber.srsoftwarestore.com/logo.svg" />
            <BrandingLink label="Página inicial" url="https://barber.srsoftwarestore.com" />
            <BrandingLink label="Tela de Login (Auth)" url="https://barber.srsoftwarestore.com/auth" />
            <BrandingLink label="Política de Privacidade" url="https://barber.srsoftwarestore.com/privacy-policy" />
            <BrandingLink label="Termos de Serviço" url="https://barber.srsoftwarestore.com/terms-of-service" />
          </div>

          <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
            Use estes links em "Google Auth Platform → Branding". O domínio <strong>barber.srsoftwarestore.com</strong> deve estar registrado em "Domínios autorizados".
          </p>
        </div>
        )}





        {/* Atualizar app */}
        <div className="wood-card rounded-2xl px-5 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <RefreshCw size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-base text-foreground">Atualizar Aplicativo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Force uma verificação manual caso a atualização automática não tenha acontecido.
              </p>
            </div>
          </div>

          <button
            onClick={forceUpdate}
            disabled={checking}
            className="vintage-btn w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Verificando...' : 'Verificar atualização'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandingLink({ label, url }: { label: string; url: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} copiado!`);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };
  return (
    <div className="flex items-center gap-2 bg-background/50 border border-border/50 rounded-xl px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-xs text-foreground truncate">{url}</p>
      </div>
      <button onClick={copy} className="text-primary p-1.5 hover:bg-primary/10 rounded-lg" aria-label={`Copiar ${label}`}>
        <Copy size={15} />
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary p-1.5 hover:bg-primary/10 rounded-lg" aria-label={`Abrir ${label}`}>
        <ExternalLink size={15} />
      </a>
    </div>
  );
}

