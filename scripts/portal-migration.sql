-- ============================================================
-- PORTAL DO CLIENTE — MIGRATION
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. ALTERAÇÕES NA TABELA clientes
-- ============================================================
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE,
  ADD COLUMN IF NOT EXISTS senha_hash TEXT,
  ADD COLUMN IF NOT EXISTS acesso_portal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telefone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- ============================================================
-- 2. ALTERAÇÕES NA TABELA demandas (campos adicionais para o portal)
-- ============================================================
ALTER TABLE demandas
  ADD COLUMN IF NOT EXISTS titulo VARCHAR(200),
  ADD COLUMN IF NOT EXISTS prioridade VARCHAR(20) DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS prazo DATE,
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(100),
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_nome VARCHAR(100),
  ADD COLUMN IF NOT EXISTS arte_pronta BOOLEAN DEFAULT false;

-- ============================================================
-- 3. TABELA cal_conteudos (cria se não existir, adiciona colunas do portal)
-- ============================================================
CREATE TABLE IF NOT EXISTS cal_conteudos (
  id TEXT PRIMARY KEY DEFAULT 'cal_' || substr(md5(random()::text), 1, 8),
  titulo VARCHAR(200) NOT NULL,
  data_publicacao DATE NOT NULL,
  cliente_id TEXT REFERENCES clientes(id),
  canal VARCHAR(100),
  status VARCHAR(30) DEFAULT 'rascunho',
  responsavel_id UUID REFERENCES usuarios(id),
  descricao TEXT,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  legenda TEXT,
  hashtags TEXT,
  arte_url TEXT,
  arte_path TEXT
);

-- Se a tabela já existia, garante que as colunas do portal estão presentes
ALTER TABLE cal_conteudos ADD COLUMN IF NOT EXISTS legenda TEXT;
ALTER TABLE cal_conteudos ADD COLUMN IF NOT EXISTS hashtags TEXT;
ALTER TABLE cal_conteudos ADD COLUMN IF NOT EXISTS arte_url TEXT;
ALTER TABLE cal_conteudos ADD COLUMN IF NOT EXISTS arte_path TEXT;

-- ============================================================
-- 4. COMENTÁRIOS DO PORTAL (chat entre cliente e equipe)
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_comentarios (
  id TEXT PRIMARY KEY,
  demanda_id TEXT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  autor_tipo VARCHAR(10) NOT NULL CHECK (autor_tipo IN ('cliente', 'equipe')),
  autor_id TEXT NOT NULL,
  autor_nome VARCHAR(100) NOT NULL,
  mensagem TEXT NOT NULL DEFAULT '',
  tem_anexo BOOLEAN DEFAULT false,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_comentarios_demanda ON portal_comentarios(demanda_id);

-- ============================================================
-- 5. ANEXOS DE COMENTÁRIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_comentario_anexos (
  id TEXT PRIMARY KEY,
  comentario_id TEXT NOT NULL REFERENCES portal_comentarios(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tipo VARCHAR(100),
  tamanho BIGINT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. ARQUIVOS DO PORTAL (enviados por cliente ou equipe)
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_arquivos (
  id TEXT PRIMARY KEY,
  demanda_id TEXT REFERENCES demandas(id) ON DELETE CASCADE,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome VARCHAR(300) NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tipo VARCHAR(100),
  tamanho BIGINT,
  enviado_por_tipo VARCHAR(10) NOT NULL CHECK (enviado_por_tipo IN ('cliente', 'equipe')),
  enviado_por_id TEXT NOT NULL,
  enviado_por_nome VARCHAR(100) NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_arquivos_cliente ON portal_arquivos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_portal_arquivos_demanda ON portal_arquivos(demanda_id);

-- ============================================================
-- 7. ARTES FINAIS (enviadas pela equipe para aprovação do cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_artes (
  id TEXT PRIMARY KEY,
  demanda_id TEXT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  versao INT DEFAULT 1,
  nome VARCHAR(300) NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tipo VARCHAR(100),
  status_arte VARCHAR(30) DEFAULT 'aguardando'
    CHECK (status_arte IN ('aguardando', 'aprovado', 'alteracao_solicitada', 'rejeitado')),
  responsavel_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_nome VARCHAR(100),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_artes_demanda ON portal_artes(demanda_id);

-- ============================================================
-- 8. APROVAÇÕES DO CLIENTE
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_aprovacoes (
  id TEXT PRIMARY KEY,
  demanda_id TEXT NOT NULL REFERENCES demandas(id) ON DELETE CASCADE,
  arte_id TEXT REFERENCES portal_artes(id) ON DELETE SET NULL,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_nome VARCHAR(100) NOT NULL,
  acao VARCHAR(30) NOT NULL CHECK (acao IN ('aprovado', 'alteracao_solicitada', 'rejeitado')),
  motivo TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_aprovacoes_demanda ON portal_aprovacoes(demanda_id);
CREATE INDEX IF NOT EXISTS idx_portal_aprovacoes_cliente ON portal_aprovacoes(cliente_id);

-- ============================================================
-- 9. NOTIFICAÇÕES DO CLIENTE
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_notificacoes (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  mensagem TEXT,
  lida BOOLEAN DEFAULT false,
  entidade VARCHAR(50),
  entidade_id TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_notificacoes_cliente ON portal_notificacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_portal_notificacoes_lida ON portal_notificacoes(cliente_id, lida);

-- ============================================================
-- NOTA: Criar bucket "portal" no Supabase Storage
-- Acesse: Storage > New bucket > Nome: "portal" > Public: true
-- ============================================================
