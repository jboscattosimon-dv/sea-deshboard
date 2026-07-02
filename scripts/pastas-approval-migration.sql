-- ============================================================
-- PASTAS + APROVAÇÃO DE DEMANDAS — MIGRATION
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. CAMPOS NOVOS EM demandas
-- ============================================================
ALTER TABLE demandas ADD COLUMN IF NOT EXISTS trello_card_id TEXT;
ALTER TABLE demandas ADD COLUMN IF NOT EXISTS data_conclusao DATE;

-- ============================================================
-- 2. PASTA_ID em portal_arquivos
-- ============================================================
ALTER TABLE portal_arquivos ADD COLUMN IF NOT EXISTS pasta_id TEXT;

-- ============================================================
-- 3. PASTAS (criadas pela equipe dentro de cada demanda)
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_pastas (
  id TEXT PRIMARY KEY DEFAULT 'pst_' || substr(md5(random()::text), 1, 8),
  demanda_id TEXT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  descricao TEXT,
  ordem INT DEFAULT 0,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_por_nome VARCHAR(100),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_pastas_demanda ON portal_pastas(demanda_id);

-- ============================================================
-- 4. APROVAÇÕES DE DEMANDAS (nível demanda, não arte)
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_aprovacoes_demanda (
  id TEXT PRIMARY KEY DEFAULT 'apd_' || substr(md5(random()::text), 1, 8),
  demanda_id TEXT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_nome VARCHAR(100) NOT NULL,
  acao VARCHAR(30) NOT NULL CHECK (acao IN ('aprovado', 'alteracao_solicitada')),
  motivo TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apd_demanda ON portal_aprovacoes_demanda(demanda_id);
CREATE INDEX IF NOT EXISTS idx_apd_cliente  ON portal_aprovacoes_demanda(cliente_id);

-- ============================================================
-- 5. NOVOS STATUS
-- ============================================================
INSERT INTO status (id, nome, cor)
VALUES ('s_awcli', 'Aguardando Aprovação do Cliente', '#8B5CF6')
ON CONFLICT (id) DO NOTHING;

INSERT INTO status (id, nome, cor)
VALUES ('s_concl', 'Concluída', '#059669')
ON CONFLICT (id) DO NOTHING;
