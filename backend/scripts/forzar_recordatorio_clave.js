// Fuerza que a TODOS los usuarios del panel (menos Super Administrador) se les pregunte
// "¿Quieres cambiar tu contraseña?" en su PRÓXIMO inicio de sesión, en vez de esperar a que
// se cumplan los 90 días reales desde hoy.
//
// Simulación por defecto (no toca nada). Para aplicar de verdad:
//   node scripts/forzar_recordatorio_clave.js --aplicar
import { pool } from '../src/db.js';

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  const { rows } = await pool.query(
    `SELECT id, nombre, email, rol FROM usuarios_admin WHERE rol != 'super_admin' AND activo = TRUE ORDER BY nombre`
  );

  console.log(`Usuarios que verán el recordatorio en su próximo ingreso (${rows.length}):`);
  for (const u of rows) console.log(`  - ${u.nombre} (${u.email}) — rol: ${u.rol}`);

  if (!aplicar) {
    console.log('\nEsto fue una simulación. Nada se aplicó todavía.');
    console.log('Para aplicarlo de verdad, corre:\n  node scripts/forzar_recordatorio_clave.js --aplicar');
    await pool.end();
    return;
  }

  await pool.query(
    `UPDATE usuarios_admin
     SET password_actualizada_en = now() - interval '91 days', password_cambio_pospuesto_en = NULL
     WHERE rol != 'super_admin' AND activo = TRUE`
  );
  console.log(`\nListo. ${rows.length} usuario(s) verán el recordatorio en su próximo inicio de sesión.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
