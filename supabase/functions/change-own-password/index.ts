// Permite que qualquer usuário autenticado (admin/ceo/cliente) altere a própria senha.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Not authenticated')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) throw new Error('Not authenticated')

    const { newPassword } = await req.json()
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      throw new Error('Senha deve ter pelo menos 6 caracteres')
    }

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })
    if (pwErr) throw pwErr



    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
