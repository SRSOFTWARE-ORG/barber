// Toque curto para notificações in-app (não depende de arquivo de áudio)
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Reproduz um "ding" suave de duas notas. */
export function playNotifSound() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const notes = [880, 1320]; // A5, E6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ac.destination);
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.start(start);
    osc.stop(start + 0.3);
  });
  // Vibração tátil (mobile)
  try { navigator.vibrate?.([80, 40, 80]); } catch {}
}

// Pré-aquece o contexto após primeira interação do usuário (necessário em iOS/Safari)
let primed = false;
export function primeAudioOnFirstGesture() {
  if (primed || typeof window === 'undefined') return;
  primed = true;
  const handler = () => {
    getCtx();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('touchstart', handler);
  };
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('keydown', handler);
  window.addEventListener('touchstart', handler, { passive: true });
}
