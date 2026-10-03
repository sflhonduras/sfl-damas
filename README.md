# SFL Damas · FIHNEC — Sistema de Inscripción a Seminarios

Sistema web para el **Seminario para la Formación de Líderes (SFL) de Damas**, de FIHNEC
(Fraternidad Internacional de Hombres de Negocios del Evangelio Completo). Construido a
partir del código de SFL-Hombres (repositorio `sflhonduras/registro`, v1.4.0), con un
alcance de módulos más reducido y una base de datos propia y separada.

```
sfl-damas/
├── backend/     API en Node.js + Express + PostgreSQL (Neon)
└── frontend/    Sitio web en React (Vite) + Tailwind CSS
```

Subdominio previsto: **damas.sflhonduras.com**

## Módulos incluidos

Formulario público de inscripción, Participantes, Diplomas, Reportería, Servidores,
Inventario, Transporte, Eventos, Usuarios, Mantenimiento, Auditoría, Registro en Vivo e
Informes de Cierre de Nivel (estos dos últimos viven dentro de la pantalla de
Estadísticas/Dashboard).

## Módulos ocultados (código intacto, no removido)

Medallas, Acceso Servidores (Portal del Servidor), Autoconsulta (consulta de información
para participantes) y Cocina. Mismo criterio usado en SAEL Damas: se ocultan del menú y de
los enlaces públicos porque no son parte del alcance de este sistema, pero el código,
las rutas y las páginas siguen existiendo en el proyecto — no hace falta reconstruirlas si
algún día se necesitan. El acceso al panel ya está limitado a gente de confianza, así que
no hace falta además bloquear el acceso directo por URL.

## Carga inicial de datos históricos (Excel)

A diferencia de SFL-Hombres, este sistema **no** tiene un botón de "Importar Excel" en el
panel — la carga de participantes de eventos pasados se hace **una sola vez**, al momento
de arrancar el sistema, con un script de línea de comandos. Ver
`backend/scripts/README_IMPORTACION_INICIAL.md` para el detalle del formato esperado y
cómo ejecutarlo.

---

## 1. Cómo probar el sitio en tu computadora

### Requisitos
- Node.js 20 o superior
- PostgreSQL (local, o una base gratuita en Neon — ver sección de despliegue)

### Backend
```bash
cd backend
cp .env.example .env        # edita DATABASE_URL con tu conexión de Postgres
npm install
npm run migrate             # crea las tablas y los eventos base
node scripts/create_admin.js "Tu Nombre" tu@correo.com tuContraseña super_admin
npm run dev                 # http://localhost:4000
```

### Frontend
```bash
cd frontend
cp .env.example .env.local  # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                 # http://localhost:5173
```

---

## 2. Despliegue (mismo patrón que SFL-Hombres y SAEL Damas)

1. **Neon** (https://neon.tech) → base de datos PostgreSQL propia y separada para SFL
   Damas (no comparte datos con SFL-Hombres).
2. **Render** (https://render.com) → hosting del backend (API), conectado al repositorio
   `sflhonduras/sfl-damas`, carpeta raíz `backend/`. Variables de entorno: `DATABASE_URL`
   (la de Neon), `JWT_SECRET` (una clave larga y aleatoria propia, no reusar la de
   SFL-Hombres), `CORS_ORIGIN` (la URL del frontend en Netlify + el dominio final).
3. **Netlify** (https://netlify.com) → hosting del frontend, carpeta raíz `frontend/`.
   Variable de entorno: `VITE_API_URL` = la URL de Render + `/api`.
4. Dominio: conectar `damas.sflhonduras.com` al sitio de Netlify (registro CNAME en el
   proveedor DNS de `sflhonduras.com`).

Antes de usarlo con datos reales:
- [ ] Corre las migraciones (`node scripts/aplicar_una_migracion.js <archivo>.sql` una por
      una — nunca `migrate_v2.js`).
- [ ] Crea el usuario `super_admin` real y bórralo o cambia cualquier credencial de prueba.
- [ ] Corre la importación inicial del Excel histórico (ver sección de arriba).
- [ ] Define fechas, lugar y cupos de cada nivel desde **Panel → Eventos**.
- [ ] Configura `JWT_SECRET` y `CORS_ORIGIN` en Render con los valores reales de producción.

---

Para el historial de decisiones y cambios de esta versión, ver `CHANGELOG.md`. Para el
sistema original de donde se partió este código, ver `sflhonduras/registro` (SFL-Hombres).
