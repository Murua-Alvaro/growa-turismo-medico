# Growa Turismo Médico · Hospitality Platform

Plataforma de coordinación de hospitalidad médica (no presta servicios clínicos): búsqueda y comparación de hospedaje, profesionales independientes, transporte privado y negocios; disponibilidad, itinerarios y coordinación con prestadores.

**Estado:** proyecto de desarrollo. Los proveedores semilla y sus precios son exclusivamente demostrativos. No representan ofertas reales ni disponibilidad médica verificable.

## Novedades de inteligencia v0.5

- **Planificador con OR-Tools CP-SAT:** selección diversa y explicable de itinerarios; cuatro criterios (equilibrio, menor costo, cercanía y comodidad), con restricciones de capacidad preservadas.
- **Rutas Valhalla (configuración opcional):** consulta vial por identificadores de proveedores; cuando no existe servidor configurado muestra distancia en línea recta sin inventar minutos de viaje.
- **Búsqueda contextual en español y pgvector:** búsquedas por necesidades y características. Vectores deterministas y recuperación HNSW en Neon cuando se active `VECTOR_SEARCH_ENABLED`, no un modelo clínico ni un LLM.
- **Agenda FullCalendar estándar:** vista semanal, mensual y lista de propuestas y solicitudes locales, sin modificar reservas externas.

**Arquitectura, licencias, auditoría y configuración:** [docs/INTELLIGENCE_V05.md](docs/INTELLIGENCE_V05.md).

## Mejoras de confiabilidad v0.6

- **Calendario portable:** exportación local `.ics` con eventos tentativos y zona de Mazatlán, traducción al español y alternativa legible sin CDN.
- **Optimización ajustada:** la preferencia de cercanía se pondera correctamente y los horarios consideran diferencias en minutos.
- **Disponibilidad reordenada:** se consultan calendarios Google autorizados y se excluyen conflictos **antes** de optimizar alternativas; nunca se deduce disponibilidad de un proveedor sin autorización.
- **Revisión al iniciar:** un autodiagnóstico breve en demostración valida el motor de recomendaciones, vectores de búsqueda y catálogo; falla el arranque si detecta una regresión esencial.
- **Auditoría técnica:** [evidencias, límites, riesgos y verificaciones pendientes](docs/AUDIT_V06.md).

## Novedades v0.7 · Mazatlán y comunidad

- **Experiencia editorial de destino:** historia del puerto sustentada en fuentes oficiales, lugares para explorar, filtros de interés, fotografías atribuidas y preguntas desplegables.
- **Navegación ampliada:** mega menú en escritorio, menú móvil accesible y secciones independientes sin reemplazar el catálogo de hospitalidad.
- **Growa Comunidad:** perfiles opt-in por visitante/residente/anfitrión/guía, directorio sin emails, solicitudes de conexión que requieren aceptación, mensajes internos y bloqueo.
- **Privacidad y moderación:** controles para ocultar/retirar perfiles, reportes de abuso, revisión administrativa y cuentas privadas por defecto.
- **Seguridad del piloto:** inscripción autogestionada solo en demostración. La inscripción abierta productiva se encuentra bloqueada hasta incorporar verificación de correo, moderación operativa y persistencia durable.
- **Calidad de frontend:** corregidas seis selecciones de elementos que afectaban botones y filtros; sintaxis JavaScript y estructura del documento revisadas.

Consulta [especificación y matriz de riesgos de la comunidad](docs/COMMUNITY_V07.md).

## Tecnologías

- **Backend:** FastAPI y SQLAlchemy 2; SQLite solo para desarrollo, PostgreSQL compatible con Neon.
- **Frontend:** interfaz web responsiva con explorador visual, mapa MapLibre, filtros, agenda FullCalendar y búsqueda contextual.
- **Seguridad:** sesiones revocables y cookies HttpOnly, roles de coordinador y proveedor; sin usuarios predeterminados en producción.
- **Integraciones:** Google Calendar mediante OAuth autorizado; el calendario no representa citas de terceros.
- **Despliegue:** Render mediante render.yaml, con controles de seguridad previos al uso público.

## Inicio local

1. `python -m venv .venv`
2. Activa el entorno y ejecuta `pip install -r requirements.txt`.
3. Copia `.env.example` a `.env` y configura `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` y `SESSION_SECRET`.
4. Para datos sintéticos opcionales: `DEMO_SEED=true` (solo en modo desarrollo).
5. `uvicorn app.main:app --reload` y abre http://localhost:8000.

El despliegue público requiere Neon, variables seguras y una auditoría adicional. Consulta `docs/DEPLOYMENT.md`.

## Comprobaciones

```bash
pip install -r requirements.txt
pytest -q
node --check static/app.js
```

La instalación de OR-Tools consume recursos adicionales en Render Free. Comprueba memoria y tiempos de arranque; hay una selección determinista de reserva si el motor CP-SAT no está disponible.

## Limitaciones

- Los horarios de prestadores médicos solo pueden declararse o sincronizarse con autorización expresa.
- Las reservas de hoteles y transporte no se confirman externamente sin conexión con el proveedor.
- No recolectar diagnósticos, expedientes ni datos clínicos en esta aplicación.
- No usar el prototipo con datos personales reales ni cobrar reservas sin completar la revisión de seguridad, permisos y reglas comerciales.
