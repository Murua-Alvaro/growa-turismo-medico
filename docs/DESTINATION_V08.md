# Growa 0.8 — navegación real y portal editorial de Mazatlán

## Por qué se rehízo este módulo

El antiguo módulo `view-mazatlan` era una sección oculta de una página única. Los usuarios hacían clic, pero no obtenían una página independiente con contexto, URL compartible ni fichas suficientemente detalladas. Fue sustituido por un portal editorial con rutas reales y una navegación visual coherente con el resto de Growa.

## Arquitectura entregada

- `static/mazatlan.html` — documento independiente, cabecera, menú accesible, pie de página y créditos de recursos.
- `static/mazatlan-data.js` — información editorial curada: 8 momentos históricos, 9 fichas de lugares y 7 enlaces de fuentes.
- `static/mazatlan.js` — enrutador de cliente por pathname, páginas de contenido, acciones, filtros, listas locales y enlaces.
- `static/mazatlan.css` — sistema editorial responsivo (desktop, tableta y móvil) con lectura lateral, tarjetas, fotos y componentes de interacción.
- `app/main.py` — rutas HTTP para cada página, fichas individuales y códigos 404; más rutas directas para Explorar, Planificar, Comunidad, Itinerarios y Aliados.
- `static/app.js` — navegación principal con URLs de espacio de trabajo, historial adelante/atrás y enlace directo al portal Mazatlán.
- `tests/test_destination.py` — 14 rutas de destino, 5 rutas de trabajo, assets y 404.
- `app/selfcheck.py` — comprueba los archivos esenciales al arrancar en modo demo.

## Direcciones de página

- `/mazatlan`: portada editorial.
- `/mazatlan/historia`: cronología ampliada (8 momentos) y análisis contextual.
- `/mazatlan/lugares`: explorador con búsqueda, filtros y lista guardada.
- `/mazatlan/cultura`: Carnaval, teatro, arquitectura, mercados e identidad.
- `/mazatlan/guia`: itinerarios orientativos, preguntas desplegables, recomendaciones de visita.
- `/mazatlan/lugares/{slug}`: ficha individual (nombre, historia, observaciones, ubicación, duración orientativa, precauciones, fuentes y lugares relacionados). Slugs permitidos: `plazuela-machado`, `teatro-angela-peralta`, `olas-altas`, `catedral`, `museo-arqueologico`, `faro`, `malecon`, `mercado-pino-suarez`, `plazuela-republica`.
- `/explorar`, `/planificar`, `/comunidad`, `/itinerarios`, `/aliados`: URLs independientes que reutilizan el frontend SPA anterior y soportan actualización del navegador.

## Acciones de UI conectadas

- Logo y navegación: rutas reales HTTP.
- Menú de destino y menú móvil: abrir/cerrar con `aria-expanded`, cierre por Escape y clic fuera.
- Filtro de lugares: texto, categorías, resultados y estado vacío.
- Fichas: cada tarjeta conduce a la página completa correspondiente.
- Ficha individual: guardar/quitar en `localStorage` del navegador; no guarda datos de salud ni se sincroniza a cuentas.
- Compartir: API Web Share o copia del URL con fallback.
- Mapa: búsqueda externa a través de Google Maps; no se inventan rutas ni ETAs.
- Guía: botones 1, 2 o 3 días, actualizan el itinerario orientativo.
- Secciones de lectura: índice navegable, barra de progreso y breadcrumbs.
- Recursos: enlaces externos con apertura segura y atribución fotográfica visible.

## Fuentes y licencias

- Instituto Nacional de Antropología e Historia, catálogo de monumentos y Museo Arqueológico.
- Secretaría de Cultura, patrimonio inmaterial del Carnaval y Plazuela Machado.
- Secretaría de Turismo de Sinaloa y turismo municipal, sitios de interés y entorno urbano.
- Fotografías de Wikimedia Commons: Gzzz (CC BY-SA 4.0), Juanjosegzl (CC BY-SA 3.0) y BettasGDL (dominio público). Fotografías mostradas mediante encuadres responsivos, autores y condiciones visibles en pie de página y fichas.

## Auditoría técnica y límites

- Se inspeccionó la sintaxis de los scripts y se simuló su ejecución en 14 rutas con datos editoriales curados.
- No se detectaron enlaces internos inexistentes en las páginas resultantes; los elementos estáticos esenciales están presentes.
- El estado `Live` en Render y su prueba de arranque se comprueban de forma independiente después de desplegar.
- La verificación estática de JS y el arranque **no sustituyen** pruebas E2E reales de navegadores en múltiples dispositivos.
- Las imágenes de terceros y APIs externas dependen de la conexión y disponibilidad de sus proveedores; las tarjetas tienen fondos visuales de reserva.
- El contenido es editorial y no reemplaza horarios oficiales, información de seguridad, información clínica ni reservaciones con proveedores.
- El plan gratuito de Render sigue siendo un entorno prototipo con almacenamiento efímero para la comunidad.

## Próximo paso recomendado para un lanzamiento comercial

Ejecutar la suite automatizada completa en un runner GitHub, instalar un pipeline Playwright con capturas de escritorio/móvil y validación de enlaces, conectar Neon con secretos, poner una estrategia de migraciones y almacenamiento permanente, implantar verificación de correo y moderación, y obtener autorización/licencias comerciales de proveedores.

Esta actualización es una mejora importante de navegación y presentación del portal; no una certificación para operar con datos reales.
