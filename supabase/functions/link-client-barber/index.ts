import { corsHeaders } from '../_shared/cors.ts';
import { requireUser, errorResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user, supabase } = await requireUser(req);
    const { barberId, clientPhone } = await req.json();

    if (!barberId || typeof barberId !== 'string') {
      return new Response(JSON.stringify({ error: 'barberId é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Valida que barberId pertence a um admin (barbeiro real).
    const { data: barberRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', barberId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!barberRole) {
      return new Response(JSON.stringify({ error: 'Barbeiro inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só vincula o próprio perfil do usuário autenticado, e somente se não houver vínculo.
    const { data: profile } = await supabase
      .from('profiles')
      .select('adm_responsavel_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && !profile.adm_responsavel_id) {
      await supabase
        .from('profiles')
        .update({ adm_responsavel_id: barberId, telefone: clientPhone ?? undefined })
        .eq('id', user.id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return errorResponse(e, corsHeaders);
  }
});
