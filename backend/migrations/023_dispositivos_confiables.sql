-- "Recordar este dispositivo" para 2FA: al verificar el código correctamente, el navegador
-- queda marcado como confiable por unos días — la próxima vez que se entre desde ahí, se
-- salta el paso del código (pero la contraseña se sigue pidiendo siempre). Cada uso renueva
-- la vigencia, así que un dispositivo que se sigue usando no expira solo.
CREATE TABLE IF NOT EXISTS dispositivos_confiables (
  id                SERIAL PRIMARY KEY,
  usuario_admin_id  INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dispositivos_confiables_usuario ON dispositivos_confiables(usuario_admin_id);
