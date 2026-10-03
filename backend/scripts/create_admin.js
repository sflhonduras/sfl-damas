import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

// Uso: node scripts/create_admin.js "Nombre Apellido" correo@dominio.com contraseñaSegura admin|consulta
async function main() {
  const [nombre, email, password, rol = 'admin'] = process.argv.slice(2);
  if (!nombre || !email || !password) {
    console.log('Uso: node scripts/create_admin.js "Nombre" correo@dominio.com contraseña [admin|consulta]');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO usuarios_admin (nombre, email, password_hash, rol)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = EXCLUDED.rol`,
    [nombre, email.toLowerCase().trim(), hash, rol]
  );
  console.log(`Usuario ${email} creado/actualizado con rol "${rol}".`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
