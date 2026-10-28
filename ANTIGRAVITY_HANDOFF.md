# Cimiento — handoff para Antigravity

Trabaja sobre esta base como desarrollador web senior. No cambies el stack sin una necesidad concreta.

## Contrato técnico
- PWA estática para GitHub Pages.
- HTML + CSS + JavaScript vanilla con módulos ES.
- Sin servidor, sin build, sin framework, sin dependencias de runtime.
- IndexedDB como única base local.
- Fechas civiles como `YYYY-MM-DD` calculadas con `America/Lima`.
- Mantener toda la lógica de rachas en `js/streaks.js`.
- Mantener exportación/importación completa y versionada.
- No incorporar texto bíblico RVR1960; solo referencias estructuradas.

## Antes de tocar código
1. Ejecuta `npm test`.
2. Lee `README.md`.
3. Revisa `js/streaks.js`, `js/dates.js`, `js/db.js` y `js/backup.js`.
4. Haz cambios pequeños y verificables.
5. Después de cada cambio relevante, ejecuta `npm test` y `node --check` sobre los JS modificados.

## Criterios que no deben romperse
- 66 libros y 1.189 capítulos.
- Lectura y oración cuentan por día; asistencia cuenta solo en días aplicables.
- Un día de iglesia cumple únicamente si se asistió a todos los cultos programados de ese día.
- Cada culto cuenta por separado para el porcentaje de asistencia.
- Lunes sin culto no cuenta ni rompe la racha con el horario inicial.
- Registrar o editar días pasados debe recalcular rachas automáticamente.
- Un capítulo repetido no debe duplicar avance de un plan.
- Importar un respaldo reemplaza el estado local por el estado respaldado.

## Primera tarea sugerida
Haz una auditoría funcional de la V1 sin rediseñarla. Reporta bugs concretos, severidad, archivo/línea y prueba que debería cubrir cada bug. No agregues funciones fuera del alcance.
