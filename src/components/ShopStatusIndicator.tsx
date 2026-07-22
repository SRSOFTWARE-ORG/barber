import { useState, useEffect, useMemo } from 'react';
import { useBarbershop } from '@/contexts/BarbershopContext';
import { useAuth } from '@/contexts/AuthContext';

function fmtDelta(ms: number) {
  if (ms <= 0) return '';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m} min`;
}

export default function ShopStatusIndicator() {
  const { settings, getBarberSettings, barberSettingsCache } = useBarbershop();
  const { barberId, role } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [barberSettings, setBarberSettings] = useState(settings);

  useEffect(() => {
    if (barberId) {
      if (barberSettingsCache[barberId]) setBarberSettings(barberSettingsCache[barberId]);
      else getBarberSettings(barberId).then(setBarberSettings);
    } else setBarberSettings(settings);
  }, [barberId, barberSettingsCache, settings]);

  // Tick every 30s for live countdown
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  const info = useMemo(() => {
    const bs = barberSettings;
    if (!bs) return null;
    const day = now.getDay();
    const hour = now.getHours() + now.getMinutes() / 60;
    const isWorkDay = bs.workDays.includes(day);

    // Check manual early-close for today
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let effectiveEnd = bs.endHour;
    if (bs.closedTodayDate === todayStr && bs.closedTodayTime) {
      const [ch, cm] = bs.closedTodayTime.split(':').map(Number);
      const manualEnd = ch + (cm || 0) / 60;
      if (manualEnd < effectiveEnd) effectiveEnd = manualEnd;
    }

    const isOpen = isWorkDay && hour >= bs.startHour && hour < effectiveEnd;

    let delta = 0;
    if (isOpen) {
      const close = new Date(now);
      const eh = Math.floor(effectiveEnd);
      const em = Math.round((effectiveEnd - eh) * 60);
      close.setHours(eh, em, 0, 0);
      delta = close.getTime() - now.getTime();
    } else {
      for (let i = 0; i < 8; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        if (bs.workDays.includes(d.getDay())) {
          d.setHours(bs.startHour, 0, 0, 0);
          if (d.getTime() > now.getTime()) { delta = d.getTime() - now.getTime(); break; }
        }
      }
    }
    return { isOpen, delta, startHour: bs.startHour, endHour: bs.endHour };
  }, [barberSettings, now]);

  const isAdmin = role === 'admin' || role === 'ceo';
  if (!isAdmin && !barberId) return null;
  if (!info) return null;

  const label = info.isOpen ? 'Aberto agora' : 'Fechado';
  const countdown = info.delta > 0
    ? (info.isOpen ? `Fecha em ${fmtDelta(info.delta)}` : `Abre em ${fmtDelta(info.delta)}`)
    : '';

  const fmtHour = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-3">
      <div className="flex items-center gap-2.5">
        <span className={`inline-block w-3 h-3 rounded-full shadow-md ${info.isOpen ? 'bg-green-500 animate-pulse shadow-green-500/60' : 'bg-destructive shadow-destructive/60'}`} />
        <span
          className={`font-display tracking-[0.12em] text-xl sm:text-2xl ${info.isOpen ? 'text-green-500' : 'text-destructive'}`}
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 shadow-inner">
        <span className="text-[10px] uppercase tracking-[0.25em] text-primary/70 font-heading">Horário</span>
        <span className="font-display text-sm tracking-wider text-primary" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
          {fmtHour(info.startHour)} <span className="opacity-60 mx-0.5">—</span> {fmtHour(info.endHour)}
        </span>
      </div>
      {countdown && (
        <span className="font-display text-sm tracking-wide text-primary/85">
          {countdown}
        </span>
      )}
    </div>
  );
}
