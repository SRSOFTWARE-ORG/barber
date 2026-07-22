import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBarberTheme, DEFAULT_THEME } from '@/contexts/ThemeContext';
import { toast } from 'sonner';
import { Palette, Image as ImageIcon, RotateCcw, Save, Upload, Link2, MessageCircle, Sparkles, Eye, Check } from 'lucide-react';
import { AMENITIES } from '@/lib/amenities';

// ===== Presets de tema gerados por IA (sem bugs, contraste validado) =====
const THEME_PRESETS: { id: string; name: string; emoji: string; colors: Record<string, string> }[] = [
  {
    id: 'vintage-wood', name: 'Vintage Madeira', emoji: '🪵',
    colors: { background: '25 30% 12%', foreground: '38 45% 85%', card: '25 35% 18%', 'card-foreground': '38 45% 85%', primary: '38 55% 55%', 'primary-foreground': '25 40% 10%', secondary: '25 30% 25%', accent: '30 70% 45%', 'accent-foreground': '38 45% 90%', border: '30 25% 28%', input: '25 25% 22%' },
  },
  {
    id: 'dark-mono', name: 'Dark Mono', emoji: '⚫',
    colors: { background: '0 0% 8%', foreground: '0 0% 92%', card: '0 0% 14%', 'card-foreground': '0 0% 92%', primary: '0 0% 88%', 'primary-foreground': '0 0% 10%', secondary: '0 0% 20%', accent: '0 0% 70%', 'accent-foreground': '0 0% 10%', border: '0 0% 26%', input: '0 0% 18%' },
  },
  {
    id: 'midnight-indigo', name: 'Midnight Indigo', emoji: '🌌',
    colors: { background: '240 30% 8%', foreground: '230 30% 92%', card: '240 35% 14%', 'card-foreground': '230 30% 92%', primary: '243 75% 65%', 'primary-foreground': '0 0% 100%', secondary: '240 25% 22%', accent: '262 70% 60%', 'accent-foreground': '0 0% 100%', border: '240 20% 28%', input: '240 25% 18%' },
  },
  {
    id: 'emerald-prestige', name: 'Emerald Prestige', emoji: '💚',
    colors: { background: '160 40% 8%', foreground: '40 30% 92%', card: '160 35% 14%', 'card-foreground': '40 30% 92%', primary: '45 70% 55%', 'primary-foreground': '160 40% 10%', secondary: '160 30% 22%', accent: '160 60% 45%', 'accent-foreground': '0 0% 100%', border: '160 25% 28%', input: '160 25% 18%' },
  },
  {
    id: 'ocean-deep', name: 'Ocean Deep', emoji: '🌊',
    colors: { background: '210 50% 10%', foreground: '200 30% 92%', card: '210 45% 16%', 'card-foreground': '200 30% 92%', primary: '195 70% 55%', 'primary-foreground': '210 50% 10%', secondary: '210 35% 24%', accent: '180 60% 50%', 'accent-foreground': '210 50% 10%', border: '210 30% 28%', input: '210 30% 20%' },
  },
  {
    id: 'charcoal-ember', name: 'Charcoal & Ember', emoji: '🔥',
    colors: { background: '0 0% 10%', foreground: '20 25% 92%', card: '0 0% 16%', 'card-foreground': '20 25% 92%', primary: '14 78% 56%', 'primary-foreground': '0 0% 100%', secondary: '0 0% 22%', accent: '24 80% 55%', 'accent-foreground': '0 0% 100%', border: '0 0% 28%', input: '0 0% 18%' },
  },
  {
    id: 'noir-gold', name: 'Noir & Gold', emoji: '✨',
    colors: { background: '0 0% 5%', foreground: '45 30% 90%', card: '0 0% 11%', 'card-foreground': '45 30% 90%', primary: '43 65% 55%', 'primary-foreground': '0 0% 5%', secondary: '0 0% 18%', accent: '45 75% 60%', 'accent-foreground': '0 0% 5%', border: '45 15% 22%', input: '0 0% 14%' },
  },
  {
    id: 'light-clean', name: 'Light Clean', emoji: '☀️',
    colors: { background: '0 0% 98%', foreground: '220 15% 15%', card: '0 0% 100%', 'card-foreground': '220 15% 15%', primary: '221 75% 50%', 'primary-foreground': '0 0% 100%', secondary: '220 15% 92%', accent: '221 80% 55%', 'accent-foreground': '0 0% 100%', border: '220 15% 85%', input: '0 0% 96%' },
  },
  {
    id: 'slate-steel', name: 'Slate Steel', emoji: '🪨',
    colors: { background: '220 15% 12%', foreground: '220 15% 90%', card: '220 18% 18%', 'card-foreground': '220 15% 90%', primary: '210 40% 70%', 'primary-foreground': '220 15% 12%', secondary: '220 15% 25%', accent: '210 50% 60%', 'accent-foreground': '220 15% 12%', border: '220 12% 30%', input: '220 15% 20%' },
  },
];

// ===== Helpers de conversão HEX <-> HSL =====
function hexToHsl(hex: string): string {
  const m = hex.replace('#', '').match(/.{1,2}/g);
  if (!m || m.length < 3) return '';
  const [r, g, b] = m.map(v => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(hsl: string): string {
  const m = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return '#000000';
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const EDITABLE_KEYS: { key: string; label: string }[] = [
  { key: 'background', label: 'Fundo' },
  { key: 'foreground', label: 'Texto' },
  { key: 'card', label: 'Card' },
  { key: 'primary', label: 'Primária' },
  { key: 'primary-foreground', label: 'Texto da Primária' },
  { key: 'accent', label: 'Destaque' },
  { key: 'border', label: 'Borda' },
];

export default function ThemeEditorPanel() {
  const { user } = useAuth();
  const { theme, reloadTheme } = useBarberTheme();

  const [colors, setColors] = useState<Record<string, string>>({});
  const [heroUrl, setHeroUrl] = useState<string>('');
  const [heroFit, setHeroFit] = useState<'cover' | 'contain'>('cover');
  const [heroPos, setHeroPos] = useState<string>('center');
  const [planEnabled, setPlanEnabled] = useState(true);
  const [planMode, setPlanMode] = useState<'whatsapp' | 'link'>('whatsapp');
  const [linkPlanos, setLinkPlanos] = useState('');
  const [comodidades, setComodidades] = useState<string[]>([]);
  const [appBgUrl, setAppBgUrl] = useState<string>('');
  const [appBgOpacity, setAppBgOpacity] = useState<number>(0.15);
  const [appLogoUrl, setAppLogoUrl] = useState<string>('');
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inicializa estados a partir do tema atual
  useEffect(() => {
    const base = { ...DEFAULT_THEME, ...(theme.tema_cores || {}) };
    const filtered: Record<string, string> = {};
    EDITABLE_KEYS.forEach(({ key }) => { filtered[key] = base[key] || DEFAULT_THEME[key] || '0 0% 50%'; });
    setColors(filtered);
    setHeroUrl(theme.hero_image_url || '');
    setHeroFit(theme.hero_object_fit);
    setHeroPos(theme.hero_object_position);
    setPlanEnabled(theme.plano_enabled);
    setPlanMode(theme.plano_modo);
    setLinkPlanos(theme.link_planos || '');
    setComodidades(Array.isArray(theme.comodidades) ? theme.comodidades : []);
    setAppBgUrl(theme.app_bg_url || '');
    setAppBgOpacity(typeof theme.app_bg_opacity === 'number' ? theme.app_bg_opacity : 0.15);
    setAppLogoUrl(theme.app_logo_url || '');
  }, [theme]);

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande (máximo 5MB).');
      return;
    }
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `hero/${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('gallery').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) { toast.error('Erro no upload: ' + upErr.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(path);
    setHeroUrl(urlData.publicUrl);
    // Persiste imediatamente para não perder a imagem se o barbeiro esquecer de clicar em "Salvar".
    const { error: persistErr } = await supabase
      .from('profiles')
      .update({ hero_image_url: urlData.publicUrl, hero_object_fit: heroFit, hero_object_position: heroPos } as any)
      .eq('id', user.id);
    if (persistErr) {
      toast.warning('Imagem enviada, mas falhou ao salvar no perfil. Clique em "Salvar tema".');
    } else {
      await reloadTheme();
      toast.success('✅ Imagem salva!');
    }
    setUploading(false);
  };

  const uploadTo = async (file: File, folder: string): Promise<string | null> => {
    if (!user) return null;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${folder}/${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('gallery').upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) { toast.error('Erro no upload: ' + upErr.message); return null; }
    return supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
  };

  const handleAppBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 6 * 1024 * 1024) { toast.error('Imagem muito grande (máximo 6MB).'); return; }
    setUploadingBg(true);
    const url = await uploadTo(file, 'appbg');
    if (url) {
      setAppBgUrl(url);
      await supabase.from('profiles').update({ app_bg_url: url, app_bg_opacity: appBgOpacity } as any).eq('id', user.id);
      await reloadTheme();
      toast.success('✅ Fundo do app salvo!');
    }
    setUploadingBg(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 4 * 1024 * 1024) { toast.error('Logo muito grande (máximo 4MB).'); return; }
    if (file.type !== 'image/png') { toast.error('A logo precisa ser um PNG com fundo transparente.'); return; }
    setUploadingLogo(true);
    const url = await uploadTo(file, 'applogo');
    if (url) {
      setAppLogoUrl(url);
      await supabase.from('profiles').update({ app_logo_url: url } as any).eq('id', user.id);
      await reloadTheme();
      toast.success('✅ Logo salva!');
    }
    setUploadingLogo(false);
  };

  const resetAppBg = async () => {
    if (!confirm('Remover a imagem de fundo do app?')) return;
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ app_bg_url: null, app_bg_opacity: 0.15 } as any).eq('id', user.id);
    if (error) { toast.error('Erro ao restaurar'); return; }
    setAppBgUrl(''); setAppBgOpacity(0.15);
    await reloadTheme();
    toast.success('Fundo do app removido.');
  };

  const resetLogo = async () => {
    if (!confirm('Remover a logo personalizada?')) return;
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ app_logo_url: null } as any).eq('id', user.id);
    if (error) { toast.error('Erro ao restaurar'); return; }
    setAppLogoUrl('');
    await reloadTheme();
    toast.success('Logo removida.');
  };

  const saveTheme = async () => {
    if (!user) return;
    setSaving(true);
    const cleanLink = linkPlanos.trim();
    const payload = {
      tema_cores: colors,
      hero_image_url: heroUrl || null,
      hero_object_fit: heroFit,
      hero_object_position: heroPos,
      plano_enabled: planEnabled,
      plano_modo: planMode,
      link_planos: cleanLink || null,
      comodidades,
      app_bg_url: appBgUrl || null,
      app_bg_opacity: appBgOpacity,
      app_logo_url: appLogoUrl || null,
    };
    const { error } = await supabase.from('profiles').update(payload as any).eq('id', user.id);
    if (error) { toast.error('Erro ao salvar: ' + error.message); setSaving(false); return; }
    // Cache local para que o tema persista offline / após login
    try { localStorage.setItem(`barber_theme_${user.id}`, JSON.stringify(payload)); } catch { /* */ }
    await reloadTheme();
    toast.success('✅ Tema salvo!');
    setSaving(false);
  };

  const applyPreset = (presetId: string) => {
    const p = THEME_PRESETS.find(x => x.id === presetId);
    if (!p) return;
    const filtered: Record<string, string> = {};
    EDITABLE_KEYS.forEach(({ key }) => { filtered[key] = p.colors[key] || DEFAULT_THEME[key]; });
    setColors(filtered);
    toast.success(`Preset "${p.name}" carregado no preview. Clique em Salvar tema.`);
  };

  const resetColors = async () => {
    if (!confirm('Restaurar as cores padrão?')) return;
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ tema_cores: null } as any).eq('id', user.id);
    if (error) { toast.error('Erro ao restaurar'); return; }
    await reloadTheme();
    toast.success('Cores restauradas para o padrão.');
  };

  const resetHero = async () => {
    if (!confirm('Restaurar a imagem padrão?')) return;
    if (!user) return;
    const { error } = await supabase.from('profiles').update({
      hero_image_url: null,
      hero_object_fit: 'cover',
      hero_object_position: 'center',
    } as any).eq('id', user.id);
    if (error) { toast.error('Erro ao restaurar'); return; }
    await reloadTheme();
    toast.success('Imagem restaurada para o padrão.');
  };

  return (
    <div className="px-4 space-y-4">
      {/* ===== Preview ao vivo ===== */}
      <div
        className="rounded-2xl px-4 py-4 space-y-3 border-2 border-primary/40 shadow-lg"
        style={{
          background: `hsl(${colors.background || DEFAULT_THEME.background})`,
          color: `hsl(${colors.foreground || DEFAULT_THEME.foreground})`,
        }}
      >
        <div className="flex items-center gap-2 text-xs opacity-70">
          <Eye size={14} /> Pré-visualização do seu tema
        </div>
        <div
          className="rounded-xl overflow-hidden h-28 border"
          style={{ borderColor: `hsl(${colors.border || DEFAULT_THEME.border})` }}
        >
          {heroUrl ? (
            <img
              src={heroUrl}
              alt="hero preview"
              className="w-full h-full"
              style={{ objectFit: heroFit, objectPosition: heroPos }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-xs"
              style={{ background: `hsl(${colors.card || DEFAULT_THEME.card})` }}
            >
              (Sem imagem de capa)
            </div>
          )}
        </div>
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ background: `hsl(${colors.card || DEFAULT_THEME.card})` }}
        >
          <div className="font-heading text-lg" style={{ color: `hsl(${colors.primary || DEFAULT_THEME.primary})` }}>
            Barbearia Exemplo
          </div>
          <div className="text-xs opacity-80">Atendimento personalizado com estilo.</div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{
                background: `hsl(${colors.primary || DEFAULT_THEME.primary})`,
                color: `hsl(${colors['primary-foreground'] || DEFAULT_THEME['primary-foreground']})`,
              }}
            >
              Agendar
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs border"
              style={{
                borderColor: `hsl(${colors.border || DEFAULT_THEME.border})`,
                color: `hsl(${colors.accent || DEFAULT_THEME.accent})`,
              }}
            >
              Planos
            </button>
          </div>
        </div>
      </div>

      {/* ===== Presets IA ===== */}
      <div className="wood-card px-4 py-4 space-y-3">
        <h3 className="font-heading text-base text-primary flex items-center gap-2">
          <Sparkles size={16} /> Temas prontos (IA)
        </h3>
        <p className="text-xs text-muted-foreground">
          Toque em um tema para aplicar no preview acima. Nada é salvo até clicar em "Salvar tema".
        </p>
        <div className="grid grid-cols-2 gap-2">
          {THEME_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="rounded-lg p-2 flex items-center gap-2 border border-border hover:border-primary transition text-left"
              style={{ background: `hsl(${p.colors.background})`, color: `hsl(${p.colors.foreground})` }}
            >
              <div className="flex flex-col gap-0.5">
                <div className="w-4 h-3 rounded-sm" style={{ background: `hsl(${p.colors.primary})` }} />
                <div className="w-4 h-3 rounded-sm" style={{ background: `hsl(${p.colors.accent})` }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{p.emoji} {p.name}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ===== Cores ===== */}
      <div className="wood-card px-4 py-4 space-y-3">
        <h3 className="font-heading text-base text-primary flex items-center gap-2">
          <Palette size={16} /> Cores do app
        </h3>
        <p className="text-xs text-muted-foreground">Toque em cada cor para abrir o seletor — o preview acima atualiza em tempo real. Clique em "Salvar tema" para aplicar no app.</p>
        <div className="grid grid-cols-2 gap-3">
          {EDITABLE_KEYS.map(({ key, label }) => {
            const hsl = colors[key] || '0 0% 50%';
            const hex = hslToHex(hsl);
            return (
              <label key={key} className="flex items-center gap-2 wood-card px-3 py-2 rounded-lg cursor-pointer">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => {
                    const newHsl = hexToHsl(e.target.value);
                    if (newHsl) setColors(prev => ({ ...prev, [key]: newHsl }));
                  }}
                  className="w-8 h-8 rounded border border-border bg-transparent cursor-pointer"
                  aria-label={label}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{hex}</p>
                </div>
              </label>
            );
          })}
        </div>
        <button onClick={resetColors} className="text-xs text-muted-foreground underline flex items-center gap-1">
          <RotateCcw size={12} /> Restaurar cores padrão
        </button>
      </div>

      {/* ===== Imagem capa ===== */}
      <div className="wood-card px-4 py-4 space-y-3">
        <h3 className="font-heading text-base text-primary flex items-center gap-2">
          <ImageIcon size={16} /> Imagem da capa
        </h3>
        <div className="rounded-lg overflow-hidden border border-border bg-card h-40 flex items-center justify-center">
          {heroUrl ? (
            <img
              src={heroUrl}
              alt="Preview"
              className="w-full h-full"
              style={{ objectFit: heroFit, objectPosition: heroPos }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Sem imagem personalizada (usando padrão)</p>
          )}
        </div>
        <label className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer">
          <Upload size={14} /> {uploading ? 'Enviando...' : 'Enviar nova imagem'}
          <input type="file" accept="image/*" onChange={handleHeroUpload} className="hidden" disabled={uploading} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Encaixe</label>
            <select
              value={heroFit}
              onChange={(e) => setHeroFit(e.target.value as any)}
              className="vintage-input w-full px-2 py-2 rounded-lg text-xs mt-1"
            >
              <option value="cover">Preencher (sem barras)</option>
              <option value="contain">Caber inteira</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Posição</label>
            <select
              value={heroPos}
              onChange={(e) => setHeroPos(e.target.value)}
              className="vintage-input w-full px-2 py-2 rounded-lg text-xs mt-1"
            >
              <option value="center">Centro</option>
              <option value="top">Topo</option>
              <option value="bottom">Base</option>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select>
          </div>
        </div>
        <button onClick={resetHero} className="text-xs text-muted-foreground underline flex items-center gap-1">
          <RotateCcw size={12} /> Restaurar imagem padrão
        </button>
      </div>

      {/* ===== Fundo do app inteiro ===== */}
      <div className="wood-card px-4 py-4 space-y-3">
        <h3 className="font-heading text-base text-primary flex items-center gap-2">
          <ImageIcon size={16} /> Fundo do app
        </h3>
        <p className="text-xs text-muted-foreground -mt-1">
          Imagem exibida atrás de todo o app. Ajuste a opacidade para um efeito sutil.
        </p>
        <div className="relative rounded-lg overflow-hidden border border-border bg-card h-32 flex items-center justify-center">
          {appBgUrl ? (
            <img src={appBgUrl} alt="Fundo do app" className="w-full h-full object-cover" style={{ opacity: appBgOpacity }} />
          ) : (
            <p className="text-xs text-muted-foreground">Sem imagem de fundo</p>
          )}
        </div>
        <label className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer">
          <Upload size={14} /> {uploadingBg ? 'Enviando...' : 'Enviar imagem de fundo'}
          <input type="file" accept="image/*" onChange={handleAppBgUpload} className="hidden" disabled={uploadingBg} />
        </label>
        <div>
          <label className="text-[10px] text-muted-foreground">Opacidade: {Math.round(appBgOpacity * 100)}%</label>
          <input
            type="range" min={0} max={1} step={0.01}
            value={appBgOpacity}
            onChange={(e) => setAppBgOpacity(Number(e.target.value))}
            className="w-full accent-primary mt-1"
          />
        </div>
        {appBgUrl && (
          <button onClick={resetAppBg} className="text-xs text-muted-foreground underline flex items-center gap-1">
            <RotateCcw size={12} /> Remover fundo do app
          </button>
        )}
      </div>

      {/* ===== Logo do app (PNG transparente) ===== */}
      <div className="wood-card px-4 py-4 space-y-3">
        <h3 className="font-heading text-base text-primary flex items-center gap-2">
          <ImageIcon size={16} /> Logo (PNG transparente)
        </h3>
        <p className="text-xs text-muted-foreground -mt-1">
          Envie um PNG com fundo transparente. Será usada como logo da sua barbearia no app.
        </p>
        {/* Prévia sobre o fundo real do app + sobre um xadrez, para confirmar transparência do PNG. */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-lg overflow-hidden border border-border h-28 flex items-center justify-center"
            style={{ background: `hsl(${colors.background || DEFAULT_THEME.background})` }}
          >
            {appLogoUrl ? (
              <img src={appLogoUrl} alt="Logo no fundo do app" className="max-h-24 max-w-[80%] object-contain" />
            ) : (
              <p className="text-xs text-muted-foreground">Sem logo</p>
            )}
          </div>
          <div
            className="rounded-lg overflow-hidden border border-border h-28 flex items-center justify-center"
            style={{
              backgroundImage:
                'linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
              backgroundColor: '#fff',
            }}
          >
            {appLogoUrl ? (
              <img src={appLogoUrl} alt="Teste de transparência" className="max-h-24 max-w-[80%] object-contain" />
            ) : (
              <p className="text-[10px] text-neutral-500 px-1 text-center">Teste de transparência</p>
            )}
          </div>
        </div>

        <label className="vintage-btn w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer">
          <Upload size={14} /> {uploadingLogo ? 'Enviando...' : 'Enviar logo PNG'}
          <input type="file" accept="image/png" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
        </label>
        {appLogoUrl && (
          <button onClick={resetLogo} className="text-xs text-muted-foreground underline flex items-center gap-1">
            <RotateCcw size={12} /> Remover logo
          </button>
        )}
      </div>


      <div className="wood-card px-4 py-4 space-y-3">
        <h3 className="font-heading text-base text-primary flex items-center gap-2">
          ✦ Botão "Confira nossos planos"
        </h3>
        <label className="flex items-center justify-between gap-2 wood-card px-3 py-2 rounded-lg cursor-pointer">
          <span className="text-sm text-foreground">Mostrar botão no app</span>
          <input
            type="checkbox"
            checked={planEnabled}
            onChange={(e) => setPlanEnabled(e.target.checked)}
            className="accent-primary w-5 h-5"
          />
        </label>

        {planEnabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlanMode('whatsapp')}
                className={`py-2 rounded-lg text-xs flex flex-col items-center gap-1 transition ${planMode === 'whatsapp' ? 'bg-primary/20 ring-2 ring-primary text-primary' : 'wood-card text-muted-foreground'}`}
              >
                <MessageCircle size={16} /> WhatsApp + IA
              </button>
              <button
                type="button"
                onClick={() => setPlanMode('link')}
                className={`py-2 rounded-lg text-xs flex flex-col items-center gap-1 transition ${planMode === 'link' ? 'bg-primary/20 ring-2 ring-primary text-primary' : 'wood-card text-muted-foreground'}`}
              >
                <Link2 size={16} /> Link direto
              </button>
            </div>

            {planMode === 'link' ? (
              <div>
                <label className="text-[10px] text-muted-foreground">URL dos planos (será aberta em nova aba)</label>
                <input
                  value={linkPlanos}
                  onChange={(e) => setLinkPlanos(e.target.value)}
                  placeholder="https://..."
                  className="vintage-input w-full px-3 py-2 rounded-lg mt-1 text-sm"
                  type="url"
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                O botão abre o WhatsApp cadastrado no seu perfil com uma mensagem gerada por IA. Para funcionar, garanta que o seu telefone esteja preenchido.
              </p>
            )}
          </>
        )}
      </div>

      {/* ===== Comodidades / Diferenciais ===== */}
      <div className="wood-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h3 className="font-heading text-sm">Comodidades da barbearia</h3>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Marque o que seu espaço oferece. Os ícones aparecem para os clientes.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {AMENITIES.map(({ id, label, icon: Icon }) => {
            const active = comodidades.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setComodidades((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border bg-input/40 text-muted-foreground'
                }`}
              >
                <Icon size={16} className={active ? 'text-primary' : ''} />
                <span className="flex-1 truncate">{label}</span>
                {active && <Check size={14} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>



      <button
        onClick={saveTheme}
        disabled={saving}
        className="vintage-btn w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40"
      >
        <Save size={16} /> {saving ? 'Salvando...' : 'Salvar tema'}
      </button>
    </div>
  );
}
