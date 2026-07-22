// Categorias de serviços. A categoria é persistida no banco (coluna `categoria`),
// mas quando ela estiver ausente inferimos a partir do nome do serviço.
// Usado nos chips de filtro e nas badges das telas de Serviços e Agendamento,
// e no select dos formulários de criação/edição de serviço no Admin.

export type ServiceCategory =
  | 'Todos'
  | 'CORTES'
  | 'BARBA'
  | 'QUÍMICA'
  | 'TRATAMENTO & ESTÉTICA'
  | 'COMBOS'
  | 'Outros';

// Usado nos chips de filtro (inclui "Todos").
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Todos',
  'CORTES',
  'BARBA',
  'QUÍMICA',
  'TRATAMENTO & ESTÉTICA',
  'COMBOS',
  'Outros',
];

// Usado no <select> dos formulários (sem "Todos").
export const SERVICE_CATEGORY_OPTIONS: Exclude<ServiceCategory, 'Todos'>[] = [
  'CORTES',
  'BARBA',
  'QUÍMICA',
  'TRATAMENTO & ESTÉTICA',
  'COMBOS',
  'Outros',
];

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Infere a categoria de um serviço a partir do nome (fallback quando não há categoria salva). */
export function inferServiceCategory(name: string): Exclude<ServiceCategory, 'Todos'> {
  const n = norm(name);

  // Combo: nome explícito ou "+"
  if (/(combo|completo|\+)/.test(n)) return 'COMBOS';

  // Química / coloração
  if (/(progressiv|selage|relaxa|tintura|colora|colorimetr|luzes|mechas|platinad|nevou|descolora|reflexo|quimic|pigmentac)/.test(n)) {
    return 'QUÍMICA';
  }

  // Tratamento & estética
  if (/(hidrata|nutri|lavagem|limpeza|sobrance|sombrace|sombrasel|design|tratament|selage)/.test(n)) {
    return 'TRATAMENTO & ESTÉTICA';
  }

  // Barba
  if (/(barba|cavanhaque|barboterap|bigode)/.test(n)) return 'BARBA';

  // Cortes
  if (/(corte|cabelo|degrade|fade|maquina|tesoura|social|americano|infantil|navalhad|disfarc|pezinho|acabamento|freestyle|raspad|desenho|risco)/.test(n)) {
    return 'CORTES';
  }

  return 'Outros';
}

/** Resolve a categoria efetiva de um serviço (usa a salva, com fallback na inferência). */
export function resolveServiceCategory(svc: { name: string; categoria?: string | null }): Exclude<ServiceCategory, 'Todos'> {
  const saved = (svc.categoria || '').trim();
  if (saved && SERVICE_CATEGORY_OPTIONS.includes(saved as any)) {
    return saved as Exclude<ServiceCategory, 'Todos'>;
  }
  return inferServiceCategory(svc.name);
}

/** Filtra serviços por categoria + termo de busca, removendo duplicados (por id e por nome). */
export function filterServices<T extends { id?: string; name: string; categoria?: string | null }>(
  list: T[],
  category: ServiceCategory,
  search: string,
): T[] {
  const term = norm(search.trim());
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: T[] = [];

  for (const s of list) {
    // Dedup por id e por nome normalizado (mesmo estabelecimento não repete serviço)
    const id = s.id ? String(s.id) : '';
    const nameKey = norm(s.name);
    if (id && seenIds.has(id)) continue;
    if (seenNames.has(nameKey)) continue;

    const matchCat = category === 'Todos' || resolveServiceCategory(s) === category;
    const matchTerm = !term || nameKey.includes(term);
    if (!matchCat || !matchTerm) continue;

    if (id) seenIds.add(id);
    seenNames.add(nameKey);
    result.push(s);
  }

  return result;
}

/** Remove duplicados de uma lista de serviços (por id e por nome), preservando a ordem. */
export function dedupeServices<T extends { id?: string; name: string }>(list: T[]): T[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: T[] = [];
  for (const s of list) {
    const id = s.id ? String(s.id) : '';
    const nameKey = norm(s.name);
    if (id && seenIds.has(id)) continue;
    if (seenNames.has(nameKey)) continue;
    if (id) seenIds.add(id);
    seenNames.add(nameKey);
    result.push(s);
  }
  return result;
}
