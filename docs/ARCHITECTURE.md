# Arquitectura de Growa Turismo Médico

## 1. Propósito y delimitación
Growa es una plataforma comercial y operativa de **coordinación de hospitalidad**. Permite descubrir hoteles, servicios profesionales independientes, transporte y comercios, y preparar una solicitud multicomponente. No diagnostica, recomienda tratamientos, ejecuta actos médicos ni sustituye a profesionales de salud.

## 2. Componentes
```text
                    Navegador (marketplace web)
                   búsqueda, filtros, foto, mapa
                              |
                      FastAPI (API)
          +-------------------+-------------------+
          |                   |                   |
   Catálogo y zonas    Planificación        Coordinación
          |                   |                   |
          +-------------------+-------------------+
                              |
                      SQLAlchemy ORM
                        SQLite local
                       PostgreSQL Neon
                              |
              Sesiones, inventario, slots, reservas
                              |
            Google Calendar OAuth del coordinador
                      o del proveedor
```

## 3. Modelo relacional
- `users`: administrador, coordinador y proveedor.
- `session_tokens`: autenticación revocable, tokens guardados como hash.
- `listings`: oferta, zona, categoría, atributos y propietario.
- `slots`: horarios **declarados** de proveedores médicos, no una agenda pública universal.
- `bookings`: itinerario, referencia administrativa, control de vencimiento e idempotencia.
- `booking_legs`: tres recursos independientes (cita, hotel, traslado) con estados por proveedor.
- `calendar_tokens`: autorización Google cifrada en reposo.
- `audit_log`: cambios relevantes.

En una ampliación futura se separarán `establishment`, `service`, `rate_plan`, `room_inventory`, `driver_asset`, `service_area` y `organization_members`.

## 4. Estados de la reserva
```text
pending
  ├── [todos los componentes confirmados] -> confirmed
  ├── [uno rechazado] -> rejected
  ├── [cancelación] -> canceled
  └── [vencimiento / conflicto externo] -> requires_review
```

La solicitud inicialmente retiene recursos durante 25 minutos. El conteo de ocupación considera reservas confirmadas o solicitudes pendientes **no vencidas**. Cuando existe un proveedor de Google Calendar conectado, la disponibilidad declarada se filtra contra sus periodos ocupados.

Una reserva interna confirmada no implica una reservación real en Booking.com, una plataforma hotelera o un centro médico. Esa confirmación comercial requerirá que cada aliado la acepte y/o que exista integración con su propio sistema.

## 5. Cálculo de disponibilidad
- Se consulta disponibilidad médica declarada por día.
- Se evalúan hospedajes y vehículos con sus capacidades locales.
- Se calcula ventana de check-in/check-out y transporte.
- Se bloquean conflictos por solapamiento temporal entre recursos.
- Se reutilizan resultados de disponibilidad para evitar consultas repetidas.
- Se ordenan resultados por compatibilidad horaria, distancia aproximada y costo.
- Si el prestador autoriza Google Calendar, la ocupación de su agenda se aplica a las opciones antes de devolver las mejores alternativas.

La distancia es geográfica aproximada y **no equivale a tiempos reales de tráfico**. Una integración posterior podrá consultar OSRM, Valhalla o GraphHopper para estimaciones viales.

## 6. Seguridad y privacidad
- Sesiones HttpOnly y protección CSRF; contraseñas Argon2.
- No existe usuario demo predeterminado en producción.
- Rol proveedor restringido a sus componentes.
- Las credenciales de Google se guardan cifradas mediante Fernet.
- No se registra información clínica en eventos ni perfiles.
- La búsqueda pública devuelve características comerciales, no registros sensibles.
- El repo público contiene ejemplos y pruebas, no contraseñas ni tokens.

Antes de comenzar operaciones reales: revisar cookies de larga duración, 2FA, recuperación de cuenta, gestión de organización/propietarios, control distribuido de rate limits, retención, backups, monitoreo y cumplimiento aplicable.

## 7. Código abierto
- FastAPI y SQLAlchemy: API y persistencia.
- PostgreSQL: backend transaccional compatible con Neon.
- MapLibre: mapa y ubicaciones en la interfaz.
- Proveedor externo autorizado Google Calendar: OAuth + FreeBusy + Calendar Events.
- OR-Tools, QloApps, Easy!Appointments y OSRM: alternativas analizadas para futuras integraciones; **no están instaladas ni integradas en esta versión**.

## 8. Calidad y despliegue
Existe workflow en `.github/workflows/ci.yml` para compilar Python y ejecutar tests. El 31 de octubre de 2026 GitHub Actions devolvió fallos de ejecución sin asignar un runner ni ejecutar pasos, de manera que **no existe evidencia de tests aprobados en Actions** todavía. Revisar configuración/cuota de Actions del repositorio y repetir el flujo antes de desplegar.

`render.yaml` proporciona una configuración reproducible sin despliegue automático. La cadena de Neon se debe configurar exclusivamente como variable privada de Render. Se requieren migraciones versionadas antes de cambios de esquema sobre datos reales.
