import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, X } from "lucide-react";

const APP_ICON = "/pwa-icon-512.png";

export default function MpCallbackPage() {
  const [params] = useSearchParams();
  const ok = params.get("ok") === "1";
  const message = params.get("msg") || (ok ? "Conexão concluída." : "Não foi possível concluir.");
  const returnTo = useMemo(() => {
    const r = params.get("return_to") || "/admin";
    // Só permite caminhos internos absolutos; bloqueia protocol-relative (//evil.com).
    return r.startsWith("/") && !r.startsWith("//") ? r : "/admin";
  }, [params]);

  const [count, setCount] = useState(4);
  useEffect(() => {
    const t = setInterval(() => setCount((n) => Math.max(0, n - 1)), 1000);
    const r = setTimeout(() => { window.location.href = returnTo; }, 4000);
    return () => { clearInterval(t); clearTimeout(r); };
  }, [returnTo]);

  const accent = ok ? "#c9a86a" : "#d97757";
  const accentDim = ok ? "rgba(201,168,106,0.18)" : "rgba(217,119,87,0.18)";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top, #2a1f17 0%, #1a1410 55%, #0f0a07 100%)",
        color: "#f4e9d8",
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* halos */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 w-[380px] h-[380px] rounded-full blur-3xl"
        style={{ background: accentDim }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 w-[420px] h-[420px] rounded-full blur-3xl"
        style={{ background: "rgba(74,56,37,0.4)" }}
      />

      <div
        className="relative w-full max-w-md rounded-3xl px-7 py-10 text-center shadow-2xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(42,31,23,0.95) 0%, rgba(30,22,16,0.95) 100%)",
          border: "1px solid rgba(201,168,106,0.25)",
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
          animation: "mpCardIn 0.4s ease-out both",
        }}
      >
        {/* logo */}
        <div
          className="mx-auto mb-5 w-[72px] h-[72px] rounded-2xl p-2"
          style={{
            background: "#1a1410",
            border: "1px solid rgba(201,168,106,0.3)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <img
            src={APP_ICON}
            alt="Barbershop"
            className="w-full h-full object-contain rounded-xl"
            onError={(e) => ((e.currentTarget.style.display = "none"))}
          />
        </div>

        <div
          className="text-[12px] uppercase mb-6"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            letterSpacing: "0.32em",
            color: accent,
            opacity: 0.85,
          }}
        >
          Barbershop
        </div>

        {/* status icon */}
        <div
          className="mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: accentDim,
            color: accent,
            boxShadow: `0 0 0 8px ${accentDim.replace("0.18", "0.08")}, 0 12px 32px ${accentDim}`,
            animation: "mpPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          }}
        >
          {ok ? <Check size={42} strokeWidth={3} /> : <X size={42} strokeWidth={3} />}
        </div>

        <h1
          className="text-2xl font-bold mb-2 tracking-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {ok ? "Tudo certo!" : "Não foi dessa vez"}
        </h1>
        <p className="text-sm mb-1" style={{ color: "#d4c4ae", opacity: 0.9 }}>
          {ok
            ? "Mercado Pago conectado com sucesso à sua Barbearia."
            : "Não conseguimos concluir a conexão com o Mercado Pago."}
        </p>

        <div
          className="mt-4 mb-7 text-xs leading-relaxed rounded-xl px-4 py-3 text-left break-words"
          style={{
            color: "#a89580",
            opacity: 0.85,
            background: "rgba(0,0,0,0.25)",
            borderLeft: `3px solid ${accent}`,
          }}
        >
          {message}
        </div>

        <Link
          to={returnTo}
          className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-transform hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${ok ? "#b89556" : "#c46647"} 100%)`,
            color: "#1a1410",
            boxShadow: `0 8px 24px ${accentDim}, inset 0 1px 0 rgba(255,255,255,0.2)`,
            letterSpacing: "0.02em",
          }}
        >
          Voltar ao painel
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>

        <div className="mt-4 text-xs" style={{ color: "#a89580", opacity: 0.7 }}>
          Redirecionando em{" "}
          <b style={{ color: accent, fontWeight: 600 }}>{count}</b>s…
        </div>

        <div
          className="mt-6 text-[11px] uppercase"
          style={{ color: "#8a7860", opacity: 0.6, letterSpacing: "0.08em" }}
        >
          Barbershop · Pagamentos Seguros
        </div>
      </div>

      <style>{`
        @keyframes mpPop { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes mpCardIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}
