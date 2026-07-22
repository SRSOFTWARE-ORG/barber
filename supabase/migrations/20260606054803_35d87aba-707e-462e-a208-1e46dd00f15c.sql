create or replace function public.admin_reparent_identity(_provider text, _from uuid, _to uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_count integer;
begin
  update auth.identities
     set user_id = _to, updated_at = now()
   where provider = _provider and user_id = _from;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_reparent_identity(text, uuid, uuid) from public;
revoke all on function public.admin_reparent_identity(text, uuid, uuid) from anon;
revoke all on function public.admin_reparent_identity(text, uuid, uuid) from authenticated;
grant execute on function public.admin_reparent_identity(text, uuid, uuid) to service_role;