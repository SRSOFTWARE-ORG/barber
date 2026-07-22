import { useEffect, useRef } from 'react';

interface SmartPollOptions {
  /** Liga/desliga o polling. */
  enabled: boolean;
  /** Intervalo base entre execuções (ms). */
  interval: number;
  /** Teto do backoff em caso de erros consecutivos (ms). */
  maxInterval?: number;
  /** Dispara uma execução imediata ao habilitar. */
  immediate?: boolean;
}

/**
 * Polling consciente de visibilidade + backoff exponencial.
 *
 * - PAUSA a chamada de rede quando a aba está em segundo plano (`document.hidden`):
 *   evita acordar a sincronização do dispositivo/WhatsApp sem necessidade.
 * - Em caso de ERRO (rede, 401, timeout), aumenta o intervalo progressivamente
 *   (dobrando até o teto), nunca entrando em loop instantâneo de tentativas.
 * - Em caso de SUCESSO, volta ao intervalo base.
 *
 * A função pode lançar para sinalizar erro e acionar o backoff.
 */
export function useSmartPoll(fn: () => Promise<void> | void, opts: SmartPollOptions) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const { enabled, interval, maxInterval = interval * 8, immediate = true } = opts;

  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;
    let cancelled = false;
    let delay = interval;

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = window.setTimeout(tick, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      // Aba em segundo plano: reagenda sem tocar na rede.
      if (typeof document !== 'undefined' && document.hidden) {
        schedule(interval);
        return;
      }
      try {
        await fnRef.current();
        delay = interval; // sucesso → intervalo base
      } catch {
        delay = Math.min(maxInterval, delay * 2); // erro → backoff
      }
      schedule(delay);
    };

    if (immediate) tick();
    else schedule(interval);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, interval, maxInterval, immediate]);
}
