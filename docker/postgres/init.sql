-- Roda uma única vez, na primeira inicialização do container (volume
-- vazio), ANTES de qualquer migration do Prisma existir. Por isso só cria
-- a role — os GRANTs nas tabelas de negócio ficam na própria migration SQL
-- que cria essas tabelas (ver prisma/migrations/.../migration.sql), já que
-- elas ainda não existem quando este script roda.
--
-- adts_app NUNCA é dono de tabela nenhuma: é só com GRANT explícito que ela
-- ganha acesso, e só a SELECT/INSERT/UPDATE/DELETE — nunca DDL. Sem isso a
-- Row Level Security não isola nada (o dono da tabela ignora RLS por
-- padrão).
CREATE ROLE adts_app WITH LOGIN PASSWORD 'adts_app';
GRANT CONNECT ON DATABASE adts TO adts_app;
GRANT USAGE ON SCHEMA public TO adts_app;
