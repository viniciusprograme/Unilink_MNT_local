-- Aplicar uma vez em bancos já existentes (volumes Docker criados antes desta alteração).
ALTER TABLE perfis_usuario DROP CONSTRAINT IF EXISTS perfis_usuario_papel_check;
ALTER TABLE perfis_usuario ADD CONSTRAINT perfis_usuario_papel_check
    CHECK (papel IN ('solicitante', 'atendente', 'supervisor', 'administrador'));
