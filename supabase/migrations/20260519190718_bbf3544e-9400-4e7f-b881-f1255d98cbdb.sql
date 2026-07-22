
create extension if not exists pg_net with schema extensions;

-- Função genérica que dispara o web-push
create or replace function public.fire_web_push(_user_id uuid, _title text, _body text, _url text, _tag text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := 'https://sxgpoobmvsnrrqnsibuh.supabase.co/functions/v1/web-push-send';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'user_id', _user_id,
      'title', _title,
      'message', _body,
      'url', _url,
      'tag', _tag
    )
  );
exception when others then
  -- nunca quebra a inserção
  null;
end;
$$;

-- Trigger para notificacoes
create or replace function public.trg_push_notificacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fire_web_push(new.user_id, coalesce(new.titulo,'Barbearia'), coalesce(new.mensagem,''), '/notifications', 'notif-'||new.id::text);
  return new;
end;
$$;

drop trigger if exists push_on_notificacao on public.notificacoes;
create trigger push_on_notificacao
after insert on public.notificacoes
for each row execute function public.trg_push_notificacao();

-- Trigger para mensagens
create or replace function public.trg_push_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fire_web_push(new.destinatario_id, 'Nova mensagem', left(coalesce(new.conteudo,''), 120), '/chat', 'msg-'||new.id::text);
  return new;
end;
$$;

drop trigger if exists push_on_mensagem on public.mensagens;
create trigger push_on_mensagem
after insert on public.mensagens
for each row execute function public.trg_push_mensagem();
