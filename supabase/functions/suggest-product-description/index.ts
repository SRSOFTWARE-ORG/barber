// Gera uma descrição de produto da loja a partir do nome, usando IA
// (Gemini próprio ou Lovable AI). Requer admin/ceo.
import { corsHeaders } from '../_shared/cors.ts';
import { requireRole, errorResponse } from '../_shared/auth.ts';
import { chatComplete, hasAnyAiKey } from '../_shared/ai-chat.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    await requireRole(req, ['admin', 'ceo']);

    const { nome, preco } = await req.json();

    if (!nome || !String(nome).trim()) {
      return new Response(JSON.stringify({ error: 'nome obrigatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!hasAnyAiKey()) {
      return new Response(JSON.stringify({ error: 'IA não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Você é copywriter de uma barbearia vintage. Escreva uma descrição curta, atrativa e profissional para o produto abaixo, vendido na loja da barbearia. Use português do Brasil, no máximo 1 emoji sutil, foco em benefícios reais do produto. NÃO invente preços, marcas ou características técnicas que não estejam no nome. Máximo 180 caracteres.

PRODUTO:
- Nome: ${String(nome).trim()}
- Preço: ${preco ? `R$ ${preco}` : '(não informado)'}

Responda APENAS em JSON válido neste formato exato (sem markdown):
{"descricao": "descrição curta e atrativa"}`;

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
    let descricao = String(parsed?.descricao ?? '').trim();
    if (!descricao) {
      // fallback: usa o texto bruto se o JSON falhar
      descricao = content.replace(/[{}"]/g, '').replace(/^descricao:?/i, '').trim();
    }
    if (!descricao) {
      return new Response(JSON.stringify({ error: 'parse_failed', raw: content }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ descricao: descricao.slice(0, 220) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return errorResponse(e, corsHeaders);
  }
});
