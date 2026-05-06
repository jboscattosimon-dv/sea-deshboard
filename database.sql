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

-- ── CRM ───────────────────────────────────────────────────────────────

-- Tabela de leads
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  origem VARCHAR(50),
  etapa VARCHAR(50) DEFAULT 'primeiro_contato'
    CHECK (etapa IN ('primeiro_contato','resposta_inicial','tem_interesse','reuniao_agendada','fechou')),
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de atividades (follow-up)
CREATE TABLE IF NOT EXISTS crm_atividades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  concluida BOOLEAN DEFAULT false,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────

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
