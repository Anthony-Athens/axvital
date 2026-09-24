-- Existing per-account, database-backed budgets; no audio/transcript storage.
begin;
do $patch$
declare definition text;
begin
 definition := pg_get_functiondef('public.axvital_consume_api_budget(text)'::regprocedure);
 if position('voice-log/parse:POST' in definition)=0 then
  if position('else null end;' in definition)=0 then raise exception 'VOICE_BUDGET_PATCH_MISMATCH'; end if;
  definition := replace(definition,'else null end;','when ''voice-log/parse:POST'' then 3 else null end;');
  execute definition;
 end if;
end $patch$;
commit;
