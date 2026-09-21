-- ============================================================
-- LIBERA UPLOAD NO BUCKET "Portal" PARA A CHAVE ANON
-- Rodar no SQL Editor do Supabase
--
-- Sintoma: upload de arquivo pelo Portal do Cliente falha com
-- "new row violates row-level security policy" (ver logs do servidor).
-- Causa: o bucket "Portal" nao tinha politica de storage liberando
-- INSERT (nem select/update/delete) para o role "anon", que e a unica
-- chave que este app usa (nao ha sessao de Auth do Supabase - a
-- autenticacao e toda via JWT proprio, igual descrito no CLAUDE.md
-- para as tabelas do Postgres).
-- ============================================================

drop policy if exists "Portal bucket - acesso total para anon" on storage.objects;

create policy "Portal bucket - acesso total para anon"
on storage.objects
for all
to anon
using (bucket_id = 'Portal')
with check (bucket_id = 'Portal');
