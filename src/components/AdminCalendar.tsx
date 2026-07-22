import { useMemo, useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, addMonths, subMonths, format, startOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, UserCheck, CheckCircle, Check, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBarbershop, type Appointment, type Service } from '@/contexts/BarbershopContext';

const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

type StatusKey = Appointment['status'];

// Cor do "traço" do dia conforme o status do agendamento (tokens do tema).
function statusDotClass(status: StatusKey): string {
  switch (status) {
    case 'finalizado': return 'bg-green-500';
    case 'confirmed': return 'bg-blue-400';
    case 'pending': return 'bg-primary';
    default: return 'bg-muted-foreground';
  }
}

function statusBadge(status: StatusKey): { label: string; cls: string } {
  switch (status) {
    case 'finalizado':
      return { label: 'Concluído', cls: 'bg-green-500/20 text-green-400 border border-green-500/30' };
    case 'confirmed':
      return { label: 'Agendado', cls: 'bg-blue-500/20 text-blue-300 border border-blue-400/30' };
    case 'pending':
      return { label: 'Aguardando', cls: 'bg-primary/20 text-primary border border-primary/30' };
    default:
      return { label: status, cls: 'bg-muted text-muted-foreground border border-border/40' };
  }
}

// Soma a duração (min) de um agendamento para calcular o horário de término.
function appointmentDuration(appt: Appointment, services: Service[]): number {
  if (appt.ehFracionado && appt.fase1Duracao && appt.fase2Duracao) {
    return (appt.fase1Duracao || 0) + (appt.esperaDuracao || 0) + (appt.fase2Duracao || 0);
  }
  return appt.serviceIds.reduce((sum, id) => {
    const s = services.find(sv => sv.id === id);
    return sum + (s?.duration || 0);
  }, 0);
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = (time || '00:00').split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

interface Props {
  appointments: Appointment[];
  services: Service[];
}

export default function AdminCalendar({ appointments, services }: Props) {
  const { confirmAppointment, cancelAppointment, finishAppointment, deleteAppointment } = useBarbershop();
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [professional, setProfessional] = useState<string>('all');

  const handleConfirm = (a: Appointment) => {
    confirmAppointment(a.id);
    toast.success('Agendamento confirmado');
  };


  const handleFinish = (a: Appointment) => {
    const input = window.prompt('Valor final cobrado (R$):', String(a.valorPago ?? ''));
    if (input === null) return;
    const valor = parseFloat(input.replace(',', '.'));
    finishAppointment(a.id, isNaN(valor) ? undefined : valor);
    toast.success('Agendamento concluído');
  };

  const handleCancel = (a: Appointment) => {
    if (!window.confirm('Cancelar este agendamento? O horário voltará a ficar disponível.')) return;
    cancelAppointment(a.id);
    toast.success('Agendamento cancelado');
  };

  const handleDelete = async (a: Appointment) => {
    if (!window.confirm('Apagar este agendamento permanentemente?')) return;
    await deleteAppointment(a.id);
    toast.success('Agendamento apagado');
  };

  // Lista de profissionais a partir dos agendamentos disponíveis.
  const professionals = useMemo(() => {
    const map = new Map<string, string>();
    appointments.forEach(a => {
      if (a.barbeiroId) {
        const name = (a.barbeiroNome || '').split('•')[0].trim() || 'Profissional';
        if (!map.has(a.barbeiroId)) map.set(a.barbeiroId, name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [appointments]);

  // Agendamentos visíveis (filtra cancelados e por profissional).
  const visible = useMemo(() => {
    return appointments.filter(a =>
      a.status !== 'cancelled' &&
      (professional === 'all' || a.barbeiroId === professional),
    );
  }, [appointments, professional]);

  // Mapa de status por dia para os traços coloridos.
  const dayStatuses = useMemo(() => {
    const map = new Map<string, StatusKey[]>();
    visible.forEach(a => {
      const arr = map.get(a.date) || [];
      arr.push(a.status);
      map.set(a.date, arr);
    });
    return map;
  }, [visible]);

  // Grade do mês (semanas completas).
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const dayAppts = useMemo(() => {
    return visible
      .filter(a => a.date === selectedKey)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [visible, selectedKey]);

  const today = startOfDay(new Date());

  return (
    <div className="px-4 space-y-4">
      {/* Seletor de profissional */}
      <Select value={professional} onValueChange={setProfessional}>
        <SelectTrigger className="w-full rounded-2xl bg-card border-border/50 h-12 px-4 font-medium">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-primary" />
            <SelectValue placeholder="Profissional" />
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-2xl">
          <SelectItem value="all">Todos os profissionais</SelectItem>
          {professionals.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Card do mês */}
      <div className="bg-card rounded-3xl shadow-lg shadow-black/20 border border-border/40 p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMonth(m => subMonths(m, 1))}
            className="p-2 rounded-full hover:bg-muted/60 text-foreground transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className="font-heading text-base capitalize text-foreground">
            {format(viewMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </h3>
          <button
            onClick={() => setViewMonth(m => addMonths(m, 1))}
            className="p-2 rounded-full hover:bg-muted/60 text-foreground transition-colors"
            aria-label="Próximo mês"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Iniciais dos dias */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_INITIALS.map((d, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Grade de dias */}
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const inMonth = isSameMonth(day, viewMonth);
            const isSelected = isSameDay(day, selectedDate);
            const isPast = day < today;
            const key = format(day, 'yyyy-MM-dd');
            const statuses = dayStatuses.get(key) || [];
            const uniqueStatuses = Array.from(new Set(statuses)).slice(0, 3);

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(startOfDay(day))}
                className="relative flex flex-col items-center justify-start pt-1 h-11"
              >
                <span
                  className={[
                    'flex items-center justify-center w-9 h-9 rounded-full text-sm transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold shadow-md'
                      : !inMonth
                        ? 'text-muted-foreground/30'
                        : isPast
                          ? 'text-muted-foreground/55'
                          : isToday(day)
                            ? 'text-primary font-bold'
                            : 'text-foreground',
                  ].join(' ')}
                >
                  {format(day, 'd')}
                </span>

                {/* Indicador do dia selecionado */}
                {isSelected && (
                  <span className="absolute -bottom-0 h-1 w-4 rounded-full bg-primary" />
                )}

                {/* Traços de agendamentos */}
                {!isSelected && uniqueStatuses.length > 0 && (
                  <span className="absolute bottom-0.5 flex items-center gap-0.5">
                    {uniqueStatuses.map((st, idx) => (
                      <span key={idx} className={`h-1 w-1.5 rounded-full ${statusDotClass(st)}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabeçalho do dia selecionado */}
      <div className="px-1">
        <h2 className="font-heading text-lg text-foreground capitalize leading-tight">
          {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {dayAppts.length === 0
            ? 'Nenhum item neste dia'
            : `${dayAppts.length} ${dayAppts.length === 1 ? 'item' : 'itens'} neste dia`}
        </p>
      </div>

      {/* Lista de agendamentos */}
      <div className="space-y-3">
        {dayAppts.length === 0 && (
          <div className="bg-card rounded-2xl border border-border/40 p-6 text-center">
            <Clock size={22} className="mx-auto text-muted-foreground/60 mb-2" />
            <p className="text-sm text-muted-foreground">Sem compromissos para este dia.</p>
          </div>
        )}

        {dayAppts.map(a => {
          const dur = appointmentDuration(a, services);
          const start = (a.time || '').slice(0, 5);
          const end = dur > 0 ? addMinutesToTime(start, dur) : null;
          const svc = a.serviceIds
            .map(id => services.find(s => s.id === id)?.name)
            .filter(Boolean)
            .join(', ');
          const barberName = (a.barbeiroNome || '').split('•')[0].trim();
          const badge = statusBadge(a.status);
          const obs = a.ehFracionado ? ' (química)' : '';

          return (
            <div
              key={a.id}
              className="relative bg-card rounded-2xl border border-border/40 shadow-md shadow-black/10 p-3.5"
            >
              <div className="flex gap-3.5">
                {/* Horários empilhados */}
                <div className="shrink-0 w-14 flex flex-col items-center justify-center border-r border-border/30 pr-3">
                  <span className="text-base font-bold text-foreground leading-none">{start}</span>
                  {end && (
                    <>
                      <span className="text-[10px] text-muted-foreground my-0.5">—</span>
                      <span className="text-sm font-bold text-muted-foreground leading-none">{end}</span>
                    </>
                  )}
                </div>

                {/* Detalhes */}
                <div className="flex-1 min-w-0 pr-16">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {a.clientName} {a.clientLastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {svc || 'Serviço'}{obs}
                  </p>
                  {barberName && (
                    <p className="text-[11px] text-primary/80 mt-1 truncate">{barberName}</p>
                  )}
                </div>

                {/* Badge de status */}
                <span className={`absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              {/* Ações */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/30">
                {a.status === 'pending' && (
                  <button
                    onClick={() => handleConfirm(a)}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-400/30 hover:bg-blue-500/25 transition-colors"
                  >
                    <Check size={13} /> Confirmar
                  </button>
                )}
                {(a.status === 'pending' || a.status === 'confirmed') && (
                  <>
                    <button
                      onClick={() => handleFinish(a)}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors"
                    >
                      <CheckCircle size={13} /> Concluir
                    </button>
                    <button
                      onClick={() => handleCancel(a)}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border/40 hover:bg-muted/70 transition-colors"
                    >
                      <X size={13} /> Cancelar
                    </button>
                  </>
                )}
                {a.status === 'finalizado' && (
                  <button
                    onClick={() => handleFinish(a)}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border/40 hover:bg-muted/70 transition-colors"
                  >
                    <Clock size={13} /> Editar valor
                  </button>
                )}
                <button
                  onClick={() => handleDelete(a)}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition-colors ml-auto"
                >
                  <Trash2 size={13} /> Apagar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
