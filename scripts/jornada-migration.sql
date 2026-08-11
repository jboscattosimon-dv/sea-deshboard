-- Rodar no SQL Editor do Supabase
-- Modulo: Jornada de Onboarding (4 fases / etapas / checklist de encerramento)
-- Namespace "jornada_*" para nao colidir com as tabelas "onboarding_*" existentes
-- (que sao do formulario de coleta de documentos do cliente, feature separada).

CREATE TABLE IF NOT EXISTS jornada_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id TEXT NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido')),
  token_publico TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  concluido_por UUID REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS jornada_fases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id UUID NOT NULL REFERENCES jornada_onboarding(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  periodo_label VARCHAR(50),
  ordem INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jornada_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fase_id UUID NOT NULL REFERENCES jornada_fases(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  responsavel VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','andamento','concluido','bloqueado')),
  prazo_label VARCHAR(50),
  prazo_dias INT,
  mensagem_modelo TEXT,
  mensagem_enviada BOOLEAN NOT NULL DEFAULT false,
  acao_url TEXT,
  acao_label VARCHAR(50),
  visivel_cliente BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  ordem INT NOT NULL DEFAULT 0,
  concluido_por UUID REFERENCES usuarios(id),
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jornada_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id UUID NOT NULL REFERENCES jornada_onboarding(id) ON DELETE CASCADE,
  grupo VARCHAR(50) NOT NULL,
  label TEXT NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT false,
  concluido_por UUID REFERENCES usuarios(id),
  concluido_em TIMESTAMPTZ,
  ordem INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jornada_fases_jornada_id ON jornada_fases (jornada_id);
CREATE INDEX IF NOT EXISTS idx_jornada_etapas_fase_id ON jornada_etapas (fase_id);
CREATE INDEX IF NOT EXISTS idx_jornada_checklist_jornada_id ON jornada_checklist (jornada_id);
