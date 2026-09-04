-- Rodar no SQL Editor do Supabase
-- Módulo: Onboarding de Clientes (genérico — Modelos > Etapas > Tarefas)
--
-- Substitui o antigo módulo "Jornada de Onboarding" (tabelas jornada_*), que tinha
-- 4 fases fixas no código. As tabelas jornada_* NÃO são removidas por este script
-- (não há necessidade — os dados atuais são de teste e o módulo deixa de ser usado
-- pela interface, mas o histórico fica preservado no banco caso seja preciso).
--
-- Reaproveita: clientes (clientes.id) e usuarios (usuarios.id) já existentes.

-- ── Responsável padrão do cliente (novo — usado pelo tipo de responsável
--    "Responsável pelo cliente" nas tarefas de onboarding) ──────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES usuarios(id);

-- ── MODELOS (reutilizáveis, mantidos após a criação de onboardings) ────

CREATE TABLE IF NOT EXISTS onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_template_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- responsavel_tipo: 'pessoa' | 'cliente_responsavel' | 'definir_depois'
-- prazo_tipo: 'sem_prazo' | 'dias_apos_inicio_onboarding' | 'dias_apos_inicio_etapa' | 'data_especifica'
--   (MVP resolve apenas 'sem_prazo' e 'dias_apos_inicio_onboarding' ao criar o onboarding do
--    cliente; os outros dois ficam reservados no schema para evolução futura sem nova migration.)
CREATE TABLE IF NOT EXISTS onboarding_template_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id UUID NOT NULL REFERENCES onboarding_template_etapas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'tarefa'
    CHECK (tipo IN ('tarefa','reuniao','mensagem','documento','link','formulario','aprovacao')),
  responsavel_tipo VARCHAR(20) NOT NULL DEFAULT 'definir_depois'
    CHECK (responsavel_tipo IN ('pessoa','cliente_responsavel','definir_depois')),
  responsavel_usuario_id UUID REFERENCES usuarios(id),
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  prazo_tipo VARCHAR(30) NOT NULL DEFAULT 'sem_prazo'
    CHECK (prazo_tipo IN ('sem_prazo','dias_apos_inicio_onboarding','dias_apos_inicio_etapa','data_especifica')),
  prazo_dias INT,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ── ONBOARDINGS DE CLIENTE (cópia independente do modelo) ──────────────

CREATE TABLE IF NOT EXISTS onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id TEXT NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  template_id UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  nome VARCHAR(150) NOT NULL,
  responsavel_id UUID REFERENCES usuarios(id),
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido','cancelado')),
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  previsao_conclusao DATE,
  concluido_em TIMESTAMPTZ,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id UUID NOT NULL REFERENCES onboarding_etapas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'tarefa'
    CHECK (tipo IN ('tarefa','reuniao','mensagem','documento','link','formulario','aprovacao')),
  responsavel_usuario_id UUID REFERENCES usuarios(id),
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','andamento','concluida','bloqueada')),
  prazo DATE,
  concluido_em TIMESTAMPTZ,
  concluido_por UUID REFERENCES usuarios(id),
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ── HISTÓRICO / AUDITORIA DO ONBOARDING (granular, por cliente) ────────
-- Separado da tabela genérica "historico" para não poluí-la com o volume de
-- eventos de tarefas, e para permitir consultar o histórico de UM onboarding
-- rapidamente (idx abaixo). Segue o mesmo espírito da tabela "historico" existente.
CREATE TABLE IF NOT EXISTS onboarding_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id),
  usuario_nome VARCHAR(100),
  tipo VARCHAR(40) NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onb_tpl_etapas_template   ON onboarding_template_etapas (template_id);
CREATE INDEX IF NOT EXISTS idx_onb_tpl_tarefas_etapa     ON onboarding_template_tarefas (etapa_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_cliente       ON onboardings (cliente_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_responsavel   ON onboardings (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_onb_etapas_onboarding     ON onboarding_etapas (onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onb_tarefas_etapa         ON onboarding_tarefas (etapa_id);
CREATE INDEX IF NOT EXISTS idx_onb_tarefas_responsavel   ON onboarding_tarefas (responsavel_usuario_id);
CREATE INDEX IF NOT EXISTS idx_onb_tarefas_prazo         ON onboarding_tarefas (prazo);
CREATE INDEX IF NOT EXISTS idx_onb_atividades_onboarding ON onboarding_atividades (onboarding_id);

-- ── SEED: modelo "Onboarding Padrão", a partir do processo atual da SEA ─
-- Todas as tarefas nascem com responsavel_tipo = 'definir_depois' (nenhum nome fixo
-- no código) — é só abrir o editor do modelo e escolher os responsáveis reais da equipe.
DO $$
DECLARE
  v_template_id UUID;
  v_etapa_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM onboarding_templates WHERE nome = 'Onboarding Padrão') THEN

    INSERT INTO onboarding_templates (nome, descricao, ativo)
    VALUES ('Onboarding Padrão', 'Modelo padrão de implantação de novos clientes da SEA.', true)
    RETURNING id INTO v_template_id;

    INSERT INTO onboarding_template_etapas (template_id, nome, ordem) VALUES (v_template_id, 'Implementação', 0) RETURNING id INTO v_etapa_id;
    INSERT INTO onboarding_template_tarefas (etapa_id, titulo, ordem, obrigatoria, prazo_tipo, prazo_dias) VALUES
      (v_etapa_id, 'Mandar boas-vindas', 0, true, 'dias_apos_inicio_onboarding', 1),
      (v_etapa_id, 'Solicitar dados cadastrais', 1, true, 'dias_apos_inicio_onboarding', 1),
      (v_etapa_id, 'Assinar contrato', 2, true, 'dias_apos_inicio_onboarding', 1),
      (v_etapa_id, 'Criar grupo do cliente', 3, true, 'dias_apos_inicio_onboarding', 1),
      (v_etapa_id, 'Colocar normas na descrição do grupo', 4, false, 'dias_apos_inicio_onboarding', 1),
      (v_etapa_id, 'Enviar mensagem de boas-vindas no grupo', 5, true, 'dias_apos_inicio_onboarding', 1),
      (v_etapa_id, 'Enviar vídeo artístico de boas-vindas', 6, true, 'dias_apos_inicio_onboarding', 2),
      (v_etapa_id, 'Apresentação da responsável pelo atendimento', 7, true, 'dias_apos_inicio_onboarding', 2),
      (v_etapa_id, 'Marcar reunião de iniciação', 8, true, 'dias_apos_inicio_onboarding', 3),
      (v_etapa_id, 'Solicitar 5 links de perfis de referência com áudio explicativo', 9, false, 'dias_apos_inicio_onboarding', 5),
      (v_etapa_id, 'Enviar presente de boas-vindas', 10, false, 'dias_apos_inicio_onboarding', 7);

    INSERT INTO onboarding_template_etapas (template_id, nome, ordem) VALUES (v_template_id, 'Processos', 1) RETURNING id INTO v_etapa_id;
    INSERT INTO onboarding_template_tarefas (etapa_id, titulo, ordem, obrigatoria, prazo_tipo, prazo_dias) VALUES
      (v_etapa_id, 'Executar reunião de iniciação', 0, true, 'dias_apos_inicio_onboarding', 8),
      (v_etapa_id, 'Criar Trello e Drive com acessos de equipe e cliente', 1, true, 'dias_apos_inicio_onboarding', 8),
      (v_etapa_id, 'Criar quadro de informações gerais do cliente', 2, false, 'dias_apos_inicio_onboarding', 9),
      (v_etapa_id, 'Construir plano de marketing do cliente', 3, true, 'dias_apos_inicio_onboarding', 10),
      (v_etapa_id, 'Enviar mapa de iniciação para o cliente', 4, true, 'dias_apos_inicio_onboarding', 9),
      (v_etapa_id, 'Enviar formulário de dados e solicitar print do perfil', 5, true, 'dias_apos_inicio_onboarding', 9),
      (v_etapa_id, 'Marcar reunião de entrega do plano de estratégia', 6, true, 'dias_apos_inicio_onboarding', 12),
      (v_etapa_id, 'Executar reunião de entrega do plano de estratégia', 7, true, 'dias_apos_inicio_onboarding', 14);

    INSERT INTO onboarding_template_etapas (template_id, nome, ordem) VALUES (v_template_id, 'Ambientação', 2) RETURNING id INTO v_etapa_id;
    INSERT INTO onboarding_template_tarefas (etapa_id, titulo, ordem, obrigatoria, prazo_tipo, prazo_dias) VALUES
      (v_etapa_id, 'Marcar reunião da Jornada de Implementação', 0, true, 'dias_apos_inicio_onboarding', 16),
      (v_etapa_id, 'Executar reunião da Jornada de Implementação', 1, true, 'dias_apos_inicio_onboarding', 17),
      (v_etapa_id, 'Enviar vídeo de apresentação após a reunião', 2, true, 'dias_apos_inicio_onboarding', 17),
      (v_etapa_id, 'Enviar mensagem de reestruturação de perfil (quando aplicável)', 3, false, 'sem_prazo', NULL);

    INSERT INTO onboarding_template_etapas (template_id, nome, ordem) VALUES (v_template_id, 'Finalização', 3) RETURNING id INTO v_etapa_id;
    INSERT INTO onboarding_template_tarefas (etapa_id, titulo, ordem, obrigatoria, prazo_tipo, prazo_dias) VALUES
      (v_etapa_id, 'Entregar calendário de conteúdos', 0, true, 'dias_apos_inicio_onboarding', 25),
      (v_etapa_id, 'Enviar áudio explicando a construção da estratégia', 1, true, 'dias_apos_inicio_onboarding', 25),
      (v_etapa_id, 'Enviar orientação sobre prazos, obrigações e organização', 2, true, 'dias_apos_inicio_onboarding', 26),
      (v_etapa_id, 'Verificar se está tudo certo para o mês começar', 3, true, 'dias_apos_inicio_onboarding', 29),
      (v_etapa_id, 'Verificar se todas as entregas estão OK', 4, true, 'dias_apos_inicio_onboarding', 30),
      (v_etapa_id, 'Enviar lembrete de prazos em caso de pendências', 5, false, 'sem_prazo', NULL),
      (v_etapa_id, 'Enviar mensagem de comemoração da primeira postagem', 6, true, 'dias_apos_inicio_onboarding', 31);

  END IF;
END $$;
