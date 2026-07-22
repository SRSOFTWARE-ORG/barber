import { useState, useEffect, useRef } from 'react';
import splashArt from '@/assets/splash-art.png';
import { useAppEvent } from '@/contexts/AppEventContext';
import EventCelebration from '@/components/EventCelebration';

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const { activeEvent } = useAppEvent();
  const [phase, setPhase] = useState<'splash' | 'celebration'>('splash');
  const [fading, setFading] = useState(false);
  const decidedRef = useRef(false);

  // Se houver um evento sazonal ativo, a tela de entrada vira a celebração dele.
  // Caso contrário, mostra a splash padrão. Quando o evento é retirado/encerra,
  // activeEvent é null e tudo volta ao normal.
  useEffect(() => {
    if (decidedRef.current) return;
    if (activeEvent) {
      decidedRef.current = true;
      setPhase('celebration');
    }
  }, [activeEvent]);

  // Timer da splash padrão (só roda enquanto nenhum evento foi decidido).
  useEffect(() => {
    if (phase !== 'splash') return;
    const fadeTimer = setTimeout(() => setFading(true), 2500);
    const doneTimer = setTimeout(() => {
      if (!decidedRef.current) onFinish();
    }, 3200);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [phase, onFinish]);

  if (phase === 'celebration' && activeEvent) {
    return <EventCelebration event={activeEvent} onClose={onFinish} duration={6500} />;
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] w-screen h-screen m-0 p-0 transition-opacity duration-700 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#1a1614' }}
    >
      {/* Full-screen splash art */}
      <img
        src={splashArt}
        alt="Barbearia Classic"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Spinner overlay */}
      <div className="absolute inset-x-0 bottom-24 flex justify-center z-10">
        <div className="w-8 h-8 border-2 border-[#c9a96e]/30 border-t-[#c9a96e] rounded-full animate-spin" />
      </div>
    </div>
  );
}
