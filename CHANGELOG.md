# Historial de versiones — Sistema SFL Damas FIHNEC

## v1.0.0 — 3 de octubre de 2026
- Primera versión de SFL Damas, construida a partir del código de SFL FIHNEC (SFL-Hombres)
  en su v1.4.0.
- Módulos incluidos: Formulario público de inscripción, Participantes, Diplomas, Reportería,
  Servidores, Inventario, Transporte, Eventos, Usuarios, Mantenimiento, Auditoría, Registro
  en Vivo e Informes de Cierre de Nivel.
- Módulos ocultados del menú (código intacto, mismo criterio que SAEL Damas — el acceso al
  panel ya está limitado a gente de confianza): Medallas, Acceso Servidores (Portal del
  Servidor) y Autoconsulta (participantes consultando su propia información). También se
  ocultó Cocina, que tampoco es parte del alcance de este sistema.
- Base de datos propia y separada en Neon (no comparte datos con SFL-Hombres).
- Nuevo script de una sola ejecución para cargar el historial de participantes desde Excel
  al arrancar el sistema (ver backend/scripts/README_IMPORTACION_INICIAL.md).

---

Para el historial completo de SFL-Hombres (de donde se partió este sistema), ver el
CHANGELOG.md de ese repositorio (sflhonduras/registro).
