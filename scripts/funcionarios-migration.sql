-- ============================================================
-- FUNCIONÁRIAS + FINANCEIRO DE PAGAMENTOS — MIGRATION
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. CADASTRO DE FUNCIONÁRIAS (pode ou não ter usuário/login vinculado)
-- ============================================================
CREATE TABLE IF NOT EXISTS funcionarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  cargo VARCHAR(100),
  telefone VARCHAR(30),
  email VARCHAR(150),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  data_admissao DATE,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE funcionarios DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_funcionarios_usuario ON funcionarios(usuario_id);

-- ============================================================
-- 2. DADOS FINANCEIROS DA FUNCIONÁRIA (salário/config, 1:1)
-- ============================================================
CREATE TABLE IF NOT EXISTS funcionarios_financeiro (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL UNIQUE REFERENCES funcionarios(id) ON DELETE CASCADE,
  valor_salario NUMERIC(10,2) DEFAULT 0,
  dia_pagamento INT DEFAULT 5,
  observacoes TEXT,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE funcionarios_financeiro DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PAGAMENTOS (um por competência/mês, igual clientes_pagamentos)
-- ============================================================
CREATE TABLE IF NOT EXISTS funcionarios_pagamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  data_pagamento DATE,
  forma_pagamento VARCHAR(30),
  observacao TEXT,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE funcionarios_pagamentos DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_func_pagamentos_funcionario ON funcionarios_pagamentos(funcionario_id);
