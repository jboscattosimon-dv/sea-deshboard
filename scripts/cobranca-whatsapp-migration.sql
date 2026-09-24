-- ============================================================
-- COBRANÇA AUTOMÁTICA POR WHATSAPP — pagamentos atrasados
-- Rodar no SQL Editor do Supabase
-- ============================================================

ALTER TABLE clientes_pagamentos ADD COLUMN IF NOT EXISTS aviso_atraso_enviado_em TIMESTAMPTZ;
