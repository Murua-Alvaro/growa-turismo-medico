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

## Actualización fotográfica — noviembre de 2026

Se ha reemplazado la imagen odontológica genérica por una selección específica de fotografías de Pexels. La portada de odontología muestra una recepción clínica con interacción humana; el acceso destacado desde la portada de Growa usa una recepción luminosa. Las fichas de demostración cuentan con fotografías distintas de equipos y espacios dentales; los perfiles individuales también muestran una pequeña galería de contexto.

**Las imágenes son ilustrativas y no representan clínicas, personal o instalaciones de Mazatlán.** No implican que quienes aparecen respalden Growa. Se muestran las atribuciones correspondientes y enlaces a las fotografías originales.

Selección y licencia:

- Pavel Danilyuk: recepción dental, consultorio, equipo y atención en mostrador: https://www.pexels.com/photo/patient-talking-to-a-receptionist-at-a-dental-clinic-6809664/
- Pavel Danilyuk: recepción luminosa: https://www.pexels.com/photo/a-dental-clinic-reception-desk-6809645/
- Pavel Danilyuk: equipo de atención: https://www.pexels.com/photo/dental-chair-and-equipment-in-a-clinic-6812480/
- Pavel Danilyuk: otro equipo: https://www.pexels.com/photo/a-dentist-clinic-equipment-6812444/
- Cedric Fauntleroy: sillón odontológico: https://www.pexels.com/photo/a-dental-chair-in-a-clinic-4269265/
- Anna Shvets: revisión dental: https://www.pexels.com/photo/woman-sitting-on-dental-chair-3845842/
- Tima Miroshnichenko: odontólogo en consultorio: https://www.pexels.com/photo/dentist-sitting-on-a-dental-chair-5355862/

Licencia de Pexels: https://www.pexels.com/license/. La licencia permite uso en websites y modificaciones y no debe interpretarse como autorización de respaldo o publicidad personal.

Archivos actualizados: `static/dental-photos.js` (manifiesto con origen y textos accesibles), `static/dental.js` (galería, fotografías y reemplazo ante fallas), `static/dental.css`, `static/dental.html`, `static/img/dental-fallback.svg`, `static/index.html`, `static/growa-editorial.css` y `app/seed.py` (actualiza únicamente imágenes de datos ficticios).

Las fotografías se cargan desde CDN Pexels para evitar empaquetar archivos externos de origen incierto en el repositorio; el fallback SVG es un archivo local verificable. Queda pendiente una prueba visual en navegador real y una comprobación de carga de cada CDN desde el ambiente de usuario.
