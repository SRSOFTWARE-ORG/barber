// Helper de chat de IA com preferência pela chave Gemini própria do dono do app.
// Se GEMINI_API_KEY estiver configurada, usa a API do Google AI Studio diretamente
// (mais barato / cota própria). Caso contrário, usa o Lovable AI Gateway.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model?: string; // id no formato Gemini (ex.: gemini-2.5-flash-lite)
  temperature?: number;
}

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

export function hasAnyAiKey() {
  return Boolean(GEMINI_KEY || LOVABLE_API_KEY);
}

/** Retorna o texto da resposta do modelo, ou lança em caso de falha. */
export async function chatComplete(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const model = opts.model ?? 'gemini-2.5-flash-lite';

  // 1) Caminho preferido: chave Gemini própria (Google AI Studio).
  if (GEMINI_KEY) {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    const body: Record<string, unknown> = { contents };
    if (system) body.system_instruction = { parts: [{ text: system }] };
    if (typeof opts.temperature === 'number') body.generationConfig = { temperature: opts.temperature };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`gemini_failed:${res.status}:${txt.slice(0, 300)}`);
    }
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
    return text.trim();
  }

  // 2) Fallback: Lovable AI Gateway (modelo no formato google/<id>).
  if (!LOVABLE_API_KEY) throw new Error('Nenhuma chave de IA configurada (GEMINI_API_KEY ou LOVABLE_API_KEY).');
  const gatewayModel = model.startsWith('google/') ? model : `google/${model}`;
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({ model: gatewayModel, messages }),
  });
  if (res.status === 429) throw new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ai_failed:${res.status}:${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? '').trim();
}
