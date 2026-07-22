// Admin (shop owner) cria um barbeiro funcionário com login + senha
// e já vincula em barbershop_team. O barbeiro entra direto vinculado à barbearia.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Not authenticated')

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) throw new Error('Not authenticated')

    // Caller precisa ser admin (dono de barbearia) ou CEO
    const { data: roles } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', user.id)
    const isAdmin = (roles || []).some(r => r.role === 'admin')
    const isCeo = (roles || []).some(r => r.role === 'ceo')
    if (!isAdmin && !isCeo) throw new Error('Apenas administradores podem criar barbeiros')

    const body = await req.json()
    const action = String(body?.action || 'create')
    const shopOwnerId = user.id // dono = caller

    if (action === 'create') {
      const username = String(body?.username || '').trim().toLowerCase().replace(/\s+/g, '')
      const password = String(body?.password || '')
      const displayName = String(body?.displayName || '').trim()
      const commissionType = body?.commissionType === 'fixed' ? 'fixed' : 'percentage'
      const commissionValue = Number(body?.commissionValue ?? 50)

      if (!username || username.length < 3) throw new Error('Usuário deve ter no mínimo 3 caracteres')
      if (!password || password.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres')
      if (!displayName) throw new Error('Nome do barbeiro é obrigatório')

      // Checa limite de 20
      const { count } = await supabaseAdmin
        .from('barbershop_team')
        .select('id', { count: 'exact', head: true })
        .eq('shop_owner_id', shopOwnerId).eq('active', true)
      if ((count || 0) >= 20) throw new Error('Limite de 20 barbeiros atingido')

      const email = `${username}@barbershop.app`

      // Cria (ou reusa) usuário no auth
      const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const existing = existingList?.users?.find(u => u.email === email)
      let barberId: string
      if (existing) {
        barberId = existing.id

        // SECURITY: never reset credentials of an account that does not already
        // belong to the calling shop. Otherwise an admin could hijack another
        // tenant's barber simply by colliding on the shared @barbershop.app username.
        const isSelf = barberId === shopOwnerId
        const { data: myLink } = await supabaseAdmin
          .from('barbershop_team').select('id')
          .eq('shop_owner_id', shopOwnerId).eq('barber_id', barberId).maybeSingle()
        if (!isSelf && !myLink && !isCeo) {
          throw new Error('Já existe um usuário com esse nome de usuário. Escolha outro nome.')
        }

        await supabaseAdmin.auth.admin.updateUserById(barberId, { password, email_confirm: true })
      } else {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true,
        })
        if (createErr) throw createErr
        barberId = created.user.id
      }

      // Garante role admin (barbeiro tem painel próprio)
      const { data: existingRole } = await supabaseAdmin
        .from('user_roles').select('id').eq('user_id', barberId).eq('role', 'admin').maybeSingle()
      if (!existingRole) {
        const { error: roleErr } = await supabaseAdmin
          .from('user_roles').insert({ user_id: barberId, role: 'admin', display_name: displayName })
        if (roleErr) throw roleErr
      } else {
        await supabaseAdmin.from('user_roles')
          .update({ display_name: displayName }).eq('user_id', barberId).eq('role', 'admin')
      }

      // Garante profile
      const { data: prof } = await supabaseAdmin
        .from('profiles').select('id').eq('id', barberId).maybeSingle()
      if (!prof) {
        await supabaseAdmin.from('profiles').insert({ id: barberId, full_name: displayName })
      } else {
        await supabaseAdmin.from('profiles').update({ full_name: displayName }).eq('id', barberId)
      }

      // Bloqueia: não pode adicionar quem já é dono de outra barbearia ativa
      // (ele continuaria sendo admin/owner próprio caso já tivesse team próprio)
      const { count: ownsTeam } = await supabaseAdmin
        .from('barbershop_team').select('id', { count: 'exact', head: true })
        .eq('shop_owner_id', barberId).eq('active', true)
      if ((ownsTeam || 0) > 0 && barberId !== shopOwnerId) {
        throw new Error('Este usuário já é dono de uma equipe e não pode virar funcionário')
      }

      // Cria vínculo (upsert manual)
      const { data: existingLink } = await supabaseAdmin
        .from('barbershop_team').select('id')
        .eq('shop_owner_id', shopOwnerId).eq('barber_id', barberId).maybeSingle()
      if (existingLink) {
        await supabaseAdmin.from('barbershop_team')
          .update({ active: true, commission_type: commissionType, commission_value: commissionValue })
          .eq('id', existingLink.id)
      } else {
        const { error: linkErr } = await supabaseAdmin.from('barbershop_team').insert({
          shop_owner_id: shopOwnerId,
          barber_id: barberId,
          commission_type: commissionType,
          commission_value: commissionValue,
          active: true,
        })
        if (linkErr) throw linkErr
      }

      return new Response(JSON.stringify({ success: true, barberId, email, username }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset-password') {
      const barberId = String(body?.barberId || '')
      const password = String(body?.password || '')
      if (!barberId || !password || password.length < 6) throw new Error('Dados inválidos')

      // Confere que esse barbeiro está no time do caller
      const { data: link } = await supabaseAdmin
        .from('barbershop_team').select('id')
        .eq('shop_owner_id', shopOwnerId).eq('barber_id', barberId).eq('active', true).maybeSingle()
      if (!link && !isCeo) throw new Error('Barbeiro não pertence ao seu time')

      const { error } = await supabaseAdmin.auth.admin.updateUserById(barberId, { password })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Ação inválida')
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
