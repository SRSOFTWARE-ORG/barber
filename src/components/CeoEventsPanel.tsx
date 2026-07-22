import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppEvent, type AppEvent } from '@/contexts/AppEventContext';
import {
  CalendarHeart, Plus, Trash2, Pencil, Power, PowerOff, Sparkles, Wand2,
  Upload, X, Check, Clock, Image as ImageIcon, Palette, Eye, Copy, Globe, Film, Repeat,
} from 'lucide-react';

import { toast } from 'sonner';
import {
  ANIMATION_OPTIONS, EVENT_PRESETS, suggestedEvents, presetDates,
  type AnimationType, type EventPreset,
} from '@/lib/event-presets';
import EventAnimation from '@/components/EventAnimation';
import EventVideo, { hasEventVideo } from '@/components/EventVideo';
import { countryCalendar } from '@/lib/country-events';
import { detectCountry, COUNTRIES } from '@/lib/country-locale';

const EMPTY_FORM = {
  id: null as string | null,
  nome: '',
  descricao: '',
  categoria: 'custom',
  emoji: '🎉',
  cor_primaria: '38 55% 55%',
  cor_secundaria: '30 70% 45%',
  banner_texto: '',
  banner_url: '',
  logo_url: '',
  animacao: 'confetti' as AnimationType,
  auto_ativar: false,
  data_inicio: '',
  data_fim: '',
  pais: '' as string,
  recorrente_anual: false,
  video_url_vertical: '',
  video_url_horizontal: '',
  video_url_vertical_webm: '',
  video_url_horizontal_webm: '',
};
type FormState = typeof EMPTY_FORM;

// HSL "h s% l%" <-> hex (para o color picker nativo)
function hslToHex(hsl: string): string {
  const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return '#c9a96e';
  let h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
function hexToHsl(hex: string): string {
  const m = hex.replace('#', '').match(/.{1,2}/g);
  if (!m || m.length < 3) return '38 55% 55%';
  const [r, g, b] = m.map((v) => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

export default function CeoEventsPanel() {
  const { user } = useAuth();
  const { activeEvent, allEvents, reload } = useAppEvent();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'banner' | 'logo' | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { reload(); }, [reload]);

  const country = useMemo(() => detectCountry(), []);
  const suggestions = useMemo(() => countryCalendar(), [allEvents]);
  const existingCats = useMemo(() => new Set(allEvents.map((e) => e.nome.toLowerCase())), [allEvents]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => { setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (e: AppEvent) => {
    setForm({
      id: e.id, nome: e.nome, descricao: e.descricao || '', categoria: e.categoria,
      emoji: e.emoji || '🎉', cor_primaria: e.cor_primaria || '38 55% 55%',
      cor_secundaria: e.cor_secundaria || '30 70% 45%', banner_texto: e.banner_texto || '',
      banner_url: e.banner_url || '', logo_url: e.logo_url || '', animacao: e.animacao,
      auto_ativar: e.auto_ativar, data_inicio: toLocalInput(e.data_inicio), data_fim: toLocalInput(e.data_fim),
      pais: e.pais || '', recorrente_anual: e.recorrente_anual || false,
      video_url_vertical: e.video_url_vertical || '', video_url_horizontal: e.video_url_horizontal || '',
      video_url_vertical_webm: e.video_url_vertical_webm || '', video_url_horizontal_webm: e.video_url_horizontal_webm || '',
    });
    setShowForm(true);
  };

  // Duplica um evento existente (cria uma cópia desativada para editar)
  const duplicateEvent = async (e: AppEvent) => {
    setBusyId(e.id);
    const { error } = await supabase.from('app_events').insert({
      nome: `${e.nome} (cópia)`, descricao: e.descricao, categoria: e.categoria, emoji: e.emoji,
      cor_primaria: e.cor_primaria, cor_secundaria: e.cor_secundaria, banner_texto: e.banner_texto,
      banner_url: e.banner_url, logo_url: e.logo_url, animacao: e.animacao,
      auto_ativar: false, ativo: false, data_inicio: e.data_inicio, data_fim: e.data_fim,
      pais: e.pais, recorrente_anual: e.recorrente_anual,
      mes_inicio: e.mes_inicio, dia_inicio: e.dia_inicio, mes_fim: e.mes_fim, dia_fim: e.dia_fim,
      video_url_vertical: e.video_url_vertical, video_url_horizontal: e.video_url_horizontal,
      video_url_vertical_webm: e.video_url_vertical_webm, video_url_horizontal_webm: e.video_url_horizontal_webm,
    } as any);
    setBusyId(null);
    if (error) { toast.error('Erro ao duplicar: ' + error.message); return; }
    toast.success(`"${e.nome}" duplicado!`);
    reload();
  };

  const createFromPreset = async (p: EventPreset) => {
    const { start, end } = presetDates(p);
    setBusyId(`${p.categoria}|${p.nome}`);
    const { error } = await supabase.from('app_events').insert({
      nome: p.nome, descricao: p.descricao, categoria: p.categoria, emoji: p.emoji,
      cor_primaria: p.cor_primaria, cor_secundaria: p.cor_secundaria, banner_texto: p.banner_texto,
      animacao: p.animacao, auto_ativar: true,
      data_inicio: start.toISOString(), data_fim: end.toISOString(),
    } as any);
    setBusyId(null);
    if (error) { toast.error('Erro ao criar evento: ' + error.message); return; }
    toast.success(`Evento "${p.nome}" criado e agendado!`);
    reload();
  };

  const uploadImg = async (file: File, kind: 'banner' | 'logo') => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx 5MB)'); return; }
    setUploading(kind);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `events/${kind}/${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('gallery').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (!error) {
      const url = supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
      set(kind === 'banner' ? { banner_url: url } : { logo_url: url });
      toast.success('Imagem enviada!');
    } else {
      toast.error('Erro no upload: ' + error.message);
    }
    setUploading(null);
  };

  const uploadVideo = async (
    file: File,
    kind: 'video_url_vertical' | 'video_url_horizontal' | 'video_url_vertical_webm' | 'video_url_horizontal_webm',
  ) => {
    if (!user) return;
    if (file.size > 25 * 1024 * 1024) { toast.error('Vídeo muito grande (máx 25MB)'); return; }
    setUploadingVideo(kind);
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const path = `events/video/${kind}/${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('gallery').upload(path, file, { upsert: true, cacheControl: '31536000' });
    if (!error) {
      const url = supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
      set({ [kind]: url } as Partial<FormState>);
      toast.success('Vídeo enviado!');
    } else {
      toast.error('Erro no upload: ' + error.message);
    }
    setUploadingVideo(null);
  };

  const saveForm = async () => {
    if (!form.nome.trim()) { toast.error('Dê um nome ao evento'); return; }
    if (form.auto_ativar && (!form.data_inicio || !form.data_fim)) {
      toast.error('Defina data inicial e final para a ativação automática'); return;
    }
    setSaving(true);
    const payload: any = {
      nome: form.nome.trim(), descricao: form.descricao.trim() || null, categoria: form.categoria || 'custom',
      emoji: form.emoji || null, cor_primaria: form.cor_primaria, cor_secundaria: form.cor_secundaria,
      banner_texto: form.banner_texto.trim() || null, banner_url: form.banner_url || null,
      logo_url: form.logo_url || null, animacao: form.animacao, auto_ativar: form.auto_ativar,
      data_inicio: form.data_inicio ? new Date(form.data_inicio).toISOString() : null,
      data_fim: form.data_fim ? new Date(form.data_fim).toISOString() : null,
      pais: form.pais || null, recorrente_anual: form.recorrente_anual,
      video_url_vertical: form.video_url_vertical || null,
      video_url_horizontal: form.video_url_horizontal || null,
      video_url_vertical_webm: form.video_url_vertical_webm || null,
      video_url_horizontal_webm: form.video_url_horizontal_webm || null,
    };
    const { error } = form.id
      ? await supabase.from('app_events').update(payload).eq('id', form.id)
      : await supabase.from('app_events').insert(payload);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success(form.id ? 'Evento atualizado!' : 'Evento criado!');
    setShowForm(false); setForm(EMPTY_FORM); reload();
  };

  // Ativa um evento (desativa os demais manuais para ter só 1 tema por vez)
  const toggleActive = async (e: AppEvent) => {
    setBusyId(e.id);
    if (!e.ativo) {
      await supabase.from('app_events').update({ ativo: false }).neq('id', e.id).eq('ativo', true);
    }
    const { error } = await supabase.from('app_events').update({ ativo: !e.ativo }).eq('id', e.id);
    setBusyId(null);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(!e.ativo ? `"${e.nome}" aplicado!` : `"${e.nome}" desativado`);
    reload();
  };

  const removeEvent = async (e: AppEvent) => {
    if (!confirm(`Excluir o evento "${e.nome}"?`)) return;
    setBusyId(e.id);
    const { error } = await supabase.from('app_events').delete().eq('id', e.id);
    setBusyId(null);
    if (error) { toast.error('Erro ao excluir: ' + error.message); return; }
    toast.success('Evento excluído');
    reload();
  };

  return (
    <section className="px-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base text-primary flex items-center gap-2">
          <CalendarHeart size={16} /> Eventos & Temas
        </h2>
        <div className="flex items-center gap-2">
          <Link to="/celebration-preview" className="wood-card px-3 py-1.5 rounded-lg text-xs font-heading flex items-center gap-1">
            <Eye size={14} /> Pré-visualizar
          </Link>
          <button onClick={openNew} className="slot-selected px-3 py-1.5 rounded-lg text-xs font-heading flex items-center gap-1">
            <Plus size={14} /> Novo
          </button>
        </div>
      </div>


      {/* Evento ativo agora */}
      {activeEvent ? (
        <div
          className="rounded-2xl px-4 py-3 flex items-center gap-3 border border-white/10 shadow-lg"
          style={{ background: `linear-gradient(135deg, hsl(${activeEvent.cor_primaria || '38 55% 55%'}), hsl(${activeEvent.cor_secundaria || '30 70% 45%'}))` }}
        >
          <span className="text-3xl">{activeEvent.emoji || '🎉'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-white/80">No ar agora</p>
            <p className="font-heading text-white text-sm truncate">{activeEvent.nome}</p>
          </div>
          <span className="text-[10px] text-white/90 bg-black/20 rounded-full px-2 py-0.5">
            {ANIMATION_OPTIONS.find((a) => a.value === activeEvent.animacao)?.emoji} ao vivo
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-1">Nenhum tema ativo. O app está no visual padrão.</p>
      )}

      {/* Calendário inteligente / sugestões */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading flex items-center gap-1">
          <Sparkles size={12} /> Sugestões automáticas — {country.flagEmoji} {country.name} · 1 clique para agendar
        </p>
        <div className="grid grid-cols-2 gap-2">
          {suggestions.map(({ preset, active, daysUntil }) => {
            const key = `${preset.categoria}|${preset.nome}`;
            const already = existingCats.has(preset.nome.toLowerCase());
            return (
              <button
                key={key}
                disabled={already || busyId === key}
                onClick={() => createFromPreset(preset)}
                className="wood-card px-3 py-2.5 text-left flex items-center gap-2 disabled:opacity-50"
              >
                <span className="text-xl shrink-0">{preset.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-heading text-foreground truncate">{preset.nome}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {already ? 'já criado' : active ? 'acontecendo agora' : `em ${daysUntil} dia(s)`}
                  </p>
                </div>
                {!already && <Plus size={14} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de eventos */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-heading">Meus eventos ({allEvents.length})</p>
        {allEvents.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-3">Nenhum evento ainda. Use as sugestões acima ou crie um novo.</p>
        )}
        {allEvents.map((e) => (
          <div key={e.id} className={`wood-card px-3 py-2.5 ${e.ativo ? 'ring-1 ring-primary/60' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl shrink-0">{e.emoji || '🎉'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-heading text-foreground truncate flex items-center gap-1">
                  {e.nome}
                  {e.ativo && <span className="text-[9px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">ATIVO</span>}
                </p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                  {ANIMATION_OPTIONS.find((a) => a.value === e.animacao)?.label}
                  {e.pais && (
                    <span className="flex items-center gap-0.5 text-primary">
                      <Globe size={9} /> {COUNTRIES[e.pais]?.flagEmoji || ''} {e.pais}
                    </span>
                  )}
                  {e.recorrente_anual && (
                    <span className="flex items-center gap-0.5"><Repeat size={9} /> anual</span>
                  )}
                  {hasEventVideo(e) && (
                    <span className="flex items-center gap-0.5 text-accent"><Film size={9} /> vídeo</span>
                  )}
                  {e.auto_ativar && e.data_inicio && (
                    <span className="flex items-center gap-0.5"><Clock size={9} />
                      {new Date(e.data_inicio).toLocaleDateString('pt-BR')}–{e.data_fim ? new Date(e.data_fim).toLocaleDateString('pt-BR') : '...'}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleActive(e)} disabled={busyId === e.id} title={e.ativo ? 'Desativar' : 'Aplicar agora'}
                  className={e.ativo ? 'text-amber-400' : 'text-emerald-400'}>
                  {e.ativo ? <PowerOff size={17} /> : <Power size={17} />}
                </button>
                <button onClick={() => openEdit(e)} title="Editar" className="text-primary"><Pencil size={15} /></button>
                <button onClick={() => duplicateEvent(e)} disabled={busyId === e.id} title="Duplicar" className="text-muted-foreground"><Copy size={15} /></button>
                <button onClick={() => removeEvent(e)} disabled={busyId === e.id} title="Excluir" className="text-destructive"><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Formulário criar/editar (modal-like) */}
      {showForm && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <div
            className="bg-card w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-3"
            onClick={(ev) => ev.stopPropagation()}
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between sticky -top-4 bg-card pt-1 pb-2 -mt-1 z-10">
              <h3 className="font-heading text-base text-primary flex items-center gap-2">
                <Wand2 size={16} /> {form.id ? 'Editar evento' : 'Novo evento'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground"><X size={20} /></button>
            </div>

            {/* Preview ao vivo */}
            <div className="relative rounded-xl overflow-hidden border border-border" style={{ minHeight: 84 }}>
              <div className="px-3 py-3 flex items-center gap-2" style={{ background: `linear-gradient(135deg, hsl(${form.cor_primaria}), hsl(${form.cor_secundaria}))` }}>
                {form.banner_url ? <img src={form.banner_url} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <span className="text-2xl">{form.emoji}</span>}
                <div className="min-w-0">
                  <p className="text-sm font-heading text-white truncate">{form.banner_texto || form.nome || 'Pré-visualização'}</p>
                  {form.descricao && <p className="text-[10px] text-white/80 truncate">{form.descricao}</p>}
                </div>
              </div>
              {form.animacao !== 'none' && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <EventAnimation type={form.animacao} count={10} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-[3rem_1fr] gap-2">
              <input value={form.emoji} onChange={(e) => set({ emoji: e.target.value })} maxLength={4} className="vintage-input text-center text-xl rounded-lg" placeholder="🎉" />
              <input value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome do evento" className="vintage-input px-3 py-2 rounded-lg text-sm" />
            </div>
            <input value={form.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="Descrição (opcional)" className="vintage-input w-full px-3 py-2 rounded-lg text-sm" />
            <textarea value={form.banner_texto} onChange={(e) => set({ banner_texto: e.target.value })} placeholder="Texto do banner exibido na home" rows={2} className="vintage-input w-full px-3 py-2 rounded-lg text-sm resize-none" />

            {/* Cores */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 wood-card px-2 py-2 rounded-lg text-xs">
                <Palette size={14} className="text-primary" /> Cor 1
                <input type="color" value={hslToHex(form.cor_primaria)} onChange={(e) => set({ cor_primaria: hexToHsl(e.target.value) })} className="ml-auto h-7 w-9 rounded bg-transparent" />
              </label>
              <label className="flex items-center gap-2 wood-card px-2 py-2 rounded-lg text-xs">
                <Palette size={14} className="text-accent" /> Cor 2
                <input type="color" value={hslToHex(form.cor_secundaria)} onChange={(e) => set({ cor_secundaria: hexToHsl(e.target.value) })} className="ml-auto h-7 w-9 rounded bg-transparent" />
              </label>
            </div>

            {/* Animação */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Animação</p>
              <div className="grid grid-cols-4 gap-1.5">
                {ANIMATION_OPTIONS.map((a) => (
                  <button key={a.value} onClick={() => set({ animacao: a.value })}
                    className={`py-1.5 rounded-lg text-[10px] flex flex-col items-center gap-0.5 ${form.animacao === a.value ? 'slot-selected' : 'bg-input/40 text-foreground'}`}>
                    <span className="text-base">{a.emoji}</span>{a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Uploads */}
            <div className="grid grid-cols-2 gap-2">
              {(['banner', 'logo'] as const).map((kind) => (
                <label key={kind} className="wood-card px-2 py-2 rounded-lg text-xs flex items-center gap-2 cursor-pointer">
                  {(kind === 'banner' ? form.banner_url : form.logo_url)
                    ? <img src={kind === 'banner' ? form.banner_url : form.logo_url} alt="" className="h-7 w-7 rounded object-cover" />
                    : <ImageIcon size={16} className="text-primary" />}
                  <span className="capitalize">{uploading === kind ? '...' : kind}</span>
                  <Upload size={13} className="ml-auto text-muted-foreground" />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImg(f, kind); }} />
                </label>
              ))}
            </div>

            {/* País (segmentação por país) */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Globe size={12} /> País do evento</p>
              <select
                value={form.pais}
                onChange={(e) => set({ pais: e.target.value })}
                className="vintage-input w-full px-3 py-2 rounded-lg text-sm"
              >
                <option value="">🌍 Global (todos os países)</option>
                {Object.values(COUNTRIES).map((c) => (
                  <option key={c.code} value={c.code}>{c.flagEmoji} {c.name} ({c.code})</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Eventos nacionais só aparecem para quem está no país escolhido.</p>
            </div>

            {/* Vídeos por orientação (MP4/WebM) — carregados sob demanda */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Film size={12} /> Vídeos do evento (MP4/WebM)</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'video_url_vertical', label: 'Vertical MP4' },
                  { key: 'video_url_horizontal', label: 'Horizontal MP4' },
                  { key: 'video_url_vertical_webm', label: 'Vertical WebM' },
                  { key: 'video_url_horizontal_webm', label: 'Horizontal WebM' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="wood-card px-2 py-2 rounded-lg text-[11px] flex items-center gap-2 cursor-pointer">
                    <Film size={14} className={form[key] ? 'text-emerald-400' : 'text-primary'} />
                    <span className="truncate">{uploadingVideo === key ? '...' : form[key] ? '✓ ' + label : label}</span>
                    <Upload size={12} className="ml-auto text-muted-foreground shrink-0" />
                    <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f, key); }} />
                  </label>
                ))}
              </div>
              {hasEventVideo(form as any) && (
                <div className="mt-2 rounded-xl overflow-hidden border border-border aspect-video bg-black/40">
                  <EventVideo event={form as any} orientation="horizontal" loop muted autoPlay className="h-full w-full" />
                </div>
              )}
            </div>

            {/* Recorrência anual */}
            <label className="flex items-center justify-between wood-card px-3 py-2 rounded-lg text-sm">
              <span className="flex items-center gap-2"><Repeat size={14} className="text-primary" /> Repetir todo ano</span>
              <input type="checkbox" checked={form.recorrente_anual} onChange={(e) => set({ recorrente_anual: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            </label>

            {/* Agendamento */}
            <label className="flex items-center justify-between wood-card px-3 py-2 rounded-lg text-sm">
              <span className="flex items-center gap-2"><Clock size={14} className="text-primary" /> Ativação automática</span>
              <input type="checkbox" checked={form.auto_ativar} onChange={(e) => set({ auto_ativar: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            </label>
            {form.auto_ativar && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Início</p>
                  <input type="datetime-local" value={form.data_inicio} onChange={(e) => set({ data_inicio: e.target.value })} className="vintage-input w-full px-2 py-2 rounded-lg text-xs" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Fim</p>
                  <input type="datetime-local" value={form.data_fim} onChange={(e) => set({ data_fim: e.target.value })} className="vintage-input w-full px-2 py-2 rounded-lg text-xs" />
                </div>
              </div>
            )}

            <button onClick={saveForm} disabled={saving} className="w-full slot-selected py-3 rounded-xl font-heading text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <Check size={16} /> {saving ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Criar evento'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
