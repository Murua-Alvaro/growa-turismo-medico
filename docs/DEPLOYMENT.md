# Despliegue seguro: GitHub → Render → Neon

## Estado
El código se conserva en GitHub, pero **no se considera listo para recibir datos personales reales**. La configuración `render.yaml` desactiva el despliegue automático. Revisa los pasos y prueba en entorno controlado primero.

## 1. Neon
1. Crea proyecto PostgreSQL en Neon.
2. Copia la cadena de conexión con `sslmode=require`.
3. Guarda en Render como `DATABASE_URL`; nunca en commits, capturas o .env público.
4. Esta aplicación usa SQLAlchemy + `psycopg` y crea el esquema inicial al iniciar. Para cambios posteriores se deben introducir migraciones Alembic antes de operar en producción.
5. Para la concurrencia real, usa PostgreSQL: las reservas bloquean las filas de inventario en una transacción; SQLite solo está previsto para uso local.

## 2. Render
- El servicio debe ser **Web Service** Python, no un Static Site.
- Comando de construcción: `pip install -r requirements.txt`
- Inicio: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers`
- `PRODUCTION=true`, `DEMO_SEED=false`.
- `DATABASE_URL`: cadena privada de Neon.
- `PUBLIC_BASE_URL`: URL **HTTPS exacta** del servicio, por ejemplo `https://growa-turismo-medico.onrender.com`; usada para comprobar el origen de escrituras.
- `ALLOWED_HOSTS`: `*.onrender.com`, agregar dominio propio cuando se active.
- `BOOTSTRAP_ADMIN_EMAIL`: correo administrador legítimo.
- `BOOTSTRAP_ADMIN_PASSWORD`: contraseña única de 14+ caracteres (no la de demos anteriores).
- `SESSION_SECRET`: generar aleatoriamente de 32+ caracteres (Render genera una con render.yaml).
- NO subir contraseñas a GitHub.
- Antes de habilitar acceso público: comprobar autenticación, CSRF, acceso por roles, permisos por proveedor, cabeceras y políticas de privacidad; añadir gestión de sesiones, recuperación de cuenta, alertas y copias de respaldo.

## 3. Calendar
La autorización **solo conecta la cuenta del coordinador**:
1. Crear OAuth Web Application en Google Cloud; habilitar Google Calendar API.
2. Registrar URI: `https://TU-DOMINIO/auth/google/callback`.
3. Guardar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
4. Generar Fernet key para `GOOGLE_TOKEN_FERNET_KEY`:
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
5. Ingresar como coordinador y autorizar; la autorización produce un token cifrado en la base.
6. Los eventos solo se publican si todos los componentes están confirmados; no se registra información clínica en los eventos.

## 4. Proveedores
- Cada prestador decide si declara sus horarios o autoriza una integración con su agenda.
- Las horas sintéticas de DEMO no equivalen a disponibilidad real.
- Inventario hotelero, traslados y reservas reales necesitan convenios, APIs o confirmación externa.
- Revisar Registro Nacional de Turismo, verificación de cédulas cuando proceda, contrato comercial y privacidad.
- Evitar almacenar diagnósticos, tratamientos, historiales de pacientes y otros datos clínicos.

## 5. Lista de pendientes para producción
- Incorporar Alembic y migraciones revisadas.
- Manejo de reversión/reconciliación para eventos de Calendar.
- Límite de peticiones distribuido con Redis/proxy; el bloqueo de login actual es por proceso.
- Revisión de permisos de reserva y logs sin datos sensibles.
- Pruebas de carga y concurrencia directamente contra Neon.
- Validación de proveedores y confirmaciones externas.
- Monitoreo, recuperación de errores, backups y políticas de retención.
