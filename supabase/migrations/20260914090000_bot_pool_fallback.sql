-- A full bot pool must not leave a human waiting indefinitely.
do $migration$
declare
  definition text;
  old_branch text := $old$if not found then
    return jsonb_build_object('added', false, 'reason', 'bot_pool_busy');
  end if;$old$;
  new_branch text := $new$if not found then
    insert into public.bot_profiles (id, username, difficulty, level, avatar_url)
    select 'BOT-ORTA-' || code, 'Misafir ' || substr(code, 1, 12), 'ORTA', 7 + floor(random()*11)::integer,
      './assets/avatars/' || (array['kedi.webp','panter.webp','tavsan.webp','aslan.webp'])[1+floor(random()*4)::integer]
    from (select upper(replace(gen_random_uuid()::text, '-', '')) as code) generated
    returning * into chosen_bot;
  end if;$new$;
begin
  select pg_get_functiondef('public.kantin_backfill_matchmaking(text)'::regprocedure) into definition;
  definition := replace(definition, chr(13), '');
  if position(old_branch in definition)=0 then
    raise exception 'Bot backfill definition changed; review before applying';
  end if;
  execute replace(definition, old_branch, new_branch);
end;
$migration$;
