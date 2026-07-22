import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify the caller is a CEO
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Not authenticated')

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('Not authenticated')

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'ceo')
      .single()

    if (!roleCheck) throw new Error('Not authorized - CEO only')

    const body = await req.json()
    const { action, email, password, displayName, userId, username, newEmail, taxaAppValor, taxaIsentaAte } = body
    console.log('Action:', action, 'Username:', username, 'DisplayName:', displayName)

    if (action === 'create' || action === 'add') {
      const adminEmail = email || `${username}@barbershop.app`

      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(u => u.email === adminEmail)

      let newUserId: string

      if (existing) {
        // User exists, just ensure role is assigned
        newUserId = existing.id
        console.log('User already exists, assigning role:', newUserId)
      } else {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: adminEmail,
          password,
          email_confirm: true,
        })
        if (createError) {
          console.error('Create user error:', createError.message)
          throw createError
        }
        newUserId = newUser.user.id
      }

      // Check if role already exists
      const { data: existingRole } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', newUserId)
        .eq('role', 'admin')
        .single()

      if (!existingRole) {
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: newUserId, role: 'admin', display_name: displayName })
        if (roleError) {
          console.error('Role insert error:', roleError.message)
          throw roleError
        }
      }

      // Ensure profile exists
      const { data: profileExists } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', newUserId)
        .single()

      if (!profileExists) {
        await supabaseAdmin
          .from('profiles')
          .insert({ id: newUserId, full_name: displayName })
      }


      return new Response(JSON.stringify({ success: true, userId: newUserId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete' || action === 'remove') {
      // Delete related data first
      await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
      await supabaseAdmin.from('notificacoes').delete().eq('user_id', userId)
      await supabaseAdmin.from('profiles').delete().eq('id', userId)
      await supabaseAdmin.auth.admin.deleteUser(userId)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete-client') {
      // Delete a client (no role required, just a regular user)
      await supabaseAdmin.from('notificacoes').delete().eq('user_id', userId)
      await supabaseAdmin.from('avaliacoes').delete().eq('cliente_id', userId)
      await supabaseAdmin.from('agendamentos').delete().eq('cliente_id', userId)
      await supabaseAdmin.from('profiles').delete().eq('id', userId)
      await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
      await supabaseAdmin.auth.admin.deleteUser(userId)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'detail') {
      if (!userId) throw new Error('userId is required')

      // Get profile
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, telefone, endereco_completo, link_google_maps, avatar_url, data_nascimento, taxa_app_valor, taxa_isenta_ate')
        .eq('id', userId)
        .single()

      // Get email from auth
      const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(userId)

      // Count clients
      const { count: clientCount } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('adm_responsavel_id', userId)

      // Count appointments
      const { count: appointmentCount } = await supabaseAdmin
        .from('agendamentos')
        .select('id', { count: 'exact', head: true })
        .eq('barbeiro_id', userId)

      // Count gallery photos
      const { count: photoCount } = await supabaseAdmin
        .from('galeria_fotos')
        .select('id', { count: 'exact', head: true })
        .eq('adm_id', userId)

      // Avg rating
      const { data: ratings } = await supabaseAdmin
        .from('avaliacoes')
        .select('nota')
        .eq('adm_id', userId)

      const avgRating = ratings && ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + r.nota, 0) / ratings.length).toFixed(1)
        : null

      // Count promos
      const { count: promoCount } = await supabaseAdmin
        .from('promocoes')
        .select('id', { count: 'exact', head: true })
        .eq('adm_id', userId)

      return new Response(JSON.stringify({
        profile: profile || {},
        email: targetUser?.email || null,
        clientCount: clientCount || 0,
        appointmentCount: appointmentCount || 0,
        photoCount: photoCount || 0,
        avgRating,
        ratingCount: ratings?.length || 0,
        promoCount: promoCount || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update') {
      if (!userId) throw new Error('userId is required')

      // Update display name if provided
      if (displayName) {
        await supabaseAdmin
          .from('user_roles')
          .update({ display_name: displayName })
          .eq('user_id', userId)
          .eq('role', 'admin')

        await supabaseAdmin
          .from('profiles')
          .update({ full_name: displayName })
          .eq('id', userId)
      }

      // Update password if provided
      if (password) {
        const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
        if (pwError) throw pwError
      }


      // Update login email if provided (exatamente o que foi digitado)
      if (newEmail) {
        const cleanEmail = String(newEmail).trim().toLowerCase().replace(/\s+/g, '')
        const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: cleanEmail,
          email_confirm: true,
        })
        if (emailError) throw emailError
      }

      // Update taxa do app (valor e/ou isenção temporal)
      const taxaPatch: Record<string, unknown> = {}
      if (taxaAppValor !== undefined && taxaAppValor !== null && taxaAppValor !== '') {
        const num = Number(taxaAppValor)
        if (!Number.isNaN(num) && num >= 0) taxaPatch.taxa_app_valor = num
      }
      if (taxaIsentaAte !== undefined) {
        taxaPatch.taxa_isenta_ate = taxaIsentaAte || null // string ISO ou null para limpar
      }
      if (Object.keys(taxaPatch).length > 0) {
        const { error: taxaErr } = await supabaseAdmin.from('profiles').update(taxaPatch).eq('id', userId)
        if (taxaErr) throw taxaErr
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'stats') {
      // Dashboard global em tempo real (somente CEO)
      const today = new Date()
      const todayStr = today.toISOString().slice(0, 10)
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)

      const [
        adminsRes,
        clientsRes,
        apptTotalRes,
        apptTodayRes,
        apptMonthRes,
        ticketsRes,
        subsRes,
        paymentsRes,
        productsRes,
        ordersRes,
        eventsRes,
        notifsRes,
      ] = await Promise.all([
        supabaseAdmin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin'),
        supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).not('adm_responsavel_id', 'is', null),
        supabaseAdmin.from('agendamentos').select('id', { count: 'exact', head: true }).neq('status', 'cancelled'),
        supabaseAdmin.from('agendamentos').select('id', { count: 'exact', head: true }).eq('data', todayStr).neq('status', 'cancelled'),
        supabaseAdmin.from('agendamentos').select('id', { count: 'exact', head: true }).gte('data', monthStart).neq('status', 'cancelled'),
        supabaseAdmin.from('suporte').select('id, status'),
        supabaseAdmin.from('platform_subscriptions').select('status, total_amount'),
        supabaseAdmin.from('payment_logs').select('amount_total, amount_app_fee, status, created_at').eq('status', 'approved').gte('created_at', monthStart),
        supabaseAdmin.from('marketplace_produtos').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('marketplace_pedidos').select('valor_total, status').in('status', ['pago', 'retirado']),
        supabaseAdmin.from('app_events').select('ativo, auto_ativar, data_inicio, data_fim'),
        supabaseAdmin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'ceo'),
      ])


      const tickets = ticketsRes.data || []
      const pendingTickets = tickets.filter((t: any) => t.status === 'pendente').length

      const subs = subsRes.data || []
      const subsPaid = subs.filter((s: any) => s.status === 'pago').length
      const subsPending = subs.filter((s: any) => s.status === 'pendente').length
      const subsOverdue = subs.filter((s: any) => s.status === 'atrasado').length
      const mrr = subs
        .filter((s: any) => s.status === 'pago')
        .reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0)

      const payments = paymentsRes.data || []
      const grossMonth = payments.reduce((sum: number, p: any) => sum + Number(p.amount_total || 0), 0)
      const feesMonth = payments.reduce((sum: number, p: any) => sum + Number(p.amount_app_fee || 0), 0)

      const orders = ordersRes.data || []
      const marketplaceRevenue = orders.reduce((sum: number, o: any) => sum + Number(o.valor_total || 0), 0)

      const nowMs = Date.now()
      const eventsActive = (eventsRes.data || []).filter((e: any) => {
        if (e.ativo) return true
        if (e.auto_ativar && e.data_inicio && e.data_fim) {
          return new Date(e.data_inicio).getTime() <= nowMs && new Date(e.data_fim).getTime() >= nowMs
        }
        return false
      }).length

      return new Response(JSON.stringify({
        barbershops: adminsRes.count || 0,
        clients: clientsRes.count || 0,
        appointmentsTotal: apptTotalRes.count || 0,
        appointmentsToday: apptTodayRes.count || 0,
        appointmentsMonth: apptMonthRes.count || 0,
        pendingTickets,
        totalTickets: tickets.length,
        subsPaid,
        subsPending,
        subsOverdue,
        mrr,
        grossMonth,
        feesMonth,
        products: productsRes.count || 0,
        marketplaceOrders: orders.length,
        marketplaceRevenue,
        eventsActive,
        notificationsSent: notifsRes.count || 0,
        generatedAt: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'system') {
      // Monitoramento de integrações / APIs / IA (somente CEO)
      const [evoRes, wqRes, mpRes, webhookRes] = await Promise.all([
        supabaseAdmin.from('evolution_config').select('paired, last_status, barbeiro_id'),
        supabaseAdmin.from('whatsapp_queue').select('status'),
        supabaseAdmin.from('mp_credentials').select('id'),
        supabaseAdmin.from('evolution_webhook_logs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ])

      const evo = evoRes.data || []
      const evoConnected = evo.filter((e: any) => e.paired === true).length
      const wq = wqRes.data || []
      const wqByStatus: Record<string, number> = {}
      wq.forEach((q: any) => { wqByStatus[q.status] = (wqByStatus[q.status] || 0) + 1 })

      return new Response(JSON.stringify({
        ai: { configured: !!Deno.env.get('LOVABLE_API_KEY'), provider: 'Lovable AI' },
        evolution: {
          total: evo.length,
          connected: evoConnected,
          disconnected: evo.length - evoConnected,
        },
        mercadopago: { accounts: (mpRes.data || []).length },
        whatsappQueue: {
          total: wq.length,
          pending: wqByStatus['pendente'] || 0,
          sent: (wqByStatus['enviado'] || 0) + (wqByStatus['entregue'] || 0) + (wqByStatus['lido'] || 0),
          failed: wqByStatus['erro'] || 0,
        },
        webhooks24h: webhookRes.count || 0,
        generatedAt: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'broadcast') {
      // Central de notificações: dispara notificação para um público-alvo (somente CEO)
      const titulo = String(body.titulo || '').trim()
      const mensagem = String(body.mensagem || '').trim()
      const target = String(body.target || 'all') // 'all' | 'clientes' | 'admins' | <barberId>
      if (!titulo || !mensagem) throw new Error('Título e mensagem são obrigatórios')

      const { data: roles } = await supabaseAdmin.from('user_roles').select('user_id, role')
      const roleMap = new Map<string, string>()
      ;(roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role))

      let targetIds: string[] = []

      if (target === 'admins') {
        targetIds = (roles || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id)
      } else if (target === 'clientes') {
        const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        targetIds = (usersList?.users || [])
          .filter((u) => !roleMap.has(u.id)) // clientes não têm role
          .map((u) => u.id)
      } else if (target === 'all') {
        const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        targetIds = (usersList?.users || []).map((u) => u.id)
      } else {
        // target = id de um barbeiro específico → notifica os clientes vinculados
        const { data: clients } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('adm_responsavel_id', target)
        targetIds = (clients || []).map((c: any) => c.id)
      }

      if (targetIds.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const rows = targetIds.map((uid) => ({
        user_id: uid,
        tipo: 'ceo',
        titulo,
        mensagem,
        lida: false,
      }))

      // Insere em lotes para evitar payloads muito grandes
      const chunkSize = 500
      let inserted = 0
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        const { error: insErr } = await supabaseAdmin.from('notificacoes').insert(chunk)
        if (insErr) throw insErr
        inserted += chunk.length
      }

      return new Response(JSON.stringify({ success: true, sent: inserted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list') {
      const { data: admins } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role, display_name')
        .eq('role', 'admin')

      return new Response(JSON.stringify({ admins: admins || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list-all-users') {
      // Lista todos os usuários do auth + role + display_name + plain_password + barbeiro vinculado
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const users = usersList?.users || []

      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role, display_name')

      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, telefone, adm_responsavel_id')

      const { data: configs } = await supabaseAdmin
        .from('configuracoes')
        .select('nome_barbearia')
        .limit(1)
      const shopName = configs?.[0]?.nome_barbearia || 'Barbearia'

      const adminNames = new Map<string, string>()
      ;(roles || []).filter(r => r.role === 'admin').forEach(r =>
        adminNames.set(r.user_id, r.display_name || '—')
      )

      const result = users.map(u => {
        const role = roles?.find(r => r.user_id === u.id)
        const profile = profiles?.find(p => p.id === u.id)
        const isClient = !role
        const isAdmin = role?.role === 'admin'
        const isCeo = role?.role === 'ceo'
        const email = u.email || ''
        // username = parte antes do @
        const username = email.split('@')[0]
        const barberLinkedName = profile?.adm_responsavel_id
          ? adminNames.get(profile.adm_responsavel_id) || null
          : null
        return {
          user_id: u.id,
          email,
          username,
          display_name: role?.display_name || profile?.full_name || username,
          telefone: profile?.telefone || null,
          plain_password: null,
          role: isCeo ? 'ceo' : isAdmin ? 'admin' : 'cliente',
          barbearia: isAdmin ? `Barbearia ${role?.display_name || profile?.full_name || ''}`.trim() : shopName,
          barbeiro_vinculado: isClient ? barberLinkedName : null,
          created_at: u.created_at,
        }
      })

      return new Response(JSON.stringify({ users: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Invalid action')
  } catch (error) {
    console.error('manage-admin error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
