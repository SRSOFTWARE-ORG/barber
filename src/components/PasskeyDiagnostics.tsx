import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Beaker, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  hasPublicKeyCredential,
  isSecureContextOk,
  isInIframe,
  isPlatformAuthenticatorAvailable,
} from '@/lib/passkeys';

interface Props {
  /** Chamado quando o teste "Simular Login de Sucesso" roda — útil p/ validar redirect. */
  onSimulatedSuccess?: () => void;
}

function StatusRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {ok ? (
        <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle size={18} className="text-destructive flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <span className={`text-[11px] font-medium ${ok ? 'text-green-500' : 'text-destructive'}`}>
        {ok ? 'OK' : 'Falha'}
      </span>
    </div>
  );
}

/**
 * Painel de Diagnóstico de Passkey / Biometria.
 * Mostra os requisitos em tempo real e permite simular um login de sucesso
 * (a biometria real não funciona dentro do iframe de preview do Lovable).
 */
export default function PasskeyDiagnostics({ onSimulatedSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [pubKey, setPubKey] = useState(false);
  const [secure, setSecure] = useState(false);
  const [iframe, setIframe] = useState(false);
  const [platform, setPlatform] = useState(false);

  useEffect(() => {
    setPubKey(hasPublicKeyCredential());
    setSecure(isSecureContextOk());
    setIframe(isInIframe());
    isPlatformAuthenticatorAvailable().then(setPlatform).catch(() => setPlatform(false));
  }, []);

  const simulate = () => {
    toast.success('✅ Simulação: login por biometria bem-sucedido!', {
      description: 'Fluxo de redirecionamento e estados de sessão validados (sem hardware real).',
    });
    onSimulatedSuccess?.();
  };

  return (
    <div className="wood-card rounded-2xl px-5 py-5 space-y-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 text-left"
      >
        <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
          <Beaker size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-heading text-base text-foreground">Diagnóstico de Passkey</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ferramentas de desenvolvedor para validar a biometria.
          </p>
        </div>
        <ChevronDown
          size={20}
          className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {iframe && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2.5">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                <span className="font-semibold">Aviso:</span> Você está no modo de pré-visualização. O navegador
                bloqueia biometria nativa dentro de iframes. <span className="font-semibold">Publique</span> o
                app e acesse pelo domínio oficial para testar o Face ID / Touch ID real.
              </p>
            </div>
          )}

          <div className="bg-muted/20 rounded-xl px-3 py-2 divide-y divide-border/40">
            <StatusRow
              ok={pubKey}
              label="Suporte do Navegador"
              hint="window.PublicKeyCredential disponível"
            />
            <StatusRow
              ok={secure}
              label="Conexão Segura (HTTPS)"
              hint="window.isSecureContext verdadeiro"
            />
            <StatusRow
              ok={!iframe}
              label="Fora de Iframe"
              hint={iframe ? 'Rodando dentro de iframe (preview)' : 'Janela própria — biometria liberada'}
            />
            <StatusRow
              ok={platform}
              label="Autenticador de Plataforma"
              hint="Face ID / Touch ID / digital do aparelho"
            />
          </div>

          <button
            type="button"
            onClick={simulate}
            className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm bg-secondary/40 border border-primary/30 text-foreground hover:bg-secondary/60 transition-colors"
          >
            <ShieldCheck size={18} className="text-primary" />
            Simular Login de Sucesso
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            Domínio oficial (RP ID): barber.srsoftwarestore.com
          </p>
        </div>
      )}
    </div>
  );
}
