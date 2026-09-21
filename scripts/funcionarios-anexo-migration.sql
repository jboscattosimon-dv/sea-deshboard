-- ============================================================
-- ANEXO (folha de pagamento) NOS PAGAMENTOS DE FUNCIONÁRIAS
-- Rodar no SQL Editor do Supabase
-- ============================================================

ALTER TABLE funcionarios_pagamentos ADD COLUMN IF NOT EXISTS anexo_url TEXT;
ALTER TABLE funcionarios_pagamentos ADD COLUMN IF NOT EXISTS anexo_storage_path TEXT;
ALTER TABLE funcionarios_pagamentos ADD COLUMN IF NOT EXISTS anexo_nome VARCHAR(300);
ALTER TABLE funcionarios_pagamentos ADD COLUMN IF NOT EXISTS anexo_tipo VARCHAR(100);
