import { useAppEvent } from '@/contexts/AppEventContext';
import EventAnimation from '@/components/EventAnimation';

// Renderiza apenas a animação ambiente (sutil) do evento ativo na navegação.
// A celebração em TELA CHEIA não fica mais aqui: ela acontece somente na tela
// de entrada do app (ver SplashScreen).
export default function EventOverlay() {
  const { activeEvent } = useAppEvent();

  if (!activeEvent || activeEvent.animacao === 'none') return null;
  return <EventAnimation type={activeEvent.animacao} />;
}
