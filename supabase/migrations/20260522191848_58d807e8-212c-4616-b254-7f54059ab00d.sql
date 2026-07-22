
CREATE OR REPLACE FUNCTION public.fire_web_push(_user_id uuid, _title text, _body text, _url text, _tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_url text := 'https://sxgpoobmvsnrrqnsibuh.supabase.co/functions/v1/web-push-send';
  v_secret text;
begin
  SELECT value INTO v_secret FROM public.internal_secrets WHERE name = 'webhook_push';
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object(
      'user_id', _user_id,
      'title', _title,
      'message', _body,
      'url', _url,
      'tag', _tag
    )
  );
exception when others then
  null;
end;
$function$;
