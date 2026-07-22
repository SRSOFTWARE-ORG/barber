import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { cleanupPreviewServiceWorkers, isPreviewPwaContext } from "@/lib/pwa-updater";

// Registro do Service Worker e UI de "Nova versão disponível" agora ficam no
// componente <UpdatePrompt /> (src/components/UpdatePrompt.tsx), usando o
// hook useRegisterSW do vite-plugin-pwa. Isso evita duplo registro.

if (isPreviewPwaContext()) {
  cleanupPreviewServiceWorkers().catch(() => undefined);
}

// Auto-recuperação de "chunk perdido": quando o index.html em cache aponta para
// um chunk JS que não existe mais (após um novo deploy), o import dinâmico falha
// e a tela fica em branco. Aqui limpamos caches e recarregamos UMA vez.
if (typeof window !== "undefined") {
  const RELOAD_FLAG = "chunk-reload-attempt";

  const recoverFromChunkError = async () => {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const isChunkError = (msg: string) =>
    /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
      msg
    );

  // Evento oficial do Vite para falha de preload de import dinâmico.
  window.addEventListener("vite:preloadError", () => {
    void recoverFromChunkError();
  });

  window.addEventListener("error", (event) => {
    if (isChunkError(String(event?.message || ""))) void recoverFromChunkError();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = String((event?.reason as { message?: string })?.message || event?.reason || "");
    if (isChunkError(msg)) void recoverFromChunkError();
  });

  // App carregou com sucesso: limpa a flag para permitir futuras recuperações.
  window.addEventListener("load", () => {
    window.setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);
  });
}

// Quando o novo SW assume o controle, recarrega a página automaticamente
if ("serviceWorker" in navigator && !isPreviewPwaContext()) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// Bloqueia zoom (pinch, double-tap, ctrl+wheel) em iOS/Android/desktop
if (typeof window !== "undefined") {
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("gesturechange", (e) => e.preventDefault());
  document.addEventListener("gestureend", (e) => e.preventDefault());

  let lastTouch = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouch <= 350) e.preventDefault();
      lastTouch = now;
    },
    { passive: false }
  );

  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
