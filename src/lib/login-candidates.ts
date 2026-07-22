// Resolve os possíveis e-mails de login a partir do que o usuário digitou.
// Suporta todos os tipos de conta (cliente, barbeiro/barbearia, CEO) e também
// e-mails reais (Google/Apple ou cadastros antigos).

const slugify = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

/** E-mail de cliente derivado de um nome. Usado no cadastro de clientes. */
export const nameToClientEmail = (name: string) => `${slugify(name)}@cliente.barbershop.app`;

/**
 * Constrói a lista de e-mails candidatos para tentativa de login, em ordem
 * de prioridade. Tentamos cada um até um funcionar — assim o MESMO formulário
 * loga cliente, barbeiro, barbearia e CEO sem o usuário precisar escolher o tipo.
 */
export function buildLoginCandidates(input: string): string[] {
  const raw = input.trim().toLowerCase();
  if (!raw) return [];

  // 1. Se o usuário digitou um e-mail completo, tenta exatamente como digitado.
  if (raw.includes('@')) {
    return [raw];
  }

  const slug = slugify(raw);
  if (!slug) return [];

  // 2. Sem "@": tenta os formatos internos de cada tipo de conta.
  //    - clientes usam @cliente.barbershop.app
  //    - admins (barbeiro/barbearia) e CEO usam @barbershop.app
  return [
    `${slug}@cliente.barbershop.app`,
    `${slug}@barbershop.app`,
  ];
}
