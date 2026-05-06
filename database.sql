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

-- Tabela de etapas do funil (gerenciável)
CREATE TABLE IF NOT EXISTS crm_etapas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  cor VARCHAR(20) DEFAULT '#999999',
  ordem INT DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO crm_etapas (key, label, cor, ordem) VALUES
  ('primeiro_contato', 'Primeiro Contato', '#3498DB', 1),
  ('resposta_inicial',  'Resposta Inicial',  '#9B59B6', 2),
  ('tem_interesse',     'Tem Interesse',     '#F39C12', 3),
  ('reuniao_agendada',  'Reunião Agendada',  '#1ABC9C', 4),
  ('fechou',            'Fechou',            '#27AE60', 5)
ON CONFLICT (key) DO NOTHING;

-- Tabela de leads
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  origem VARCHAR(50),
  etapa VARCHAR(50) DEFAULT 'primeiro_contato',
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Remove CHECK constraint se existir (para permitir etapas customizadas)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_etapa_check;

-- Novos campos de lead (migração)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS instagram VARCHAR(100);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS area_atuacao VARCHAR(100);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS informacoes TEXT;

-- Tabela de atividades (follow-up)
CREATE TABLE IF NOT EXISTS crm_atividades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  concluida BOOLEAN DEFAULT false,
  responsavel_id UUID REFERENCES usuarios(id),
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Adiciona responsavel_id se a tabela já existia sem ela
ALTER TABLE crm_atividades ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES usuarios(id);

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
