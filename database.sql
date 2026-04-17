-- Rodar no SQL Editor do Supabase

-- Tabela de status
CREATE TABLE IF NOT EXISTS status (
  id TEXT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  cor VARCHAR(20) DEFAULT '#999999'
);

INSERT INTO status (id, nome, cor) VALUES
  ('s1', 'Pronto pra postar',   '#27AE60'),
  ('s2', 'Arquivo não enviado', '#E74C3C'),
  ('s3', 'Aguardando aprovação','#E67E22'),
  ('s4', 'Alteração solicitada','#E6B800')
ON CONFLICT (id) DO NOTHING;

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY DEFAULT 'c_' || substr(md5(random()::text), 1, 8),
  nome VARCHAR(100) NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  papel VARCHAR(20) DEFAULT 'user' CHECK (papel IN ('admin', 'user')),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de demandas
CREATE TABLE IF NOT EXISTS demandas (
  id TEXT PRIMARY KEY DEFAULT 'dem_' || substr(md5(random()::text), 1, 8),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_id TEXT REFERENCES clientes(id),
  status_id TEXT REFERENCES status(id) DEFAULT 's1',
  descricao TEXT,
  observacao TEXT,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
