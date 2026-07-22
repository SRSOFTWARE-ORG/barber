-- Restrict column-level SELECT on profiles so sensitive platform-fee and PIX
-- credential fields are never returned through the row-level "Admins can view
-- own clients" policy (or any other authenticated/anon path). Owner and CEO
-- access to these fields is provided exclusively via SECURITY DEFINER RPCs.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, full_name, avatar_url, data_nascimento, telefone, updated_at,
  adm_responsavel_id, endereco_completo, link_google_maps, link_planos,
  tema_cores, hero_image_url, hero_object_fit, hero_object_position,
  plano_enabled, plano_modo, nome_barbearia, sinal_modo, sinal_percentual,
  passkey_enabled, comodidades, vinculo_em, barberhub_link,
  latitude, longitude, app_bg_url, app_bg_opacity, app_logo_url
) ON public.profiles TO anon, authenticated;

-- Owner-only access to their own sensitive payment/credential fields.
CREATE OR REPLACE FUNCTION public.get_my_payment_profile()
RETURNS TABLE(
  chave_pix text,
  qr_code_pix_url text,
  invite_code text,
  sinal_modo text,
  sinal_percentual integer,
  taxa_app_valor numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.chave_pix, p.qr_code_pix_url, p.invite_code,
         p.sinal_modo, p.sinal_percentual, p.taxa_app_valor
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_payment_profile() TO authenticated;

-- CEO-only access to an admin's platform-fee configuration.
CREATE OR REPLACE FUNCTION public.ceo_get_admin_taxa(_admin_id uuid)
RETURNS TABLE(taxa_app_valor numeric, taxa_isenta_ate timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.taxa_app_valor, p.taxa_isenta_ate
  FROM public.profiles p
  WHERE p.id = _admin_id
    AND public.has_role(auth.uid(), 'ceo'::app_role)
$$;

GRANT EXECUTE ON FUNCTION public.ceo_get_admin_taxa(uuid) TO authenticated;