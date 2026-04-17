-- Tabela de status
CREATE TABLE status (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(50) NOT NULL
);

INSERT INTO status (nome) VALUES ('Pendente'), ('Em andamento'), ('Concluído'), ('Cancelado');

-- Tabela de usuários
CREATE TABLE usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  papel VARCHAR(20) DEFAULT 'user' CHECK (papel IN ('admin', 'user')),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de demandas
CREATE TABLE demandas (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  status_id INT REFERENCES status(id) DEFAULT 1,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
