# Growa Turismo Médico · Hospitality Platform

Plataforma de coordinación de hospitalidad médica (no presta servicios clínicos): búsqueda y comparación de hospedaje, profesionales independientes, transporte privado y negocios; disponibilidad, itinerarios y coordinación con prestadores.

**Estado:** proyecto de desarrollo. Los proveedores semilla y sus precios son exclusivamente demostrativos. No representan ofertas reales ni disponibilidad médica verificable.

## Tecnologías

- **Backend:** FastAPI y SQLAlchemy 2; SQLite solo para desarrollo, PostgreSQL compatible con Neon.
- **Frontend:** interfaz web responsiva con explorador visual, mapa MapLibre, filtros y agenda.
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

## Limitaciones

- Los horarios de prestadores médicos solo pueden declararse o sincronizarse con autorización expresa.
- Las reservas de hoteles y transporte no se confirman externamente sin conexión con el proveedor.
- No recolectar diagnósticos, expedientes ni datos clínicos en esta aplicación.
- No usar el prototipo con datos personales reales ni cobrar reservas sin completar la revisión de seguridad, permisos y reglas comerciales.
