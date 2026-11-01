# Growa Odontología — versión inicial 0.8.1

## Referencia funcional y alcance

La experiencia se inspira en el recorrido funcional de directorios internacionales de turismo médico (categorías, comparación de clínicas, fichas y preparación de cotizaciones), tomando Bookimed como referencia de análisis. No se ha copiado código, fotografías, texto comercial, calificaciones, insignias ni la identidad gráfica de Bookimed.

**La versión es una demostración, no un directorio de clínicas verificadas.** Growa conserva los módulos previos de hotelería, transporte, planificador y comunidad. La odontología es la primera especialidad con navegación independiente.

## Rutas públicas

- `/odontologia`: portada, tratamientos, filtros, directorio y preguntas frecuentes.
- `/odontologia/clinicas/{id}`: ficha individual del registro odontológico identificado por su UUID hex.
- `GET /api/dental/treatments`: seis categorías generales de procedimientos, sin recomendaciones médicas.
- `GET /api/dental/clinics`: directorio por filtros de zona, idioma, accesibilidad, estado verificado y orden de referencia.
- `GET /api/dental/clinics/{id}`: ficha validada; rechaza registros no odontológicos.
- `POST /api/dental/quote-preview`: resumen **no enviado**, sin nombre, correo, diagnóstico ni dato clínico; no se guarda historial médico.

## Controles de frontend

1. Menú directo desde la cabecera y especialidades de Growa.
2. Selección de tratamientos (implantes, carillas, coronas/prótesis, ortodoncia, endodoncia y prevención) que **no filtra clínicas por especialidad no acreditada**; solo personaliza una consulta orientativa.
3. Directorio con búsqueda, zona, idioma, accesibilidad y estado verificado; orden explícito por nombre, zona o referencia de consulta. No se ofrece ordenar por supuesto éxito clínico.
4. Fichas propias con navegación y estado claro de verificación.
5. Comparación de hasta tres proveedores por información declarada; ninguna acreditación o reseña inventada.
6. Panel lateral de preferencias para preparar una solicitud, con resumen descargable (.txt), marcado **NO ENVIADO**.
7. Enlace al planificador de Growa con proveedor preseleccionado cuando existe.
8. Responsive para escritorio, tablet y móvil, con navegación accesible.

## Modelo de datos y verificación

Los perfiles proceden de la tabla `listings` existente con `category=medico` y nombre/subtipo odontológico. Se agregan tres registros ficticios e identificados como **DEMO** en el arranque no productivo para probar los filtros.

No hay opiniones de pacientes, médicos nominados, certificaciones, procedimientos específicos acreditados, paquetes de tratamiento ni precios clínicos verificados. La cifra de `consultation_reference_mxn` procede de `price_mxn` del catálogo y describe una consulta de referencia, **nunca un costo de tratamiento**. Todas las fotografías de demostración se identifican como ilustrativas.

Los perfiles `verified=false` no tienen enlace de contacto activado. Para activar cotizaciones comerciales se necesitarán convenios, comprobación de proveedores, precios y alcance por procedimiento, consentimientos, verificación de identidad y un canal privado de entrega.

## Seguridad, infraestructura y pruebas

- El backend valida filtros y restringe procedimientos a un conjunto cerrado.
- No se envían mensajes a clínicas ni se persiste información sanitaria en el endpoint de preparación.
- El front escapa campos dinámicos antes de insertarlos en HTML.
- El autodiagnóstico de arranque comprueba inventario y activos en modo demo.
- `tests/test_dental.py` cubre rutas, filtros, protección de información clínica, perfil individual y validación de solicitud.
- El entorno actual Render Free no equivale a producción; usar Neon con migraciones, backups y controles de privacidad antes de admitir pacientes reales.
- Las pruebas integrales E2E en navegador y el pipeline GitHub Actions deben ejecutarse con un runner disponible.

## Próximos hitos operativos

- Alta de clínicas reales (consentimiento, COFEPRIS/cédulas según corresponda, documentos, autorización de uso de imágenes).
- Modelar cada procedimiento, número de sesiones, materiales, riesgos y precios **aportados y revisados por el prestador**.
- Registro de solicitudes con identidad verificada, canal de contacto seguro, historial de consentimiento y protección de datos aplicable.
- Tablero de coordinación para presupuestos, estado y seguimiento por clínica; reservas únicamente tras confirmación del proveedor.
- Validación visual E2E (Playwright) y pruebas de accesibilidad en dispositivos reales.

El sistema no presta servicios clínicos, no realiza diagnóstico y no garantiza resultados.
