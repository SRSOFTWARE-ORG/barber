import { corsHeaders } from '../_shared/cors.ts'
import { requireRole, errorResponse } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Geração de imagem por IA consome créditos pagos: exige usuário autenticado
    // com papel de barbeiro (admin) ou CEO para evitar abuso de quota por anônimos.
    await requireRole(req, ['admin', 'ceo'])

    const key = Deno.env.get('LOVABLE_API_KEY')
    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : ''
    if (!name) {
      return new Response(JSON.stringify({ error: 'Informe o nome do serviço.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = `Fotografia profissional e realista de barbearia representando o serviço "${name}". ` +
      `Resultado do serviço em destaque, iluminação de estúdio, fundo desfocado de barbearia vintage, ` +
      `alta qualidade, sem texto, sem letras, sem marca d'água, enquadramento quadrado.`

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-image-2',
        prompt,
        quality: 'low',
        size: '1024x1024',
        n: 1,
      }),
    })

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      const status = resp.status === 429 ? 429 : resp.status === 402 ? 402 : 502
      return new Response(JSON.stringify({ error: 'Falha ao gerar imagem.', detail: txt }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await resp.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) {
      return new Response(JSON.stringify({ error: 'Imagem não retornada.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ b64 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return errorResponse(err, corsHeaders)
  }
})
