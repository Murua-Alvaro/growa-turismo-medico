/* Dedicated Mazatlán portal with stable URLs and complete destination pages.
   Content is curated, not an API stream; all dynamic strings originate here. */
(function(){
'use strict';
const D=window.MZT_DATA;
const root=document.getElementById('main');
const qs=(s,parent=document)=>parent.querySelector(s);
const qsa=(s,parent=document)=>Array.from(parent.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const crumb=(name,parents=[])=>'<nav class="breadcrumb" aria-label="Migas de pan"><a href="/">Inicio</a><span>›</span><a href="/mazatlan">Mazatlán</a>'+parents.map(p=>'<span>›</span><a href="'+p.href+'">'+esc(p.name)+'</a>').join('')+'<span>›</span><span aria-current="page">'+esc(name)+'</span></nav>';
const srcLinks=(indices=D.sources.map((_,i)=>i))=>'<div class="source-list">'+indices.map(i=>'<a href="'+D.sources[i].url+'" target="_blank" rel="noopener noreferrer"><span>'+esc(D.sources[i].name)+'<br><small>'+esc(D.sources[i].title)+'</small></span><span aria-hidden="true">↗</span></a>').join('')+'</div>';
const photo=(key,cls,priority=false)=>{const p=D.photos[key];return p?'<img class="'+(cls||'')+'" src="'+p.url+'" alt="'+esc(p.alt)+'" '+(priority?'fetchpriority="high"':'loading="lazy"')+' referrerpolicy="no-referrer">':''};
const photoCredit=key=>{const p=D.photos[key];return p?'<div class="photo-attrib">Fotografía: <a href="'+p.page+'" target="_blank" rel="noopener noreferrer">'+esc(p.author)+'</a> · '+esc(p.licence)+' · Wikimedia Commons</div>':''};
const openMap=name=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+', Mazatlán, Sinaloa');
const link=(url,label,variant='outline')=>'<a class="btn-'+variant+'" href="'+url+'">'+esc(label)+'</a>';
const heading=(tag,title,description,href,label)=>'<div class="section-heading"><div><span class="overline">'+tag+'</span><h2>'+title+'</h2><p>'+description+'</p></div>'+(href?'<a href="'+href+'">'+label+' ↗</a>':'')+'</div>';
const cards=[
  {url:"/mazatlan/historia",label:"EL ORIGEN DEL PUERTO",title:"Una historia que sigue viva",desc:"Desde la apertura comercial hasta el patrimonio urbano, conoce cómo se formó Mazatlán.",photo:"machado"},
  {url:"/mazatlan/lugares",label:"LUGARES CON HISTORIA",title:"La ciudad que puedes recorrer",desc:"Plazas, teatros, museos, mercados, costa y miradores: cada sitio con su propia guía.",photo:"teatro"},
  {url:"/mazatlan/cultura",label:"CULTURA Y TRADICIONES",title:"Lo que hace único al puerto",desc:"Carnaval, patrimonio, gastronomía y espacios de encuentro contados con contexto.",photo:"faro"}
];
const chapterCard=card=>'<a href="'+card.url+'" class="portal-card"><div class="visual">'+photo(card.photo)+'<span class="visual-tag">'+card.label+'</span></div><div class="card-body"><h3>'+card.title+'</h3><p>'+card.desc+'</p><span class="card-link">Abrir página completa <span aria-hidden="true">↗</span></span></div></a>';
const placeCard=p=>'<a href="/mazatlan/lugares/'+p.slug+'" class="place-card" data-category="'+p.category+'" data-name="'+esc((p.name+' '+p.zone+' '+p.short).toLocaleLowerCase('es-MX'))+'"><div class="place-image">'+photo(p.photo)+'<b>'+esc(p.tag)+'</b></div><div class="place-content"><span class="overline">'+esc(p.zone)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.short)+'</p><div class="place-meta"><span>'+esc(p.duration)+'</span><strong>Conocer el lugar ↗</strong></div></div></a>';
const sourcesSection=(indices,title='Fuentes para seguir explorando')=>'<section class="section-block" id="fuentes">'+heading('INFORMACIÓN CONSULTABLE',title,'Enlaces a instituciones culturales y de turismo. Revisa sus publicaciones para información más reciente.')+srcLinks(indices)+'</section>';
const promo=()=>'<section class="highlight-panel"><div><span class="overline" style="color:#afd4b9">GROWA · PLANIFICA MEJOR</span><h2>Descubre el destino y después organiza tu estancia.</h2><p>Compara alojamiento, movilidad y servicios desde Growa. La información de demostración no equivale a disponibilidad verificada.</p><a href="/planificar">Abrir planificador inteligente ↗</a></div><div class="highlight-panel-right"><div><b>01</b><span>Descubre lugares e historias</span></div><div><b>02</b><span>Consulta servicios del catálogo</span></div><div><b>03</b><span>Organiza un itinerario sujeto a confirmación</span></div></div></section>';
const pages=[
  {url:'/mazatlan/historia',kicker:'CRONOLOGÍA',title:'La historia del puerto'},
  {url:'/mazatlan/lugares',kicker:'EXPLORA',title:'Lugares para visitar'},
  {url:'/mazatlan/cultura',kicker:'TRADICIONES',title:'Cultura mazatleca'},
  {url:'/mazatlan/guia',kicker:'ANTES DE VIAJAR',title:'Guía del visitante'}
];
const pageIntro=(name,title,desc)=>'<div class="editorial-intro"><span class="overline">GROWA · '+esc(name)+'</span><h1>'+title+'</h1><p>'+desc+'</p><div class="editorial-actions">'+link('/mazatlan','Volver a descubrir Mazatlán')+'<button class="btn-outline" type="button" data-action="share">Compartir esta página ↗</button></div></div>';
const side=(links)=>'<aside class="reading-sidebar" aria-label="Índice de esta página"><strong>EN ESTA PÁGINA</strong>'+links.map(x=>'<a href="#'+x.id+'">'+esc(x.label)+'</a>').join('')+'<div class="side-note">Contenido cultural informativo. Los horarios y accesos se confirman con las fuentes oficiales.</div></aside>';
const section=(id,kicker,title,content)=>'<section id="'+id+'"><span class="overline">'+kicker+'</span><h2>'+title+'</h2>'+content+'</section>';
function home(){
 document.title='Descubre Mazatlán | Historia, cultura y lugares | Growa';
 root.innerHTML=crumb('Descubre Mazatlán')+
 '<section class="page-hero"><div class="page-hero-copy"><span class="overline">GUÍA CULTURAL · COSTA DEL PACÍFICO</span><h1>Mazatlán. <em>Un mar de historias por descubrir.</em></h1><p>No es solo una estancia: conoce el puerto, sus tradiciones y las personas que lo han construido. Explora historias documentadas, lugares para visitar y rutas que puedes adaptar a tu tiempo.</p><div class="hero-actions">'+link('/mazatlan/historia','Conocer su historia','primary')+link('/mazatlan/lugares','Explorar lugares')+'</div></div><div class="hero-photo">'+photo('machado','',true)+'<div class="hero-caption"><div><b>Viejo Mazatlán</b><small>Patrimonio, cultura y vida urbana.</small></div><small>Plazuela Machado</small></div></div></section>'+photoCredit('machado')+
 '<div class="stat-ribbon"><div><strong>1837</strong><span>Plazuela Machado · antecedente urbano</span></div><div><strong>1874</strong><span>Inauguración del Teatro Ángela Peralta</span></div><div><strong>1898</strong><span>Organización civil del Carnaval</span></div></div>'+
 '<section class="section-block">'+heading('UNA GUÍA QUE SE PUEDE RECORRER','Elige qué quieres descubrir.','Cada sección se abre como una página completa, con contexto y enlaces propios.')+'<div class="card-grid">'+cards.map(chapterCard).join('')+'</div></section>'+
 '<section class="section-block">'+heading('UN PATRIMONIO COMPARTIDO','Nueve lugares, nueve historias.','Explora el contexto de cada sitio antes de decidir si quieres visitarlo.','/mazatlan/lugares','Ver todos los lugares')+'<div class="card-grid">'+[D.places[0],D.places[1],D.places[5]].map(p=>'<a href="/mazatlan/lugares/'+p.slug+'" class="portal-card"><div class="visual">'+photo(p.photo)+'<span class="visual-tag">'+esc(p.tag)+'</span></div><div class="card-body"><h3>'+esc(p.name)+'</h3><p>'+esc(p.short)+'</p><span class="card-link">Leer historia y guía <span>↗</span></span></div></a>').join('')+'</div></section>'+
 '<section class="section-block">'+heading('MÁS QUE DESTINOS','Tu visita también puede tener contexto.','Conocer la ciudad implica entender sus actividades y espacios cotidianos.')+'<div class="mini-grid"><div class="mini-card"><span>01 / IDENTIDAD</span><strong>Carnaval, tradición y memoria</strong><a href="/mazatlan/cultura">Conocer tradiciones ↗</a></div><div class="mini-card"><span>02 / ARQUITECTURA</span><strong>Calles, plazas y edificios históricos</strong><a href="/mazatlan/historia">Explorar patrimonio ↗</a></div><div class="mini-card"><span>03 / VISITA</span><strong>Ideas de recorridos y recomendaciones</strong><a href="/mazatlan/guia">Abrir guía ↗</a></div><div class="mini-card"><span>04 / PERSONAS</span><strong>Una comunidad de intereses compartidos</strong><a href="/comunidad">Conocer la red Growa ↗</a></div></div></section>'+promo()+sourcesSection([1,2,3,4,5]);
}
function history(){
 document.title='Historia de Mazatlán | Cronología y patrimonio | Growa';
 const links=D.chapters.map((c,i)=>({id:'h'+i,label:c.year+' · '+c.title}));links.push({id:'h-context',label:'Cómo leer esta historia'});
 root.innerHTML=crumb('Historia del puerto')+pageIntro('HISTORIA','La historia de Mazatlán, de la costa al puerto moderno.','Una lectura histórica organizada por etapas: antecedentes del asentamiento, apertura comercial, espacios públicos, artes, Carnaval y conservación del patrimonio. Cada sección identifica su contexto y evita reducir la ciudad a una sola fecha.')+
 '<div class="reading-layout">'+side(links)+'<article class="reading-content">'+D.chapters.map((c,i)=>section('h'+i,c.kicker,c.title,'<span class="year-badge">'+c.year+'</span><p>'+c.body+'</p><p>'+c.detail+'</p>')).join('')+
 section('h-context','LECTURA CRÍTICA','Un puerto no se explica con una fecha','<p>La historia urbana debe distinguir los orígenes del poblamiento, el reconocimiento como puerto comercial, la expansión de los servicios y la protección del patrimonio. Son procesos interrelacionados, pero no idénticos.</p><p>El crecimiento del comercio marítimo transformó las oportunidades económicas, la arquitectura y las formas de convivencia. Es posible rastrear esas huellas en las calles del Centro Histórico, las plazas y los edificios que han tenido distintos usos.</p><p>La ciudad actual no es una fotografía inmóvil de su pasado: su actividad turística, los mercados y las zonas residenciales también forman parte de su historia contemporánea.</p>')+
 '</article></div>'+sourcesSection([0,1,2,3,4])+promo();
}
let savedMode=false;
const categoryLabels={all:'Todos',patrimonio:'Patrimonio',cultura:'Museos y cultura',costa:'Costa',naturaleza:'Naturaleza',gastronomia:'Gastronomía'};
function places(){
 document.title='Qué conocer en Mazatlán | Lugares con historia | Growa';
 root.innerHTML=crumb('Lugares para visitar')+pageIntro('EXPLORAR','Cada lugar tiene una historia propia.','No te quedes en una fotografía. Abre cada ficha para conocer su contexto, qué observar, indicaciones para la visita, fuentes y ubicación. Puedes guardar lugares en una lista personal de este navegador.')+
 '<section class="section-block" style="margin-top:35px"><div class="section-heading"><div><span class="overline">DIRECTORIO EDITORIAL</span><h2>Explorar por interés</h2><p>Escribe un lugar o selecciona el tipo de experiencia que te interesa.</p></div><button class="btn-outline" data-action="saved" id="saved-toggle">Ver mi selección (<span id="saved-count">0</span>)</button></div><div class="filter-toolbar" id="place-toolbar"><input id="place-query" type="search" placeholder="Buscar lugares, zonas o experiencias…" aria-label="Buscar lugares"><button type="button" data-action="clear">Limpiar filtros</button>'+Object.entries(categoryLabels).map(([k,v])=>'<button class="'+(k==='all'?'active':'')+'" data-category="'+k+'" aria-pressed="'+(k==='all')+'">'+v+'</button>').join('')+'</div><p class="filter-description" id="place-count" role="status"></p><div class="place-grid" id="place-grid">'+D.places.map(placeCard).join('')+'</div><div id="place-empty" class="empty-result" hidden>No se encontraron lugares para esos filtros. Puedes borrar la búsqueda o cambiar la categoría.</div></section>'+sourcesSection([3,4,5,6])+promo();
 document.getElementById('place-query').addEventListener('input',filterPlaces);
 qsa('#place-toolbar [data-category]').forEach(btn=>btn.addEventListener('click',()=>{qsa('#place-toolbar [data-category]').forEach(e=>{e.classList.toggle('active',e===btn);e.setAttribute('aria-pressed',String(e===btn))});filterPlaces()}));
 filterPlaces();
}
function filterPlaces(){
 const input=qs('#place-query');if(!input)return;
 const value=input.value.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const cat=qs('#place-toolbar [data-category].active')?.dataset.category||'all';let n=0;
 qsa('.place-card').forEach(card=>{const text=card.dataset.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'');const show=(cat==='all'||card.dataset.category===cat)&&text.includes(value);card.hidden=!show;if(show)n++});
 const empty=qs('#place-empty');empty.hidden=n>0;empty.textContent=savedMode?'Aún no hay sitios guardados que coincidan. Abre un lugar y elige «Guardar lugar».':'No se encontraron lugares para esos filtros. Puedes borrar la búsqueda o cambiar la categoría.';
 qs('#place-count').textContent=n+' '+(n===1?'lugar encontrado':'lugares encontrados');
 const savedCount=qs('#saved-count');if(savedCount)savedCount.textContent=saved().length;
}
function detail(p){
 document.title=p.name+' | Historia y guía de visita | Growa';
 const same=D.places.filter(x=>x.slug!==p.slug&&(x.zone===p.zone||x.category===p.category)).slice(0,3);
 const other=same.length?same:D.places.filter(x=>x.slug!==p.slug).slice(0,3);
 const s=D.sources[p.source];
 root.innerHTML=crumb(p.name,[{name:'Lugares',href:'/mazatlan/lugares'}])+
 '<section class="detail-top"><div><span class="overline">'+esc(p.tag)+' · '+esc(p.zone)+'</span><h1>'+esc(p.name)+'</h1><p>'+esc(p.short)+' Una guía de contexto para conocer este lugar y decidir cómo integrarlo a tu visita por Mazatlán.</p><div class="detail-info"><span>◉ '+esc(p.zone)+'</span><span>Tiempo orientativo: '+esc(p.duration)+'</span><span>'+esc(categoryLabels[p.category]||'Experiencia')+'</span></div><div class="detail-actions"><button class="btn-primary" data-action="save" data-slug="'+p.slug+'">♡ Guardar lugar</button><a class="btn-outline" href="'+openMap(p.location)+'" target="_blank" rel="noopener noreferrer">Ver ubicación ↗</a><button class="btn-outline" data-action="share">Compartir ↗</button></div></div><div><div class="detail-photo">'+photo(p.photo,'',true)+'</div>'+photoCredit(p.photo)+'</div></section>'+
 '<div class="detail-layout"><article class="detail-article"><span class="overline">CONTEXTO Y EXPERIENCIA</span><h2>Conoce el lugar</h2>'+p.paragraphs.map(t=>'<p>'+esc(t)+'</p>').join('')+
 '<h2>Qué observar durante tu visita</h2><ul>'+p.highlights.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul><h2>Antes de ir</h2><p>'+esc(p.notes)+'</p>'+
 '<div class="source-note">Referencia consultable: <a href="'+s.url+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+' · '+esc(s.title)+' ↗</a>. Los datos operativos se verifican con el recinto o la autoridad responsable.</div></article>'+
 '<aside class="detail-aside"><span class="overline">FICHA DEL LUGAR</span><h3>'+esc(p.name)+'</h3><p>Zona: '+esc(p.zone)+'</p><p>Duración de referencia: '+esc(p.duration)+'</p><p>Ubicación de búsqueda: '+esc(p.location)+'</p><a href="'+openMap(p.location)+'" target="_blank" rel="noopener noreferrer">Abrir en el mapa ↗</a><a href="/mazatlan/lugares">Ver todos los lugares ↗</a><a href="/mazatlan/guia">Ideas para organizar una visita ↗</a><a href="/planificar">Organizar estancia en Growa ↗</a></aside></div>'+
 '<section class="section-block">'+heading('SIGUE EXPLORANDO','Otros lugares para descubrir','Continúa el recorrido a través de fichas individuales.')+'<div class="place-grid">'+other.map(placeCard).join('')+'</div></section>'+promo();
 syncSavedButton();
}
function culture(){
 document.title='Cultura de Mazatlán | Carnaval, patrimonio y vida urbana | Growa';
 const links=[{id:'c-carnaval',label:'Carnaval e identidad'},{id:'c-artes',label:'Teatro y artes'},{id:'c-arquitectura',label:'Patrimonio urbano'},{id:'c-mercados',label:'Gastronomía y comercio'},{id:'c-identidad',label:'Vida cotidiana'}];
 root.innerHTML=crumb('Cultura y tradiciones')+pageIntro('CULTURA','La cultura del puerto se vive en sus calles.','Conoce cómo las festividades, los espacios escénicos, la arquitectura y el comercio construyen una identidad compartida. La cultura de Mazatlán es mucho más amplia que su vida nocturna y su imagen turística.')+
 '<div class="reading-layout">'+side(links)+'<article class="reading-content">'+
 section('c-carnaval','PATRIMONIO INMATERIAL','Carnaval: una celebración colectiva','<p>La Secretaría de Cultura documenta que la celebración cambió de una organización espontánea a una junta civil en 1898. Su historia está vinculada con música, disfraces, desfiles y el uso festivo del espacio público.</p><p>Las celebraciones se relacionan con Olas Altas y Paseo Claussen. Para conocer su programación anual hay que consultar a las autoridades culturales responsables; la historia no garantiza un evento en una fecha específica.</p><div class="source-note"><a href="'+D.sources[2].url+'" target="_blank" rel="noopener noreferrer">Consultar el inventario de patrimonio cultural inmaterial ↗</a></div>')+
 section('c-artes','ESCENA Y CIUDAD','La tradición artística del Teatro Ángela Peralta','<p>La construcción del antiguo Teatro Rubio, inaugurado en 1874, explica cómo un puerto comercial fue desarrollando espacios para la representación artística. El INAH documenta tanto su inauguración como su restauración entre 1987 y 1992.</p><p>Hoy, el edificio permite entender la relación entre patrimonio arquitectónico y programación cultural, pero la disponibilidad de visitas y funciones depende de la administración del recinto.</p><p><a class="btn-ghost" href="/mazatlan/lugares/teatro-angela-peralta">Abrir la ficha completa del teatro ↗</a></p>')+
 section('c-arquitectura','PATRIMONIO','El Centro Histórico: calles que conservan memoria','<p>Las plazas, fachadas y edificios del Centro Histórico permiten reconocer la transición entre el puerto comercial del siglo XIX y la ciudad contemporánea. La declaración federal de Zona de Monumentos Históricos en 2001 destaca el valor urbano de este conjunto.</p><p>La Plazuela Machado, la Catedral y las calles cercanas forman parte de un entramado de convivencia. Recorrerlo con atención ofrece una experiencia distinta a visitar únicamente un monumento aislado.</p><p><a class="btn-ghost" href="/mazatlan/lugares/plazuela-machado">Conocer Plazuela Machado ↗</a></p>')+
 section('c-mercados','TRABAJO Y SABORES','Gastronomía, mercados y economía cotidiana','<p>La gastronomía también se transmite por medio de negocios familiares, mercados y prácticas de consumo local. Un mercado es una puerta de entrada a la organización cotidiana de la ciudad: proveedores, abastecimiento, servicios y conversación.</p><p>El Mercado Pino Suárez aparece en la promoción turística regional como un punto de comercio tradicional. Es recomendable conocer sus actividades sin asumir que todos los establecimientos ofrecen el mismo horario, precio o servicio.</p><p><a class="btn-ghost" href="/mazatlan/lugares/mercado-pino-suarez">Conocer el Mercado Pino Suárez ↗</a></p>')+
 section('c-identidad','PERSONAS','La cultura es una experiencia compartida','<p>La identidad de Mazatlán se construye mediante relaciones sociales, expresiones artísticas, actividades económicas y usos del espacio urbano. La experiencia de un visitante es más rica cuando reconoce el trabajo de quienes habitan la ciudad.</p><p>Growa busca complementar la exploración con una comunidad voluntaria de visitantes y residentes. No se debe interpretar un perfil de usuario como guía profesional o proveedor verificado sin acreditación adicional.</p><p><a class="btn-ghost" href="/comunidad">Explorar la comunidad Growa ↗</a></p>')+'</article></div>'+
 '<section class="section-block">'+heading('DESCUBRE EL CONTEXTO','Lugares relacionados con esta historia','Continúa con fichas de espacios culturales y patrimoniales.')+'<div class="place-grid">'+[D.places[0],D.places[1],D.places[4]].map(placeCard).join('')+'</div></section>'+sourcesSection([0,1,2,3,4]);
}
const guides={
 day:{title:'Un día: conoce el corazón del puerto',steps:['Comienza por Plazuela República y el entorno de la Catedral.','Recorre el Centro Histórico hacia Plazuela Machado y las fachadas cercanas.','Consulta si el Teatro Ángela Peralta ofrece visitas o actividades ese día.','Termina con un paseo por Olas Altas, sujeto a clima y condiciones del lugar.']},
 weekend:{title:'Dos días: patrimonio, costa y espacios cotidianos',steps:['Día 1: dedica tiempo al Centro Histórico, la Catedral y Plazuela Machado.','Integra el Teatro Ángela Peralta y el Museo Arqueológico cuando haya acceso.','Día 2: elige un tramo del Malecón, Olas Altas y algún espacio de comercio local.','Selecciona alojamiento y movilidad según tu presupuesto, prioridades y condiciones de acceso.']},
 deep:{title:'Tres días: descubre Mazatlán con calma',steps:['Día 1: arquitectura, plazas y museos del Centro Histórico.','Día 2: costa, Malecón y la relación histórica con el puerto.','Día 3: considera el Faro si el esfuerzo físico y las condiciones de acceso lo permiten; o explora comercio, mercados y vida cultural.','Deja tiempo flexible para descansar y confirmar directamente servicios, horarios y traslados.']}
};
function guide(){
 document.title='Guía de Mazatlán | Itinerarios, preguntas y consejos | Growa';
 root.innerHTML=crumb('Guía del visitante')+pageIntro('GUÍA PRÁCTICA','Organiza una visita con tiempo para conocer.','Selecciona una propuesta de recorrido, abre recomendaciones y consulta las fuentes. Son ejemplos orientativos, no programas contratados ni garantías de accesibilidad o horarios.')+
 '<section class="section-block" style="margin-top:38px">'+heading('ELIGE TU RITMO','Tres formas de recorrer Mazatlán.','No son horarios fijos: puedes adaptar los puntos según movilidad, clima e intereses.')+
 '<div class="plan-tabs" id="plan-tabs"><button data-guide="day" class="active" aria-pressed="true">1 día</button><button data-guide="weekend" aria-pressed="false">2 días</button><button data-guide="deep" aria-pressed="false">3 días</button></div><div class="plan-panel" id="plan-panel" aria-live="polite"></div></section>'+
 '<section class="section-block">'+heading('PREGUNTAS FRECUENTES','Antes de comenzar tu estancia.','Abre cada respuesta para revisar recomendaciones generales.')+
 '<div class="faq-list"><details><summary>¿Dónde conviene comenzar a conocer el Centro Histórico?</summary><p>Una alternativa es iniciar por Plazuela República, Catedral y Plazuela Machado. Los recorridos dependen de tu movilidad y de las condiciones de las calles. <a href="/mazatlan/lugares">Ver lugares ↗</a></p></details>'+
 '<details><summary>¿Puedo visitar el Teatro Ángela Peralta y el Museo Arqueológico?</summary><p>Ambos tienen fichas institucionales, pero el ingreso, la programación y los horarios requieren confirmación. <a href="'+D.sources[1].url+'" target="_blank" rel="noopener noreferrer">INAH Teatro ↗</a> · <a href="'+D.sources[6].url+'" target="_blank" rel="noopener noreferrer">INAH Museo ↗</a></p></details>'+
 '<details><summary>¿El Faro es adecuado para todas las personas?</summary><p>No necesariamente. La subida supone esfuerzo físico. Consulta condiciones operativas, clima, hidratación y cualquier limitación de movilidad; no se debe prometer accesibilidad universal.</p></details>'+
 '<details><summary>¿Qué debo considerar al visitar el Malecón y Olas Altas?</summary><p>Las condiciones climáticas, el oleaje, los cierres por eventos y el tránsito pueden modificar la experiencia. Evita entrar al mar en condiciones inseguras y consulta avisos locales.</p></details>'+
 '<details><summary>¿Dónde puedo verificar las fechas del Carnaval?</summary><p>La Secretaría de Cultura documenta su historia, pero la programación de cada edición requiere revisión con los organizadores del año correspondiente. <a href="'+D.sources[2].url+'" target="_blank" rel="noopener noreferrer">Ver patrimonio inmaterial ↗</a></p></details>'+
 '<details><summary>¿Growa confirma hospedajes, consultas o traslados?</summary><p>No automáticamente. Growa es un prototipo de coordinación. Cada proveedor debe confirmar sus servicios; los inventarios señalados como DEMO no equivalen a ofertas reales.</p></details>'+
 '<details><summary>¿Puedo encontrar o contactar personas?</summary><p>Growa Comunidad permite perfiles voluntarios e invitaciones aceptadas por ambas partes. No expongas teléfonos, direcciones, datos clínicos ni documentos sensibles. <a href="/comunidad">Abrir comunidad ↗</a></p></details>'+
 '</div></section>'+promo()+sourcesSection([4,5,6]);
 qsa('#plan-tabs [data-guide]').forEach(btn=>btn.addEventListener('click',()=>{qsa('#plan-tabs [data-guide]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn))});renderGuide(btn.dataset.guide)}));
 renderGuide('day');
}
function renderGuide(key){const g=guides[key];qs('#plan-panel').innerHTML='<h3>'+g.title+'</h3><ol>'+g.steps.map(s=>'<li>'+s+'</li>').join('')+'</ol><a class="btn-ghost" href="/mazatlan/lugares">Abrir fichas de lugares ↗</a>'}
function saved(){try{return JSON.parse(localStorage.getItem('growa_mazatlan_saved')||'[]').filter(x=>typeof x==='string'&&D.places.some(p=>p.slug===x))}catch(e){return []}}
function save(slug){const a=saved(),next=a.includes(slug)?a.filter(x=>x!==slug):[...a,slug];try{localStorage.setItem('growa_mazatlan_saved',JSON.stringify(next))}catch(e){toast('No se pudo guardar en este navegador.');return}syncSavedButton();toast(next.includes(slug)?'Lugar guardado en este navegador.':'Lugar eliminado de tu selección.')}
function syncSavedButton(){const p=location.pathname.split('/').at(-1);const btn=qs('[data-action="save"]');if(btn)btn.textContent=saved().includes(p)?'♥ Guardado · Quitar':'♡ Guardar lugar';if(qs('#saved-count'))qs('#saved-count').textContent=saved().length}
function toast(message){const el=qs('#toast');el.textContent=message;el.hidden=false;clearTimeout(window.__growaToast);window.__growaToast=setTimeout(()=>el.hidden=true,3500)}
async function share(){try{if(navigator.share){await navigator.share({title:document.title,url:location.href});return}if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(location.href);toast('Enlace copiado al portapapeles.');return}}catch(e){if(e.name==='AbortError')return}const field=document.createElement('textarea');field.value=location.href;document.body.appendChild(field);field.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}field.remove();toast(ok?'Enlace copiado.':'Puedes copiar la dirección de esta página desde tu navegador.')}
function showSaved(){
 savedMode=!savedMode;
 const selection=savedMode?saved().map(id=>D.places.find(p=>p.slug===id)).filter(Boolean):D.places;
 qs('#place-grid').innerHTML=selection.map(placeCard).join('');
 qs('#place-query').value='';
 qsa('#place-toolbar [data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category==='all');b.setAttribute('aria-pressed',String(b.dataset.category==='all'))});
 qs('#saved-toggle').innerHTML=savedMode?'Mostrar todos los lugares ↗':'Ver mi selección (<span id="saved-count">'+saved().length+'</span>)';
 filterPlaces();toast(savedMode?'Mostrando los lugares que guardaste.':'Mostrando el catálogo completo.');
}
function initNav(){
 const button=qs('#destination-toggle'),menu=qs('#destination-menu');
 button.addEventListener('click',()=>{const next=menu.hidden;menu.hidden=!next;button.setAttribute('aria-expanded',String(next))});
 const mobile=qs('#menu-toggle'),mobileNav=qs('#mobile-navigation');
 mobile.addEventListener('click',()=>{const next=mobileNav.hidden;mobileNav.hidden=!next;mobile.setAttribute('aria-expanded',String(next));mobile.setAttribute('aria-label',next?'Cerrar menú':'Abrir menú');mobile.textContent=next?'×':'☰'});
 document.addEventListener('click',e=>{if(!qs('#destination-dropdown').contains(e.target)){menu.hidden=true;button.setAttribute('aria-expanded','false')}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;mobileNav.hidden=true;button.setAttribute('aria-expanded','false');mobile.setAttribute('aria-expanded','false');mobile.textContent='☰'}});
 const p=location.pathname;
 qsa('.site-nav>a').forEach(a=>a.classList.toggle('nav-active',a.getAttribute('href')===p));
 const dest=p.startsWith('/mazatlan');button.classList.toggle('nav-active',dest);
 window.addEventListener('scroll',()=>{
  const max=document.documentElement.scrollHeight-window.innerHeight;qs('#reading-progress').style.width=(max>0?Math.max(0,Math.min(100,window.scrollY/max*100)):0)+'%';
 },{passive:true});
 document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  if(action==='share')share();if(action==='save')save(button.dataset.slug);if(action==='saved')showSaved();
  if(action==='clear'){const query=qs('#place-query');if(query)query.value='';qsa('#place-toolbar [data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category==='all');b.setAttribute('aria-pressed',String(b.dataset.category==='all'))});filterPlaces();}
 });
}
function start(){
 initNav();
 const segments=location.pathname.split('/').filter(Boolean);
 if(segments.length===1&&segments[0]==='mazatlan')home();
 else if(segments[0]==='mazatlan'&&segments.length===2){
  ({historia:history,lugares:places,cultura:culture,guia:guide}[segments[1]]||notFound)();
 }else if(segments[0]==='mazatlan'&&segments[1]==='lugares'&&segments.length===3){
  const p=D.places.find(x=>x.slug===segments[2]);if(p)detail(p);else notFound();
 }else notFound();
}
function notFound(){document.title='Página no encontrada | Growa';root.innerHTML=crumb('Página no encontrada')+'<div class="editorial-intro"><span class="overline">ERROR 404</span><h1>Esta página no existe.</h1><p>El enlace quizá cambió. Puedes volver al portal o consultar todos los lugares.</p><div class="editorial-actions">'+link('/mazatlan','Ir a Mazatlán','primary')+link('/mazatlan/lugares','Ver lugares')+'</div></div>'}
start();
})();