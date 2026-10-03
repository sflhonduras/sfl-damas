// Promueve UNA cuenta específica (por correo) a 'super_admin' — pensado para Carlos, el
// único Super Administrador según lo acordado. Muestra también, aparte, a cualquier OTRA
// cuenta que hoy tenga rol 'admin' — esas se quedan como 'admin' (ahora configurable), y
// van a necesitar que Carlos les asigne permisos por módulo desde el panel de Usuarios,
// porque de lo contrario se quedan sin acceso a nada hasta que se les configure.
//
// Modo SIMULACIÓN por defecto. Para aplicar:
//   node scripts/promover_super_admin.js --aplicar

import { pool } from '../src/db.js';

const aplicar = process.argv.includes('--aplicar');
const CORREO_SUPER_ADMIN = 'sfl.honduras@gmail.com'; // ajusta si no es el correo correcto

async function main() {
  console.log(aplicar ? '⚠️  Modo APLICAR: se van a guardar los cambios.' : 'Modo SIMULACIÓN (no se guarda nada). Corre con --aplicar para guardar.');
  console.log('');

  const { rows: candidato } = await pool.query(
    'SELECT id, nombre, email, rol FROM usuarios_admin WHERE email = $1',
    [CORREO_SUPER_ADMIN]
  );

  if (!candidato[0]) {
    console.log(`⚠ No se encontró ningún usuario con el correo "${CORREO_SUPER_ADMIN}". Ajusta CORREO_SUPER_ADMIN en el script.`);
  } else {
    console.log(`--- Cuenta a promover a Super Administrador ---`);
    console.log(`  ${candidato[0].nombre} (${candidato[0].email}) · rol actual: ${candidato[0].rol} -> super_admin`);
    if (aplicar) {
      await pool.query("UPDATE usuarios_admin SET rol = 'super_admin' WHERE id = $1", [candidato[0].id]);
    }
  }

  const { rows: otrosAdmin } = await pool.query(
    "SELECT id, nombre, email FROM usuarios_admin WHERE rol = 'admin' AND email <> $1",
    [CORREO_SUPER_ADMIN]
  );

  console.log(`\n--- Otras cuentas con rol 'admin' que se QUEDAN así (ahora configurable) (${otrosAdmin.length}) ---`);
  if (otrosAdmin.length === 0) {
    console.log('  (ninguna — no hay más cuentas admin aparte de la tuya)');
  } else {
    otrosAdmin.forEach(u => console.log(`  - ${u.nombre} (${u.email}) — recuerda asignarle permisos por módulo desde Usuarios, o se queda sin acceso a nada.`));
  }

  console.log('');
  console.log(aplicar ? '✅ Cambios guardados.' : 'Nada se guardó todavía. Corre con --aplicar para guardar.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
