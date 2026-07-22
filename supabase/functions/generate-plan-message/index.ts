import { corsHeaders } from '../_shared/cors.ts';
import { requireUser, errorResponse } from '../_shared/auth.ts';
import { chatComplete, hasAnyAiKey } from '../_shared/ai-chat.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Exige usuário autenticado para evitar abuso de créditos de IA
    await requireUser(req);
    const { shopName, barberName, clientName } = await req.json();
    const fallback = `Olá${barberName ? `, ${barberName}` : ''}! 👋 Sou${clientName ? ` ${clientName}` : ''} cliente da ${shopName || 'sua barbearia'} e gostaria de saber mais sobre os planos disponíveis para contratar. Pode me passar as informações? 💈`;
    if (!hasAnyAiKey()) {
      return new Response(JSON.stringify({ message: fallback }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const prompt = `Gere uma mensagem curta, simpática e natural em português brasileiro (máx 280 caracteres, 1 ou 2 emojis discretos) que um cliente enviaria pelo WhatsApp para o barbeiro ${barberName || ''} da ${shopName || 'barbearia'} dizendo que quer contratar um dos planos da barbearia e pedindo informações. ${clientName ? `O cliente se chama ${clientName}.` : ''} Responda APENAS com a mensagem, sem aspas, sem cabeçalho.`;
    let message = fallback;
    try {
      const out = await chatComplete([{ role: 'user', content: prompt }]);
      if (out) message = out;
    } catch {
      // mantém o fallback em caso de falha de IA
    }
    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return errorResponse(e, corsHeaders);
  }
});
