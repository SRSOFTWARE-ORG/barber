import { useState, useEffect, useMemo } from 'react';
import { Cake, Phone, MessageCircle, CalendarDays, CalendarRange, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BirthdayClient {
  id: string;
  full_name: string | null;
  telefone: string | null;
  avatar_url: string | null;
  data_nascimento: string | null;
}

// Parse 'YYYY-MM-DD' safely into {month (1-12), day}
function parseBirth(d: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

// Next occurrence of this birthday (this year or next), as a Date at local midnight
function nextBirthday(month: number, day: number, ref: Date): Date {
  const year = ref.getFullYear();
  let next = new Date(year, month - 1, day);
  const refMidnight = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (next < refMidnight) next = new Date(year + 1, month - 1, day);
  return next;
}

function ageTurning(birthYear: number, onDate: Date): number {
  return onDate.getFullYear() - birthYear;
}

export default function BirthdayPanel() {
  const { user, role, shopDisplayName } = useAuth();
  const [clients, setClients] = useState<BirthdayClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      let query = supabase
        .from('profiles')
        .select('id, full_name, telefone, avatar_url, data_nascimento')
        .not('data_nascimento', 'is', null);

      if (role !== 'ceo') {
        query = query.eq('adm_responsavel_id', user.id);
      }
      const { data } = await query;

      let list = (data || []) as BirthdayClient[];
      if (role === 'ceo') {
        // Exclude staff (admins/ceo) from the birthday client list
        const { data: roles } = await supabase.from('user_roles').select('user_id');
        const roleIds = new Set((roles || []).map((r) => r.user_id));
        list = list.filter((c) => !roleIds.has(c.id));
      }
      setClients(list);
      setLoading(false);
    };
    load();
  }, [user?.id, role]);

  const { today, week, month } = useMemo(() => {
    const now = new Date();
    const todayM = now.getMonth() + 1;
    const todayD = now.getDate();
    const in7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);

    const decorated = clients
      .map((c) => {
        const parsed = c.data_nascimento ? parseBirth(c.data_nascimento) : null;
        if (!parsed) return null;
        const next = nextBirthday(parsed.month, parsed.day, now);
        return { client: c, ...parsed, next };
      })
      .filter(Boolean) as { client: BirthdayClient; month: number; day: number; next: Date }[];

    const today = decorated
      .filter((x) => x.month === todayM && x.day === todayD)
      .sort((a, b) => (a.client.full_name || '').localeCompare(b.client.full_name || ''));

    const week = decorated
      .filter((x) => x.next >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && x.next <= in7)
      .sort((a, b) => a.next.getTime() - b.next.getTime());

    const monthList = decorated
      .filter((x) => x.month === todayM)
      .sort((a, b) => a.day - b.day);

    return { today, week, month: monthList };
  }, [clients]);

  const getWhatsAppLink = (phone: string, name: string) => {
    const digits = phone.replace(/\D/g, '');
    const brPhone = digits.startsWith('55') ? digits : `55${digits}`;
    const firstName = (name || '').split(' ')[0] || '';
    const msg = encodeURIComponent(
      `Olá ${firstName}! 🎉 A equipe da ${shopDisplayName} deseja um feliz aniversário! 🥳 Passa aqui pra comemorar com um corte especial. 💈`,
    );
    return `https://wa.me/${brPhone}?text=${msg}`;
  };

  const Row = ({ item }: { item: { client: BirthdayClient; day: number; month: number; next: Date } }) => {
    const c = item.client;
    const parsed = c.data_nascimento ? /^(\d{4})/.exec(c.data_nascimento) : null;
    const birthYear = parsed ? Number(parsed[1]) : null;
    const turning = birthYear ? ageTurning(birthYear, item.next) : null;
    return (
      <div className="wood-card px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
          {c.avatar_url ? (
            <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-muted-foreground text-sm font-heading">{(c.full_name || '?')[0]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{c.full_name || 'Sem nome'}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <Cake size={10} className="text-primary" />
              {String(item.day).padStart(2, '0')}/{String(item.month).padStart(2, '0')}
            </span>
            {turning != null && turning > 0 && turning < 130 && (
              <span className="text-primary">• faz {turning} anos</span>
            )}
            {c.telefone && (
              <span className="flex items-center gap-1">
                <Phone size={10} /> {c.telefone}
              </span>
            )}
          </p>
        </div>
        {c.telefone && (
          <a
            href={getWhatsAppLink(c.telefone, c.full_name || '')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-500 p-2"
            title="Parabenizar no WhatsApp"
          >
            <MessageCircle size={18} />
          </a>
        )}
      </div>
    );
  };

  const Section = ({
    title,
    icon,
    items,
    empty,
    accent,
  }: {
    title: string;
    icon: React.ReactNode;
    items: { client: BirthdayClient; day: number; month: number; next: Date }[];
    empty: string;
    accent?: boolean;
  }) => (
    <div className="px-4">
      <h3 className="font-heading text-base text-foreground flex items-center gap-2 mb-3">
        {icon}
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-center text-muted-foreground py-4 text-sm">{empty}</p>
      ) : (
        <div className={`space-y-2 ${accent ? 'rounded-xl' : ''}`}>
          {items.map((x) => (
            <Row key={x.client.id} item={x} />
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return <p className="text-center text-muted-foreground py-8 animate-pulse">Carregando aniversariantes...</p>;
  }

  return (
    <div className="space-y-6">
      <Section
        title="Aniversariantes de hoje"
        icon={<PartyPopper size={16} className="text-primary" />}
        items={today}
        empty="Nenhum aniversariante hoje."
        accent
      />
      <Section
        title="Próximos 7 dias"
        icon={<CalendarDays size={16} className="text-primary" />}
        items={week}
        empty="Ninguém faz aniversário nesta semana."
      />
      <Section
        title="Aniversariantes do mês"
        icon={<CalendarRange size={16} className="text-primary" />}
        items={month}
        empty="Nenhum aniversariante neste mês."
      />
    </div>
  );
}
