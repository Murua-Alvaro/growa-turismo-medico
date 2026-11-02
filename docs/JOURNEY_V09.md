# Growa Journey · Seguimiento administrativo v0.9

**Estado:** código integrado en el repositorio. **No equivale a despliegue confirmado** ni a autorización para tratar datos clínicos. El módulo es un sistema de coordinación y acompañamiento no clínico para la visita a Mazatlán; la atención odontológica sigue siendo responsabilidad del prestador independiente.

## Experiencia implementada

- \`/mi-proceso\`: acceso privado del paciente. Revisión de progreso, tareas, propuestas de cita, mensajes administrativos y trazabilidad.
- \`/panel-medico\`: misma aplicación con permisos de prestador. Cada proveedor únicamente ve los casos vinculados a su propio usuario autorizado.
- \`/mi-proceso?demo=patient\` y \`/panel-medico?demo=doctor\`: vistas ficticias que no hacen escrituras de producción.
- Administrador y coordinador: listado general de casos, alta de proceso, selección de prestador real verificado, invitación individual con caducidad y renovación.
- Integración de navegación desde \`/\` y \`/odontologia\`.

## Flujo de principio a fin

1. Administrador crea una clínica real por \`POST /api/providers\` y asigna una cuenta al equipo mediante \`POST /api/provider-accounts\`. Solo los administradores verifican la ficha después de revisar documentación por \`PATCH /api/providers/{listing_id}/verify\`. Esa bandera no reemplaza la verificación profesional ni constituye una acreditación sanitaria.
2. Con una clínica activa, no DEMO, verificada y con cuenta asignada, el administrador abre **Nuevo proceso** en Growa Journey. Especifica nombre, correo, consulta general de interés e idioma.
3. El sistema crea un identificador de caso, guarda una invitación con **hash SHA-256 de un token aleatorio de 36 bytes** y vigencia de 7 días; retorna un enlace privado al administrador. No envía correos por su cuenta.
4. El paciente usa el enlace en el hash del navegador (el token no va en la URL solicitada al servidor). Si no tiene cuenta, la activa con contraseña Argon2 y aceptación explícita de condiciones del piloto. Si ya tiene cuenta, inicia sesión y vincula la invitación. Se comprueba el correo.
5. El equipo agrega tareas administrativas, recibe mensajes clasificados por tema y propone horarios. El paciente puede completar sus pendientes y responder por el canal habilitado.
6. El proveedor confirma explícitamente la cita. Solo entonces el proceso puede avanzar a la etapa «Cita confirmada». No representa disponibilidad externa, ni sustituye reservas Google Calendar o de la clínica.
7. El historial refleja cambios de etapa, tareas, invitaciones y acciones en la agenda. La auditoría general guarda creaciones y cambios importantes.

## Modelo de datos (tablas nuevas)

| Tabla | Información |
| --- | --- |
| \`journey_cases\` | Caso, paciente vinculado, prestador, clínica, etiqueta general de servicio, etapa |
| \`journey_invites\` | Hash de invitación, caducidad, estado de canje |
| \`journey_tasks\` | Tarea, responsable (paciente/equipo), tipo, fecha límite, estado |
| \`journey_messages\` | Mensajería administrativa por caso; no uso clínico |
| \`journey_appointments\` | Propuesta de cita, estado, duración, horario local de Mazatlán |
| \`journey_events\` | Bitácora resumida de hitos y acciones |

El despliegue usa \`Base.metadata.create_all\` ya presente en el servicio para incorporar tablas nuevas. En una instalación madura deberá sustituirse este procedimiento por migraciones versionadas con respaldo y revisión previa. No se ha aplicado una migración manual a Neon en esta entrega.

## Endpoints

| Método y ruta | Acceso |
| --- | --- |
| GET \`/api/journey/providers\` | Equipo autorizado; el proveedor solo ve sus clínicas verificadas |
| POST \`/api/journey/cases\` | Admin/coordinador/proveedor asignado; crea un caso e invitación |
| POST \`/api/journey/cases/{id}/reissue\` | Equipo autorizado, con acceso al caso; invalida enlaces anteriores |
| POST \`/api/journey/claim\` | Nuevo paciente con token, correo, contraseña y aceptación |
| POST \`/api/journey/claim-existing\` | Usuario existente, autenticado con CSRF |
| GET \`/api/journey/cases\` | Casos filtrados por rol y pertenencia |
| GET \`/api/journey/cases/{id}\` | Detalle filtrado por permisos |
| POST \`/api/journey/cases/{id}/tasks\` | Equipo autorizado |
| PATCH \`/api/journey/cases/{id}/tasks/{task_id}\` | Responsable autorizado/equipo |
| POST \`/api/journey/cases/{id}/messages\` | Participantes autorizados |
| PATCH \`/api/journey/cases/{id}/stage\` | Equipo autorizado, transiciones secuenciales |
| POST \`/api/journey/cases/{id}/appointments\` | Equipo autorizado, propuestas |
| PATCH \`/api/journey/cases/{id}/appointments/{appointment_id}\` | Equipo autorizado, confirmación o cancelación |

Las operaciones autenticadas con efectos de escritura usan verificación CSRF, salvo el canje inicial de invitación que usa validación de origen, token de alta entropía y limitación de intentos. Todas las lecturas de casos pasan por controles de autorización en el servidor. El frontend no decide la autorización.

## Restricciones de privacidad y seguridad

- No capturar ni subir estudios, radiografías, diagnósticos, expedientes médicos, recetas, datos bancarios ni imágenes clínicas.
- Los mensajes tienen fines **administrativos**; no son un chat para consulta médica. Se requieren políticas de privacidad, consentimiento verificable, cifrado, retención de datos, tratamiento de solicitudes de acceso/borrado, controles de respaldo y revisión legal antes de admitir información personal real.
- Cualquier almacenamiento de información clínica futura requerirá evaluación específica de normativas aplicables en México, posibles obligaciones internacionales, permisos y mecanismos de protección más estrictos. Neon del proyecto no debe presumirse compatible con HIPAA.
- Los precios/citas no equivalen a transacciones completadas o disponibilidad externa.
- Las invitaciones se entregan mediante canal privado, expiran en 7 días y pueden renovarse sin reusar el token.
- No se expone el correo del paciente a otros pacientes ni se permite acceder a un caso por conocer solo su ID.
- Las citas confirmadas dentro del módulo verifican superposición local con otras citas confirmadas del mismo prestador; esto no es sincronización con calendarios externos.

## Puesta en servicio pendiente

1. Servicio Render vigente identificado: \`srv-dbj6jk8473hc73ba1mug\`, URL \`https://growa-turismo-medico-qoon.onrender.com\`. El ID anterior \`srv-dbj6b6s9v7es73980540\` dejó de estar disponible. Despliegue demo del código Journey confirmado como **live** el 2 de noviembre de 2026, autodiagnóstico \`journey=passed\`. Los ajustes posteriores de permisos requieren redeploy.
2. Configurar \`DATABASE_URL\` vigente de Neon en el entorno seguro de ese servicio. No publicar secretos en GitHub. El proyecto Neon identificado es \`falling-lake-03374849\`.
3. Revisar \`PRODUCTION=true\`, \`PUBLIC_BASE_URL\`, \`ALLOWED_HOSTS\`, \`SESSION_SECRET\`, variables de administrador y configuración de proxy.
4. Desplegar el commit de \`main\` y verificar \`/api/health\`, \`/mi-proceso\`, \`/panel-medico\`, registro y separación de roles con cuentas ficticias.
5. Ejecutar \`pytest -q\`, \`python -m compileall -q app\`, \`node --check static/journey.js\`; inspeccionar logs y resultados del despliegue. Las ejecuciones observadas de GitHub Actions han fallado y no se obtuvo una prueba automatizada exitosa; los logs de dicho CI no estuvieron accesibles. El autodiagnóstico de arranque Render sí pasó, pero no sustituye toda la suite de pruebas.
6. Incorporar validación real de clínica y prestador antes de abrir casos reales. No utilizar datos de pacientes reales durante el piloto sin auditoría legal, operativa y de seguridad.

## Fuera de alcance de v0.9

Carga documental real, historia clínica, videollamadas integradas, pagos, firma digital, recordatorios por correo/SMS, sincronización real de agenda externa, reservas con terceros, facturación y automatización clínica. Ninguna de esas capacidades se presenta como si ya funcionara.
