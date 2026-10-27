begin;

-- Selecting a table alias into a row variable treats the alias as one composite
-- column. Select alias.* so PostgreSQL assigns each field to the row variable.
do $$
declare
  v_definition text;
  v_fixed_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.claim_answer_evaluation(uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  v_fixed_definition := pg_catalog.replace(
    v_definition,
    E'\nselect answer\n  into v_answer\n',
    E'\nselect answer.*\n  into v_answer\n'
  );
  v_fixed_definition := pg_catalog.replace(
    v_fixed_definition,
    E'\n  select session\n  into v_session\n',
    E'\n  select session.*\n  into v_session\n'
  );

  if v_fixed_definition <> v_definition then
    execute v_fixed_definition;
  elsif v_definition not like E'%\nselect answer.*\n  into v_answer\n%'
    or v_definition not like E'%\n  select session.*\n  into v_session\n%'
  then
    raise exception 'claim_answer_evaluation definition did not contain the expected row selections';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.claim_speaking_evaluation(uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(v_definition, E'\r\n', E'\n');

  v_fixed_definition := pg_catalog.replace(
    v_definition,
    E'\n  select attempt\n  into v_attempt\n',
    E'\n  select attempt.*\n  into v_attempt\n'
  );

  if v_fixed_definition <> v_definition then
    execute v_fixed_definition;
  elsif v_definition not like E'%\n  select attempt.*\n  into v_attempt\n%'
  then
    raise exception 'claim_speaking_evaluation definition did not contain the expected row selection';
  end if;
end;
$$;

commit;
