# Growa 0.7 · Experiencias de Mazatlán y comunidad voluntaria

## Objetivo y alcance

El proyecto extiende la plataforma de coordinación de hospitalidad con un módulo editorial de historia de Mazatlán, contenidos de descubrimiento territorial y una red social de **contacto voluntario entre personas adultas**. Conserva el catálogo, FastAPI, las sesiones y los módulos existentes de itinerarios. No es una red de pacientes ni almacena diagnósticos, expedientes clínicos, síntomas, tratamientos, historiales médicos o información sanitaria.

## Experiencia de frontend

- Navegación principal con menú desplegable de historia, cultura y guía, con versión móvil accesible.
- Línea del tiempo: vigilancia del Cerro del Vigía (1576), apertura comercial del puerto (1820-1821), Teatro Ángela Peralta (1874), Carnaval organizado (1898) y decreto de Zona de Monumentos Históricos (2001).
- Filtros de patrimonio, costa, cultura y gastronomía; preguntas frecuentes nativas mediante `details`.
- Fotografías de Mazatlán procedentes de Wikimedia Commons con atribución y términos de licencia visibles, sin presentarlas como imágenes propias.
- Comunidad con directorio opt-in, formularios de perfil, solicitudes de conexión, consentimiento mutuo, bandeja privada, bloqueo, reportes, retirada y moderación de administrador.
- No hay perfiles de usuario sintéticos que se presenten como personas reales; el directorio comienza vacío.

## API y modelo de privacidad

Tablas nuevas: `community_profiles`, `community_connections`, `community_messages`, `community_reports`. Se crean mediante el registro declarativo de SQLAlchemy.

| Ruta | Método | Control |
|---|---|---|
| `/api/community/status` | GET | Información pública |
| `/api/community/register` | POST | Solo demo; 18+ y consentimiento; límite de frecuencia |
| `/api/community/members` | GET | Únicamente perfiles voluntariamente visibles; no expone correos |
| `/api/community/me` | GET/PUT | Autenticación + CSRF para escribir |
| `/api/community/me/withdraw` | POST | Elimina perfil visible, elimina mensajes propios y retira conexiones |
| `/api/community/connect` | POST | Auth + CSRF; destinatario públicamente visible; anti-spam |
| `/api/community/connections` | GET | Únicamente las del usuario autenticado |
| `/api/community/connections/{id}/action` | POST | Solo participantes; aceptación exclusiva del destinatario; bloqueo |
| `/api/community/messages/{id}` | GET/POST | Solo conexión mutuamente aceptada; límite 600 caracteres |
| `/api/community/report` | POST | Usuario autenticado; registro de incidencia |
| `/api/community/moderation/reports` | GET | Solo admin |
| `/api/community/moderation/hide/{id}` | POST | Solo admin + CSRF |

**Importante:** no está implementada la confirmación de propiedad del correo mediante enlaces de activación. Por ello, el registro público se encuentra **bloqueado por código en modo producción** y no puede habilitarse solo mediante variables de entorno. En modo demo se permiten cuentas de prueba, marcadas como no verificadas; la información está alojada en SQLite no persistente en Render Free y puede perderse en cada reinicio. No utilizar datos personales reales o sensibles en esa instancia.

Se aplican medidas básicas de autenticación, Argon2, cookies HttpOnly/Secure bajo HTTPS, CSRF, límites de frecuencia en memoria, autorización por titularidad, visibilidad opcional y sanitización HTML en el cliente. **No equivalen a una auditoría independiente de seguridad** ni a una protección de abuso distribuido.

## Gestión de riesgos y pendientes

1. Incorporar verificación de correo electrónico, recuperación de contraseña, confirmación de identidad para perfiles profesionales y controles de suplantación antes de abrir registro público productivo.
2. Conectar Render con Neon mediante secret manager, activar `PRODUCTION=true`, activar migraciones (Alembic), respaldo y retención documentada. No pasar claves por chat.
3. Moderación real: designar responsable, tiempos de respuesta, trazabilidad de reportes, sanciones, eliminación y protección ante acoso.
4. Poner políticas de privacidad, términos de uso, aviso legal, tratamiento de datos y consentimiento verificable con asesoría jurídica local.
5. Seguridad adicional: límites distribuidos, captcha, detección de spam, rate limiting por cuenta/IP a nivel proxy, auditoría de sesiones, autorización y revisiones de API.
6. Pruebas E2E de frontend en navegador y dispositivos, contraste WCAG y lectores de pantalla; los errores de JavaScript no se detectan solo con `node --check`.
7. Carga y disponibilidad de imágenes de Wikimedia Commons y respeto de atribuciones, CC BY 3.0 / CC BY-SA 4.0.
8. Investigación de licencia/hosting para fotos, mapa y terceros; no se garantizan SLA ni reserva médica.
9. Capacidad: los actuales 512 MB de Render Free limitan concurrencia y robustez; SQLite local no ofrece persistencia durable.

## Fuentes históricas consultadas

- DOF (2001), decreto de Zona de Monumentos Históricos de Mazatlán: https://www.dof.gob.mx/nota_detalle.php?codigo=2047043&fecha=27/03/2001
- INAH, Catálogo Nacional de Monumentos Históricos, Teatro Ángela Peralta: https://catalogonacionalmhi.inah.gob.mx/consulta_publica/detalle/71498
- Secretaría de Cultura, Inventario de Carnaval de Mazatlán: https://sic.cultura.gob.mx/ficha.php?table=frpintangible&table_id=418
- INAH, Ciudad y Puerto de Mazatlán: https://lugares.inah.gob.mx/es/node/4835
- Fotos y licencias: fichas originales de Wikimedia Commons enlazadas en la interfaz.

## Pruebas

`tests/test_community.py` cubre registro demo, privacidad de directorio, aceptación de contactos, autorización de mensajes, retirada de perfil, activos frontend y lectura de reportes por administrador.

La existencia de pruebas en GitHub **no implica que hayan sido ejecutadas**: GitHub Actions ha mostrado ejecuciones fallidas sin jobs funcionales. Se recomienda ejecutarlas en una máquina CI con runner o un entorno aislado reproducible antes de un despliegue con usuarios reales.

Alcance de implementación: prototipo avanzado de producto digital, **no sistema clínico ni lanzamiento comercial autorizado**.
