import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  agendamentoId: string;
  admId: string | null;
  clienteId: string;
}

export default function RatingWidget({ agendamentoId, admId, clienteId }: Props) {
  const [nota, setNota] = useState(0);
  const [hoverNota, setHoverNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [saved, setSaved] = useState(false);
  const [existingNota, setExistingNota] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase
      .from('avaliacoes')
      .select('nota, comentario')
      .eq('agendamento_id', agendamentoId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingNota(data.nota);
          setNota(data.nota);
          setComentario(data.comentario || '');
          setSaved(true);
        }
      });
  }, [agendamentoId]);

  const handleSubmit = async () => {
    if (nota === 0 || !admId) return;
    setSending(true);
    const { error } = await supabase.from('avaliacoes').insert({
      agendamento_id: agendamentoId,
      cliente_id: clienteId,
      adm_id: admId,
      nota,
      comentario: comentario || null,
    });
    if (error) {
      if (error.code === '23505') toast.error('Você já avaliou este atendimento');
      else toast.error('Erro ao enviar avaliação');
    } else {
      toast.success('Avaliação enviada! Obrigado!');
      setSaved(true);
      setExistingNota(nota);
    }
    setSending(false);
  };

  if (saved) {
    return (
      <div className="flex items-center gap-1 mt-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} size={14} className={i <= (existingNota || 0) ? 'text-primary fill-primary' : 'text-muted-foreground/30'} />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1">Avaliado</span>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onMouseEnter={() => setHoverNota(i)}
            onMouseLeave={() => setHoverNota(0)}
            onClick={() => setNota(i)}
          >
            <Star
              size={18}
              className={`transition-colors ${
                i <= (hoverNota || nota) ? 'text-primary fill-primary' : 'text-muted-foreground/30'
              }`}
            />
          </button>
        ))}
        {nota > 0 && <span className="text-xs text-muted-foreground ml-1">{nota}/5</span>}
      </div>
      {nota > 0 && (
        <>
          <input
            placeholder="Comentário (opcional)"
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            className="vintage-input w-full px-3 py-1.5 rounded-lg text-xs"
          />
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="vintage-btn w-full py-1.5 rounded-lg text-xs disabled:opacity-40"
          >
            {sending ? 'Enviando...' : 'Enviar Avaliação'}
          </button>
        </>
      )}
    </div>
  );
}
