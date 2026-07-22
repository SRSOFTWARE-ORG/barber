// Aprimora texto de promoções usando IA (Gemini próprio ou Lovable AI). Requer admin/ceo.
import { corsHeaders } from '../_shared/cors.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';
import { chatComplete, hasAnyAiKey } from '../_shared/ai-chat.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    await requireRole(req, ['admin', 'ceo']);

    const { titulo, descricao, preco_original, preco_promocional } = await req.json();

    if (!titulo && !descricao) {
      return new Response(JSON.stringify({ error: 'titulo ou descricao obrigatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!hasAnyAiKey()) {
      return new Response(JSON.stringify({ error: 'IA não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Você é copywriter de uma barbearia vintage. Reescreva o título e a descrição da promoção abaixo para soar mais engajante, profissional e com personalidade — SEM alterar nenhum dado factual (preços, serviços, datas, condições). Use português do Brasil, máximo 2 emojis sutis. NÃO invente serviços, descontos, datas ou condições que não estejam no texto original.

DADOS DA PROMOÇÃO:
- Título atual: ${titulo || '(em branco)'}
- Descrição atual: ${descricao || '(em branco)'}
- Preço original: ${preco_original || '(não informado)'}
- Preço promocional: ${preco_promocional || '(não informado)'}

Responda APENAS em JSON válido neste formato exato (sem markdown, sem comentários):
{"titulo": "novo título curto e chamativo (até 60 caracteres)", "descricao": "nova descrição clara e atrativa (até 200 caracteres)"}`;

    let content = '';
    try {
      content = await chatComplete([
        { role: 'system', content: 'Você é um copywriter especialista em marketing de barbearias. Responda sempre em JSON puro válido.' },
        { role: 'user', content: prompt },
      ]);
    } catch (err) {
      if (err instanceof Response) {
        return new Response(err.body, { status: err.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'ai_failed', detail: String((err as Error).message) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: any = null;
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }
    if (!parsed?.titulo && !parsed?.descricao) {
      return new Response(JSON.stringify({ error: 'parse_failed', raw: content }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      titulo: String(parsed.titulo ?? titulo ?? '').slice(0, 80),
      descricao: String(parsed.descricao ?? descricao ?? '').slice(0, 240),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return errorResponse(e, corsHeaders);
  }
});
