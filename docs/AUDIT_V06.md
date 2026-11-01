# Informe de auditoría técnica — Growa Hospitality Intelligence (v0.6)

**Alcance:** repositorio `Murua-Alvaro/growa-turismo-medico`, despliegue Render Free y proyecto de base de datos Neon `growa-turismo-medico`. Se trata de un **prototipo**, no de una plataforma clínica autorizada ni un motor de reservas comerciales con proveedores confirmados.

## Integraciones y condición de funcionamiento

| Integración | Implementación | Activo en la demostración | Requisito de producción |
|---|---|---|---|
| **OR-Tools CP-SAT** | `app/optimizer.py`: selección multiobjetivo acotada, diversidad de alternativas, cuatro preferencias | Sí, cuando la librería se importa correctamente; fallback determinista | Medir latencia y memoria con inventario creciente |
| **Valhalla / OSM** | `app/routing.py`: consulta vial HTTPS, timeout, caché y límite de frecuencia | No hay servicio externo configurado: distancia en línea recta sin minutos | Configurar instancia propia `ROUTING_BASE_URL`, acuerdos de uso y calidad del mapa |
| **pgvector / Neon** | `app/discovery.py`: vectores hash deterministas (96 dimensiones), índice HNSW y búsqueda textual contextual | Búsqueda local. La instancia Render demo **no está conectada a Neon** | `DATABASE_URL` privado, `PRODUCTION=true`, `VECTOR_SEARCH_ENABLED=true` |
| **FullCalendar** | Calendario solo visual; vista semanal / mensual y lista; eventos no editables | Sí si carga el recurso CDN; vista simplificada como respaldo | Evaluar CDN/SRI/autohospedaje y reglas de consentimiento |
| **Archivo .ics** | `static/agenda.js`: exportación local desde el navegador | Sí | Revisar zona horaria en clientes internacionales y confirmación por prestador |

**Importante:** la indexación vectorial actual no utiliza embeddings de modelos de lenguaje. Usa una proyección hash determinista y sin datos clínicos; evita describirla como inteligencia clínica o búsqueda semántica neuronal.

## Cambios de robustez

- **Reservas:** bloqueos transaccionales en PostgreSQL y manejo idempotente; confirmaciones por componente, sin suponer que una reserva local corresponde a una reserva externa.
- **Vencimiento:** la transición a `requires_review` se confirma antes de devolver HTTP 409, para no revertir el estado.
- **Privacidad entre proveedores:** fichas de reservaciones por proveedor limitadas a sus propios componentes; identificadores de otros proveedores y total ajeno ocultos.
- **Agenda autorizada:** conflictos de Google FreeBusy se retiran antes de la elección OR-Tools, para evitar ocultar opciones viables.
- **Mapas:** la distancia aérea jamás se comunica como duración de viaje; `geometry` distingue ruta vial de línea ilustrativa.
- **Seguridad:** sesiones HttpOnly, Argon2, CSRF, roles, proveedores no verificados por defecto; no exponer credenciales ni bases de datos de pacientes.
- **Arranque demo:** `app/selfcheck.py` valida compatibilidad del optimizador, vocabulario contextual, índice local y catálogo sin ejecutar rutas externas.

## Verificaciones efectuadas

- Sintaxis JavaScript: validación de los módulos públicos sin errores.
- Estructura HTML: IDs duplicados ausentes; controles de agenda y preferencias presentes.
- Generación ICS: comprobados `VCALENDAR`, `DTSTART;TZID=America/Mazatlan`, eventos de día completo y `STATUS:TENTATIVE`.
- Neon: extensión `vector`, tabla `growa_listing_vectors` e índice HNSW creados en proyecto aislado; sin registros de clientes.
- GitHub Actions: los intentos recientes finalizan como `failure` **sin pasos ni runner asignado**. Esto impide afirmar que `pytest` haya corrido exitosamente; requiere revisar permisos, límites/planes y configuración Actions de la cuenta.
- Render: el resultado de cada despliegue debe comprobarse con los logs y el estado `live` por hash de commit; una compilación satisfactoria no sustituye las pruebas funcionales.

## Riesgos pendientes para un lanzamiento real

1. **Base de datos de producción:** habilitar conexión Neon mediante las variables privadas de Render; no transportar passwords por chats ni repositorios. Actualmente la demostración puede usar SQLite efímera.
2. **Pruebas automatizadas:** activar runners en GitHub Actions y ejecutar `python -m pytest -q` con base aislada; revisar fallos y cobertura.
3. **Disponibilidad real:** contratos, consentimiento y sincronización individual por hotel, médico y transporte, con un modelo formal de cupos.
4. **Escalabilidad:** migraciones Alembic, manejo de tareas de fondo, caché persistente, observabilidad, límites distribuidos y cola de trabajos si crecen usuarios.
5. **Seguridad / legal:** amenaza y privacidad, almacenamiento mínimo, cumplimiento aplicable, accesibilidad y pruebas de penetración antes de capturar datos identificables.
6. **Ruteo vial:** sin proveedor Valhalla propio no se presenta ETA; las distancias geográficas no representan trayecto transitable ni accesibilidad en movilidad.
7. **Calendario:** archivos .ics son orientativos; una exportación no envía ni confirma solicitudes. El tiempo local de agenda debe probarse en varios sistemas operativos y husos horarios.
8. **Proveedor demo:** las fotos, precios, direcciones y horarios sintéticos no son ofertas verificadas.

## Guía de operación y rollback

- Commit principal: rama `main`; `autoDeploy=false`. Validar cambios antes de activar un despliegue manual.
- Estado de salud: `GET /api/health`; catálogo `GET /api/catalog`; búsqueda `GET /api/discover?query=hotel`; rutas `GET /api/route?from_id=...&to_id=...`.
- Ante un nuevo despliegue fallido, mantener el commit previo que esté `live`; investigar los registros en el panel de Render y no modificar variables privadas en GitHub.
- Las pruebas de integración `tests/test_intelligence.py` usan inventario sintético y un adaptador simulado; no llaman a Google ni a Valhalla reales.

## Licencias de componentes

- OR-Tools: Apache 2.0.
- Valhalla: MIT.
- pgvector: PostgreSQL License.
- FullCalendar estándar: MIT (no se integran funciones Premium).
- OpenStreetMap: datos bajo ODbL, sujeto a atribución y términos del proveedor de teselas o datos.

Documento técnico de alcance, no certificación de seguridad ni de disponibilidad comercial.
