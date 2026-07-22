// Catálogo de eventos/temas sazonais sugeridos automaticamente.
// O CEO confirma com 1 clique e o app aplica banner + animação para todos.

export type AnimationType =
  | 'none' | 'snow' | 'fireworks' | 'confetti' | 'stars'
  | 'lights' | 'balloons' | 'flags' | 'easter' | 'leaves' | 'coins';

export const ANIMATION_OPTIONS: { value: AnimationType; label: string; emoji: string }[] = [
  { value: 'none', label: 'Nenhuma', emoji: '🚫' },
  { value: 'snow', label: 'Neve', emoji: '❄️' },
  { value: 'fireworks', label: 'Fogos', emoji: '🎆' },
  { value: 'confetti', label: 'Confetes', emoji: '🎊' },
  { value: 'stars', label: 'Estrelas', emoji: '⭐' },
  { value: 'lights', label: 'Luzes', emoji: '✨' },
  { value: 'balloons', label: 'Balões', emoji: '🎈' },
  { value: 'flags', label: 'Bandeiras', emoji: '🚩' },
  { value: 'easter', label: 'Ovos de Páscoa', emoji: '🥚' },
  { value: 'leaves', label: 'Folhas', emoji: '🍂' },
  { value: 'coins', label: 'Chuva de moedas', emoji: '🪙' },
];

export interface EventPreset {
  categoria: string;
  nome: string;
  descricao: string;
  emoji: string;
  cor_primaria: string;   // HSL "h s% l%"
  cor_secundaria: string;
  animacao: AnimationType;
  banner_texto: string;
  // Período no ano (mês/dia). Para datas móveis usamos aproximação.
  start: { m: number; d: number };
  end: { m: number; d: number };
}

export const EVENT_PRESETS: EventPreset[] = [
  { categoria: 'natal', nome: 'Natal', descricao: 'Tema natalino', emoji: '🎄', cor_primaria: '0 72% 45%', cor_secundaria: '142 60% 35%', animacao: 'snow', banner_texto: '🎄 Feliz Natal! Horários especiais de fim de ano.', start: { m: 12, d: 1 }, end: { m: 12, d: 26 } },
  { categoria: 'ano-novo', nome: 'Ano Novo', descricao: 'Virada de ano', emoji: '🎆', cor_primaria: '45 90% 55%', cor_secundaria: '220 60% 50%', animacao: 'fireworks', banner_texto: '🎆 Feliz Ano Novo! Comece o ano com estilo.', start: { m: 12, d: 27 }, end: { m: 1, d: 5 } },
  { categoria: 'carnaval', nome: 'Carnaval', descricao: 'Folia de carnaval', emoji: '🎭', cor_primaria: '320 80% 55%', cor_secundaria: '50 95% 55%', animacao: 'confetti', banner_texto: '🎭 Carnaval chegando! Garanta seu corte antes da folia.', start: { m: 2, d: 8 }, end: { m: 2, d: 18 } },
  { categoria: 'pascoa', nome: 'Páscoa', descricao: 'Páscoa', emoji: '🐰', cor_primaria: '275 50% 60%', cor_secundaria: '150 50% 55%', animacao: 'easter', banner_texto: '🐰 Feliz Páscoa!', start: { m: 3, d: 25 }, end: { m: 4, d: 5 } },
  { categoria: 'dia-trabalhador', nome: 'Dia do Trabalhador', descricao: '1º de Maio', emoji: '🛠️', cor_primaria: '210 60% 45%', cor_secundaria: '30 70% 50%', animacao: 'none', banner_texto: '🛠️ Feliz Dia do Trabalhador!', start: { m: 4, d: 28 }, end: { m: 5, d: 2 } },
  { categoria: 'dia-maes', nome: 'Dia das Mães', descricao: 'Homenagem às mães', emoji: '💐', cor_primaria: '340 70% 60%', cor_secundaria: '320 60% 70%', animacao: 'confetti', banner_texto: '💐 Feliz Dia das Mães!', start: { m: 5, d: 8 }, end: { m: 5, d: 12 } },
  { categoria: 'namorados', nome: 'Dia dos Namorados', descricao: 'Romance', emoji: '❤️', cor_primaria: '350 80% 55%', cor_secundaria: '0 70% 45%', animacao: 'confetti', banner_texto: '❤️ Dia dos Namorados — fique no ponto pro date.', start: { m: 6, d: 8 }, end: { m: 6, d: 13 } },
  { categoria: 'festa-junina', nome: 'Festa Junina', descricao: 'Arraiá', emoji: '🌽', cor_primaria: '30 85% 50%', cor_secundaria: '50 90% 50%', animacao: 'flags', banner_texto: '🌽 Arraiá chegou! Bora ficar no capricho.', start: { m: 6, d: 1 }, end: { m: 6, d: 30 } },
  { categoria: 'dia-pais', nome: 'Dia dos Pais', descricao: 'Homenagem aos pais', emoji: '👔', cor_primaria: '210 50% 40%', cor_secundaria: '200 60% 50%', animacao: 'none', banner_texto: '👔 Feliz Dia dos Pais!', start: { m: 8, d: 7 }, end: { m: 8, d: 11 } },
  { categoria: 'independencia', nome: 'Independência do Brasil', descricao: '7 de Setembro', emoji: '🇧🇷', cor_primaria: '142 70% 35%', cor_secundaria: '50 90% 50%', animacao: 'flags', banner_texto: '🇧🇷 Viva a Independência!', start: { m: 9, d: 5 }, end: { m: 9, d: 8 } },
  { categoria: 'criancas', nome: 'Dia das Crianças', descricao: '12 de Outubro', emoji: '🧸', cor_primaria: '195 80% 55%', cor_secundaria: '45 90% 55%', animacao: 'balloons', banner_texto: '🧸 Dia das Crianças — corte infantil em destaque!', start: { m: 10, d: 10 }, end: { m: 10, d: 13 } },
  { categoria: 'outubro-rosa', nome: 'Outubro Rosa', descricao: 'Conscientização', emoji: '🎗️', cor_primaria: '330 75% 60%', cor_secundaria: '320 60% 70%', animacao: 'none', banner_texto: '🎗️ Outubro Rosa — cuide da saúde.', start: { m: 10, d: 1 }, end: { m: 10, d: 31 } },
  { categoria: 'halloween', nome: 'Halloween', descricao: 'Dia das Bruxas', emoji: '🎃', cor_primaria: '25 90% 50%', cor_secundaria: '270 50% 40%', animacao: 'leaves', banner_texto: '🎃 Halloween — venha pro corte assustadoramente bom!', start: { m: 10, d: 25 }, end: { m: 10, d: 31 } },
  { categoria: 'novembro-azul', nome: 'Novembro Azul', descricao: 'Conscientização', emoji: '💙', cor_primaria: '210 75% 50%', cor_secundaria: '200 60% 45%', animacao: 'none', banner_texto: '💙 Novembro Azul — cuide da sua saúde.', start: { m: 11, d: 1 }, end: { m: 11, d: 30 } },
  { categoria: 'consciencia-negra', nome: 'Consciência Negra', descricao: '20 de Novembro', emoji: '✊🏿', cor_primaria: '20 70% 45%', cor_secundaria: '45 80% 50%', animacao: 'none', banner_texto: '✊🏿 Dia da Consciência Negra.', start: { m: 11, d: 18 }, end: { m: 11, d: 21 } },
  { categoria: 'black-friday', nome: 'Black Friday', descricao: 'Promoções', emoji: '🛍️', cor_primaria: '0 0% 10%', cor_secundaria: '45 90% 55%', animacao: 'coins', banner_texto: '🛍️ Black Friday — ofertas imperdíveis!', start: { m: 11, d: 25 }, end: { m: 11, d: 30 } },
  { categoria: 'thanksgiving', nome: 'Thanksgiving', descricao: 'Ação de Graças', emoji: '🦃', cor_primaria: '28 75% 45%', cor_secundaria: '40 80% 50%', animacao: 'leaves', banner_texto: '🦃 Happy Thanksgiving!', start: { m: 11, d: 25 }, end: { m: 11, d: 28 } },
  { categoria: 'copa', nome: 'Copa do Mundo', descricao: 'Futebol', emoji: '⚽', cor_primaria: '142 70% 35%', cor_secundaria: '50 90% 50%', animacao: 'flags', banner_texto: '⚽ É Copa! Bora torcer no capricho.', start: { m: 6, d: 1 }, end: { m: 7, d: 20 } },
  { categoria: 'olimpiadas', nome: 'Olimpíadas', descricao: 'Jogos Olímpicos', emoji: '🏅', cor_primaria: '210 70% 50%', cor_secundaria: '45 90% 55%', animacao: 'stars', banner_texto: '🏅 Olimpíadas — espírito de campeão!', start: { m: 7, d: 20 }, end: { m: 8, d: 12 } },
];

// Constrói datas reais (ano corrente) a partir do preset, lidando com viradas de ano.
export function presetDates(p: EventPreset, year = new Date().getFullYear()) {
  const start = new Date(year, p.start.m - 1, p.start.d, 0, 0, 0);
  let endYear = year;
  // Se o fim é "antes" do início no calendário, cruza o ano (ex.: Ano Novo).
  if (p.end.m < p.start.m || (p.end.m === p.start.m && p.end.d < p.start.d)) {
    endYear = year + 1;
  }
  const end = new Date(endYear, p.end.m - 1, p.end.d, 23, 59, 59);
  return { start, end };
}

// Sugestões ordenadas pela proximidade da data de início (próximos eventos primeiro).
export function suggestedEvents(now = new Date()) {
  return EVENT_PRESETS
    .map((p) => {
      const { start, end } = presetDates(p);
      // Se já passou, considera o próximo ano
      let s = start, e = end;
      if (e < now) {
        const next = presetDates(p, now.getFullYear() + 1);
        s = next.start; e = next.end;
      }
      const active = now >= s && now <= e;
      const daysUntil = Math.ceil((s.getTime() - now.getTime()) / 86400000);
      return { preset: p, start: s, end: e, active, daysUntil };
    })
    .sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return a.daysUntil - b.daysUntil;
    });
}
