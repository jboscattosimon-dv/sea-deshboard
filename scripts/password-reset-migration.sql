-- Rodar no SQL Editor do Supabase
-- Recuperação de senha via e-mail (tela de login > "Esqueceu sua senha?")

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token    ON password_reset_tokens (token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario  ON password_reset_tokens (usuario_id);

-- Mesmo motivo de sempre (ver CLAUDE.md): o backend usa a chave anon do Supabase e faz
-- o controle de acesso via Express, não via RLS. Tabelas novas nascem com RLS ligado.
ALTER TABLE password_reset_tokens DISABLE ROW LEVEL SECURITY;
