// Pequeno store global para controlar a visibilidade da dock (barra inferior).
// Usado por telas que precisam esconder a dock temporariamente (ex.: modal de
// serviço, fluxo de convite) e restaurá-la ao sair, sem prop drilling.

let hidden = false;
const listeners = new Set<() => void>();

export function setDockHidden(value: boolean) {
  if (hidden === value) return;
  hidden = value;
  listeners.forEach((l) => l());
}

export function getDockHidden() {
  return hidden;
}

export function subscribeDock(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
