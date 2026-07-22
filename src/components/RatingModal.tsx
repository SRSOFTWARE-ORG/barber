import { useState, useEffect } from 'react';
import { Star, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useT } from '@/contexts/LanguageContext';

interface UnratedAppt {
  id: string;
  barbeiro_id: string | null;
  barbeiro_nome: string | null;
  data: string;
}

export default function RatingModal() {
  const { user, role } = useAuth();
  const t = useT();
  const [appt, setAppt] = useState<UnratedAppt | null>(null);
  const [nota, setNota] = useState(0);
  const [hoverNota, setHoverNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    if (!user || role === 'admin' || role === 'ceo') return;

    const checkUnrated = async () => {
      // Get completed appointments for this client
      const { data: completed } = await supabase
        .from('agendamentos')
        .select('id, barbeiro_id, barbeiro_nome, data')
        .eq('cliente_id', user.id)
        .eq('status', 'finalizado')
        .order('data', { ascending: false })
        .limit(10);

      if (!completed?.length) return;

      // Get already rated
      const { data: rated } = await supabase
        .from('avaliacoes')
        .select('agendamento_id')
        .eq('cliente_id', user.id);

      const ratedIds = new Set((rated || []).map(r => r.agendamento_id));
      const unrated = completed.find(a => !ratedIds.has(a.id));

      if (unrated) setAppt(unrated);
    };

    // Small delay so it doesn't appear instantly
    const timer = setTimeout(checkUnrated, 2000);
    return () => clearTimeout(timer);
  }, [user, role]);

  const handleSubmit = async () => {
    if (!appt || nota === 0 || !user) return;
    setSending(true);
    const { error } = await supabase.from('avaliacoes').insert({
      agendamento_id: appt.id,
      cliente_id: user.id,
      adm_id: appt.barbeiro_id || '',
      nota,
      comentario: comentario || null,
    });
    if (error) {
      toast.error(t('rating.error'));
    } else {
      setThanked(true);
      setTimeout(() => { setAppt(null); setThanked(false); }, 2500);
    }
    setSending(false);
  };

  if (!appt || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={() => setDismissed(true)}>
      <div
        className="wood-card w-full max-w-sm px-6 py-6 space-y-4 relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={() => setDismissed(true)} className="absolute top-3 right-3 text-muted-foreground">
          <X size={18} />
        </button>

        {thanked ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-4xl">🎉</p>
            <p className="font-heading text-lg text-primary">{t('rating.thanksTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('rating.thanksBody')}</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-3xl mb-2">✂️</p>
              <h3 className="font-heading text-base text-foreground">
                {t('rating.question', { nome: appt.barbeiro_nome || t('rating.yourBarber') })}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{t('rating.subtitle')}</p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <button
                  key={i}
                  onMouseEnter={() => setHoverNota(i)}
                  onMouseLeave={() => setHoverNota(0)}
                  onClick={() => setNota(i)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={32}
                    className={`transition-colors ${
                      i <= (hoverNota || nota) ? 'text-primary fill-primary' : 'text-muted-foreground/30'
                    }`}
                  />
                </button>
              ))}
            </div>
            {nota > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {[t('rating.bad'), t('rating.regular'), t('rating.good'), t('rating.veryGood'), t('rating.excellent')][nota - 1]}
              </p>
            )}

            {/* Comment */}
            <textarea
              placeholder={t('rating.commentPlaceholder')}
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={3}
              className="vintage-input w-full px-3 py-2 rounded-lg text-sm resize-none"
            />

            <button
              onClick={handleSubmit}
              disabled={nota === 0 || sending}
              className="vintage-btn w-full py-2.5 rounded-lg text-sm font-heading disabled:opacity-40"
            >
              {sending ? t('rating.sending') : t('rating.submit')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
