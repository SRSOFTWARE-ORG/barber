// Bootstrap único do CEO. Protegido por um segredo e bloqueado depois que existe um CEO.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Resposta genérica para qualquer caso não autorizado — evita vazar o estado do
// bootstrap (se já existe um CEO ou se os segredos estão configurados).
function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Falha fechada: o endpoint só responde se o segredo de bootstrap estiver
  // configurado E o chamador enviar o token correto. Caso contrário, 404 genérico.
  const bootstrapSecret = Deno.env.get('BOOTSTRAP_SECRET')
  const providedToken = req.headers.get('x-bootstrap-token')
  if (!bootstrapSecret || !providedToken || providedToken !== bootstrapSecret) {
    return notFound()
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { count } = await supabaseAdmin
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'ceo')

    // Já existe CEO: não revela esse estado, apenas responde genérico.
    if ((count ?? 0) > 0) {
      return notFound()
    }

    const email = Deno.env.get('BOOTSTRAP_CEO_EMAIL')
    const password = Deno.env.get('BOOTSTRAP_CEO_PASSWORD')
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Defina BOOTSTRAP_CEO_EMAIL e BOOTSTRAP_CEO_PASSWORD nos secrets.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (error || !newUser?.user) throw error ?? new Error('Falha ao criar usuário')

    await supabaseAdmin.from('user_roles').insert({ user_id: newUser.user.id, role: 'ceo', display_name: 'CEO' })

    // Auditoria do bootstrap.
    await supabaseAdmin.from('security_audit_log').insert({
      user_id: newUser.user.id,
      event_type: 'ceo_bootstrap',
      resource: 'user_roles',
      details: { email },
      allowed: true,
    })

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
