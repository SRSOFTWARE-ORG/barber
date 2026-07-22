import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Posições de scroll por entrada de histórico (chave da location).
const positions = new Map<string, number>();

/**
 * Restaura o scroll ao voltar (botão "Voltar" / gesto do navegador):
 * - PUSH/REPLACE (navegação para frente) → vai para o topo da nova tela.
 * - POP (voltar) → restaura exatamente onde o usuário estava, sem subir ao topo.
 */
export default function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'REPLACE' | 'POP'

  // Salva continuamente a posição da entrada atual do histórico.
  useEffect(() => {
    const key = location.key;
    const save = () => positions.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      save();
      window.removeEventListener('scroll', save);
    };
  }, [location.key]);

  useEffect(() => {
    if (navType === 'POP') {
      // Voltar: restaura a posição anterior (em dois frames para aguardar o layout).
      const saved = positions.get(location.key) ?? 0;
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved, left: 0, behavior: 'instant' as ScrollBehavior });
        requestAnimationFrame(() => {
          window.scrollTo({ top: saved, left: 0, behavior: 'instant' as ScrollBehavior });
        });
      });
    } else {
      // Navegação nova: começa do topo.
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [location.key, navType]);

  return null;
}
