-- Privilegios para PostgREST / cliente JS (anon + authenticated).
-- Rode no SQL Editor se as tabelas foram criadas por migration e der 403 em todas as rotas.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
