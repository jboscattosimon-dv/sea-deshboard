-- ============================================================
-- CORRIGE PASTAS: de por-demanda para por-cliente
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- Remove a versão errada (por demanda) e recria por cliente
DROP TABLE IF EXISTS portal_pastas;

CREATE TABLE portal_pastas (
  id TEXT PRIMARY KEY DEFAULT 'pst_' || substr(md5(random()::text), 1, 8),
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  ordem INT DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_pastas_cliente ON portal_pastas(cliente_id);

-- pasta_id em portal_arquivos já existe da migration anterior
-- mas pode não existir em instâncias novas:
ALTER TABLE portal_arquivos ADD COLUMN IF NOT EXISTS pasta_id TEXT;
