/* Growa Dental 0.8.1 — specialty-first marketplace.
   Provider data comes exclusively from /api/dental. Do not fabricate reviews,
   accreditations, clinicians, procedures offered or treatment prices. */
(()=>{
'use strict';
const $=(s,ctx=document)=>ctx.querySelector(s);
const $$=(s,ctx=document)=>[...ctx.querySelectorAll(s)];
const safe=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const money=n=>n==null?'A consultar':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
const safePhoto=url=>{try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.href:''}catch{return ''}};
const state={treatments:[],clinics:[],total:0,zones:[],compare:new Set(),selectedTreatment:null,activeClinic:null,requestId:0,returnFocus:null,quotePreview:null};
const root=$('#main');
let toastTimer=null;
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4200)}
async function api(path,options={}){const r=await fetch(path,{credentials:'same-origin',...options});let json={};try{json=await r.json()}catch{}if(!r.ok)throw new Error(json.detail||'No se pudo consultar la información.');return json}
const pathClinic=()=>location.pathname.match(/^\/odontologia\/clinicas\/([a-f0-9]{32})\/?$/)?.[1]||null;
const crumbs=(items)=>'<nav class="breadcrumb" aria-label="Ruta"><a href="/">Inicio</a><span>›</span><a href="/odontologia">Odontología</a>'+items.map(x=>'<span>›</span>'+(x.url?'<a href="'+x.url+'">'+safe(x.label)+'</a>':'<span aria-current="page">'+safe(x.label)+'</span>')).join('')+'</nav>';
const introTitle='Odontología en Mazatlán';
const demoLabel=(clinic)=>clinic.demo?'<span class="tag demo">PERFIL DEMO</span>':clinic.verified?'<span class="tag">Ficha verificada por Growa*</span>':'<span class="tag unverified">Documentación pendiente</span>';
const photos=window.GROWA_DENTAL_PHOTOS||{};
const demoImage=(clinic)=>clinic?.demo&&photos[clinic.name]?photos[clinic.name]:null;
const photoFor=(clinic)=>demoImage(clinic)||{url:clinic.image_url||'',alt:clinic.demo?'Imagen ilustrativa de un consultorio, no del proveedor':'Imagen facilitada en el catálogo del prestador',photographer:'',source:''};
const photo=(clinic,classname='',priority=false)=>{
 const img=photoFor(clinic),url=safePhoto(img.url);
 return url?'<img class="'+safe(classname)+'" src="'+safe(url)+'" '+(priority?'fetchpriority="high" loading="eager"':'loading="lazy"')+' decoding="async" alt="'+safe(img.alt)+'" referrerpolicy="no-referrer" data-illustration="'+(clinic.demo?'true':'false')+'">':'';
};
const photographer=(clinic)=>{
 const img=demoImage(clinic);
 return img?'<span class="photographer-caption">Fotografía ilustrativa: '+safe(img.photographer)+' · Pexels</span>':'';
};
const profileCredit=(clinic)=>{
 const img=demoImage(clinic);
 return img?'<p class="profile-photo-credit">Imagen de referencia, no de esta clínica. Foto: <a href="'+safe(img.source)+'" target="_blank" rel="noopener noreferrer">'+safe(img.photographer)+' · Pexels ↗</a></p>':'';
};
const badges=c=>[c.english?'Atención en inglés declarada':'',c.accessible?'Accesibilidad declarada':''].filter(Boolean).map(x=>'<span>'+safe(x)+'</span>').join('')||'<span>Características por confirmar</span>';
const treatmentOptions=()=>state.treatments.map(t=>'<option value="'+t.id+'">'+safe(t.name)+'</option>').join('');
const sectionHeading=(label,title,description)=>'<div class="section-heading"><div><span class="eyebrow">'+label+'</span><h2>'+title+'</h2><p>'+description+'</p></div></div>';
const escapeAttr=safe;
function treatmentGrid(){
 return '<div class="treatment-grid">'+state.treatments.map((t,i)=>
  '<button type="button" class="treatment-tile '+(state.selectedTreatment===t.id?'active':'')+'" data-treatment="'+safe(t.id)+'" aria-pressed="'+(state.selectedTreatment===t.id)+'">'+
  '<span class="treatment-number">'+String(i+1).padStart(2,'0')+'</span><div><h3>'+safe(t.name)+'</h3><p>'+safe(t.subtitle)+'</p></div></button>').join('')+'</div>';
}
function clinicCard(c){
 const id=safe(c.id),checked=state.compare.has(c.id);
 return '<article class="clinic-card">'+
  '<a href="/odontologia/clinicas/'+id+'" class="clinic-photo" aria-label="Abrir perfil de '+safe(c.name)+'">'+photo(c)+'<span class="photo-flag">'+(c.demo?'IMAGEN ILUSTRATIVA · DEMO':'IMAGEN DEL PERFIL')+'</span>'+photographer(c)+'</a>'+
  '<div class="clinic-content"><div class="clinic-kicker">'+demoLabel(c)+'<span>◉ '+safe(c.zone)+', Mazatlán</span></div>'+
  '<h3><a href="/odontologia/clinicas/'+id+'">'+safe(c.name)+'</a></h3>'+
  '<p class="clinic-desc">'+safe(c.description)+'</p>'+
  '<div class="clinic-perks">'+badges(c)+'</div>'+
  '<div class="card-bottom"><div class="price-ref"><small>Referencia de la consulta, no del tratamiento</small><strong>'+money(c.consultation_reference_mxn)+'</strong><em>'+safe(c.price_label)+'</em></div>'+
  '<div class="card-actions"><label class="compare-check"><input type="checkbox" data-compare="'+id+'" '+(checked?'checked':'')+'> Comparar</label>'+
  '<a class="outline-btn" href="/odontologia/clinicas/'+id+'">Ver perfil ↗</a>'+
  '<button class="primary-btn" type="button" data-quote="'+id+'">Preparar solicitud ↗</button></div></div></div></article>';
}
function renderHome(){
 document.title='Odontología en Mazatlán | Comparar clínicas y tratamientos | Growa';
 root.innerHTML=crumbs([{label:'Clínicas y tratamientos'}])+
 '<section class="hero"><div class="hero-copy"><span class="eyebrow">GROWA · ODONTOLOGÍA EN MAZATLÁN</span><h1>Encuentra opciones de <em>atención dental</em> para tu estancia.</h1>'+
 '<p>Explora información de prestadores, compara características y prepara tu visita. Clínicas, hospedaje y movilidad en una misma experiencia, con información clara sobre lo que está verificado y lo que aún no.</p>'+
 '<div class="hero-actions"><a class="primary-btn" href="#clinicas">Explorar clínicas <span>↗</span></a><a class="outline-btn" href="#tratamientos">Ver tratamientos</a></div></div>'+
 '<div class="hero-media"><img src="'+safe(safePhoto(photos.hero?.url)||'/static/img/dental-fallback.svg')+'" alt="'+safe(photos.hero?.alt||'Recepción de odontología, imagen ilustrativa')+'" fetchpriority="high" loading="eager" decoding="async" referrerpolicy="no-referrer"><div class="hero-media-note"><strong>Tu visita, mejor informada.</strong><span>Atención · Hospedaje · Movilidad</span></div><span class="hero-photo-credit">Fotografía ilustrativa · '+safe(photos.hero?.photographer||'Growa')+' · Pexels</span></div></section>'+
 '<div class="announcement"><span>ⓘ</span><p><strong>Etapa de demostración.</strong> Los perfiles DEMO son ejemplos ficticios y sus importes son ilustrativos. Growa no garantiza procedimientos, reseñas, acreditaciones, disponibilidad ni precios clínicos. No compartas información médica en el formulario.</p></div>'+
 '<nav class="sticky-links" aria-label="Contenido de odontología"><a href="#tratamientos">Tratamientos</a><a href="#clinicas">Clínicas</a><a href="#como-funciona">Cómo funciona</a><a href="#preguntas">Preguntas frecuentes</a></nav>'+
 '<section class="section" id="tratamientos">'+sectionHeading('EXPLORA POR PROCEDIMIENTO','¿Qué tipo de atención estás buscando?','Selecciona tu interés para preparar una solicitud. La disponibilidad y el procedimiento que ofrece cada clínica deben confirmarse directamente; las categorías no garantizan prestación.')+
 treatmentGrid()+
 '<div class="guide-strip"><div><h3 id="treatment-note-title">Cada tratamiento requiere una valoración individual</h3><p id="treatment-note">La información de esta página es orientativa. Los precios y procedimientos específicos no están verificados.</p></div><button class="outline-btn" type="button" id="treatment-quote">Preparar solicitud ↗</button></div></section>'+
 '<section class="section" id="clinicas">'+sectionHeading('DIRECTORIO DE ODONTOLOGÍA','Explora y compara clínicas','Las fichas muestran información del catálogo de Growa. No son un ranking médico ni incluyen reseñas o certificaciones inventadas.')+
 '<div class="directory-layout"><aside class="filter-sidebar" aria-label="Filtros del directorio">'+
 '<div class="filter-top"><strong>Filtrar resultados</strong><button type="button" id="clear-filters">Restablecer</button></div>'+
 '<div class="filter-field"><label for="clinic-q">Nombre o palabra clave</label><input id="clinic-q" type="search" placeholder="Buscar en Mazatlán…"></div>'+
 '<div class="filter-field"><label for="clinic-zone">Zona</label><select id="clinic-zone"><option value="">Todas las zonas</option>'+state.zones.map(z=>'<option value="'+safe(z)+'">'+safe(z)+'</option>').join('')+'</select></div>'+
 '<div class="filter-field"><strong>Características declaradas</strong>'+
 '<label class="check"><input type="checkbox" id="clinic-english"> Atención en inglés</label>'+
 '<label class="check"><input type="checkbox" id="clinic-access"> Accesibilidad</label>'+
 '<label class="check"><input type="checkbox" id="clinic-verified"> Solo verificados</label></div>'+
 '<p class="filter-note">Los filtros de accesibilidad e idioma se basan en declaraciones del catálogo. Comprueba estas condiciones con el prestador antes de viajar.</p></aside>'+
 '<div class="directory-content"><div class="directory-top"><div><strong id="clinic-count">'+state.total+' opciones</strong><br><span>Orden informativo, sin calificaciones fabricadas</span></div><label for="clinic-sort">Ordenar <select id="clinic-sort"><option value="name">Nombre (A–Z)</option><option value="zone">Zona</option><option value="reference_asc">Consulta de referencia: menor primero</option><option value="reference_desc">Consulta de referencia: mayor primero</option></select></label></div>'+
 '<div id="clinic-list" class="clinic-list">'+state.clinics.map(clinicCard).join('')+'</div>'+
 '<p class="pagination-note">No se ha verificado que estos prestadores ofrezcan los procedimientos elegidos. El precio de referencia corresponde a una ficha de consulta, nunca al procedimiento dental.</p></div></div>'+
 '<section id="comparison" class="compare-section" hidden></section></section>'+
 '<section class="section" id="como-funciona">'+sectionHeading('UNA EXPERIENCIA COORDINADA','Cómo funciona la orientación en Growa','Un proceso transparente: comparar información, preparar preguntas y verificar con el prestador antes de cualquier contratación.')+
 '<div class="process-grid"><div class="process-step"><span class="step-no">01</span><h3>Explora opciones</h3><p>Revisa los perfiles, su ubicación y las características declaradas. Los sellos DEMO distinguen los proveedores ficticios.</p></div><div class="process-step"><span class="step-no">02</span><h3>Prepara tu solicitud</h3><p>Selecciona tratamiento, idioma y necesidades de viaje. Growa genera un resumen; todavía no lo envía a clínicas.</p></div><div class="process-step"><span class="step-no">03</span><h3>Coordina tu estancia</h3><p>Cuando tengas información confirmada, puedes explorar hospedaje y transporte. No sustituye la consulta ni la valoración clínica.</p></div></div></section>'+
 '<section class="section" id="preguntas">'+sectionHeading('INFORMACIÓN CLARA','Preguntas frecuentes','Aspectos que conviene conocer antes de comparar opciones de odontología en otra ciudad.')+
 faqMarkup()+'</section>';
 const params=new URLSearchParams(location.search);
 const q=params.get('q')||'',zone=params.get('zona')||'',sort=params.get('orden')||'name';
 $('#clinic-q').value=q;
 if([...$('#clinic-zone').options].some(opt=>opt.value===zone))$('#clinic-zone').value=zone;
 if([...$('#clinic-sort').options].some(opt=>opt.value===sort))$('#clinic-sort').value=sort;
 $('#clinic-english').checked=params.get('ingles')==='1';
 $('#clinic-access').checked=params.get('accesible')==='1';
 $('#clinic-verified').checked=params.get('verificado')==='1';
 updateTreatmentNote();
 if(q||zone||params.has('ingles')||params.has('accesible')||params.has('verificado')||sort!=='name')refreshClinics();
}
function faqMarkup(){
 const rows=[
  ['¿Cuánto cuesta un implante, una corona o una carilla?','Growa no publica precios de procedimientos odontológicos sin cotizaciones verificadas por clínicas. Las cifras de demostración son solo ejemplos de consultas, no tarifas de implantes, coronas, carillas u otros tratamientos.'],
  ['¿Cómo se comprueban las clínicas y sus credenciales?','Los perfiles DEMO no representan establecimientos reales. Un perfil real solo debe mostrarse como verificado después de revisar sus documentos. Comprueba la cédula profesional y la autorización sanitaria aplicable ante las autoridades correspondientes.'],
  ['¿Puedo reservar directamente desde Growa?','Esta sección permite preparar un resumen de orientación, no enviar ni confirmar una cita. El planificador general usa disponibilidad declarada y requiere confirmaciones externas por cada proveedor.'],
  ['¿Qué debo considerar si viajo desde Estados Unidos?','Solicita presupuesto por escrito, alcance del tratamiento, estudios, tiempos de estancia, revisiones posteriores, condiciones de atención en inglés y opciones ante complicaciones. Comprueba tus coberturas de seguro directamente con la aseguradora.'],
  ['¿La clínica incluye hotel y traslados?','No se incluyen automáticamente. Growa permite explorar alojamiento y transporte por separado; todo paquete debe tener condiciones y precios confirmados por proveedores participantes.'],
  ['¿Los perfiles tienen reseñas, médicos o certificaciones?','No incluimos puntuaciones, opiniones, especialistas nominados ni acreditaciones sin documentación comprobada. La ausencia de esa información no equivale a una evaluación clínica negativa o positiva.']
 ];
 return '<div class="faq">'+rows.map(([title,answer])=>'<details><summary>'+safe(title)+'</summary><p>'+safe(answer)+'</p></details>').join('')+'</div>';
}
function updateTreatmentNote(){
 const t=state.treatments.find(x=>x.id===state.selectedTreatment);
 const title=$('#treatment-note-title'),body=$('#treatment-note');
 if(title)title.textContent=t?'Interés seleccionado: '+t.name:'Cada tratamiento requiere una valoración individual';
 if(body)body.textContent=t?t.about+' Growa no garantiza que los perfiles listados ofrezcan este procedimiento.':'La información es orientativa. Los precios y procedimientos específicos no están verificados.';
 $$('.treatment-tile').forEach(button=>{button.classList.toggle('active',button.dataset.treatment===state.selectedTreatment);button.setAttribute('aria-pressed',String(button.dataset.treatment===state.selectedTreatment))});
}
function paramsFromFilters(){
 const p=new URLSearchParams();
 const q=$('#clinic-q')?.value.trim()||'',zone=$('#clinic-zone')?.value||'';
 if(q)p.set('q',q);if(zone)p.set('zone',zone);
 if($('#clinic-english')?.checked)p.set('english','true');
 if($('#clinic-access')?.checked)p.set('accessible','true');
 if($('#clinic-verified')?.checked)p.set('verified','true');
 p.set('sort',$('#clinic-sort')?.value||'name');
 return p;
}
function syncURL(p){
 const clean=new URLSearchParams();if(p.get('q'))clean.set('q',p.get('q'));
 if(p.get('zone'))clean.set('zona',p.get('zone'));
 if(p.has('english'))clean.set('ingles','1');
 if(p.has('accessible'))clean.set('accesible','1');
 if(p.has('verified'))clean.set('verificado','1');
 if(p.get('sort')!=='name')clean.set('orden',p.get('sort'));
 if(state.selectedTreatment)clean.set('tratamiento',state.selectedTreatment);
 const suffix=clean.toString();history.replaceState(null,'','/odontologia'+(suffix?'?'+suffix:'')+(location.hash||''));
}
async function refreshClinics(){
 const p=paramsFromFilters(),id=++state.requestId;
 $('#clinic-count').textContent='Buscando opciones…';
 try{
  const data=await api('/api/dental/clinics?'+p);
  if(id!==state.requestId)return;
  state.clinics=data.items||[];state.total=data.total||0;
  $('#clinic-count').textContent=state.total+' '+(state.total===1?'perfil':'perfiles');
  $('#clinic-list').innerHTML=state.clinics.length?state.clinics.map(clinicCard).join(''):
   '<div class="empty-list"><h3>No hay perfiles con estos filtros.</h3><p>Prueba con otra zona o desactiva filtros. El catálogo todavía contiene principalmente demostraciones.</p><button class="outline-btn" id="inline-clear">Restablecer filtros</button></div>';
  syncURL(p);syncCompareChecks();
 }catch(e){if(id!==state.requestId)return;$('#clinic-list').innerHTML='<div class="empty-list"><h3>No se pudo cargar el directorio</h3><p>'+safe(e.message)+'</p><button class="outline-btn" id="retry-clinics">Reintentar</button></div>';$('#clinic-count').textContent='Sin datos disponibles';}
}
function resetFilters(){
 $('#clinic-q').value='';$('#clinic-zone').value='';$('#clinic-english').checked=false;
 $('#clinic-access').checked=false;$('#clinic-verified').checked=false;$('#clinic-sort').value='name';refreshClinics();
}
function toggleCompare(id,checked){
 if(!state.allClinics.some(c=>c.id===id))return;
 if(checked&&state.compare.size>=3&&!state.compare.has(id)){toast('Puedes comparar hasta tres perfiles a la vez.');syncCompareChecks();return}
 if(checked)state.compare.add(id);else state.compare.delete(id);
 syncCompareChecks();renderCompareTray();
}
function syncCompareChecks(){ $$('[data-compare]').forEach(e=>{e.checked=state.compare.has(e.dataset.compare)}) }
function renderCompareTray(){
 const tray=$('#compare-tray');tray.hidden=state.compare.size===0;
 $('#compare-list').innerHTML=[...state.compare].map(id=>{const c=state.allClinics.find(x=>x.id===id);return c?'<span>'+safe(c.name)+'</span>':''}).join('');
 $('#compare-show').disabled=state.compare.size<2;
}
function showComparison(){
 const items=[...state.compare].map(id=>state.allClinics.find(c=>c.id===id)).filter(Boolean);
 if(items.length<2){toast('Selecciona dos o tres perfiles.');return}
 const comparison=$('#comparison');comparison.hidden=false;
 const rows=[
  ['Zona',c=>c.zone],['Importe de consulta de referencia',c=>c.consultation_reference_mxn==null?'Sin referencia':money(c.consultation_reference_mxn)+(c.demo?' · DEMO':'')],
  ['Atención en inglés declarada',c=>c.english?'Sí, por confirmar':'No declarada'],
  ['Accesibilidad declarada',c=>c.accessible?'Sí, por confirmar':'No declarada'],
  ['Documentación del proveedor',c=>c.demo?'Ficticio · DEMO':c.verified?'Growa verificado*':'Pendiente de revisión'],
  ['Precio de tratamiento',()=>'Sin cotización verificada'],
  ['Reseñas y resultados',()=>'No disponibles ni verificados']
 ];
 comparison.innerHTML=sectionHeading('COMPARACIÓN','Tu selección','Compara lo declarado, no una clasificación por resultados clínicos.')+
 '<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Característica</th>'+items.map(c=>'<th><a href="/odontologia/clinicas/'+safe(c.id)+'">'+safe(c.name)+' ↗</a></th>').join('')+'</tr></thead><tbody>'+
 rows.map(([label,reader])=>'<tr><td>'+safe(label)+'</td>'+items.map(c=>'<td>'+safe(reader(c))+'</td>').join('')+'</tr>').join('')+
 '</tbody></table></div><p class="pagination-note">Los precios de ejemplo no representan presupuestos clínicos y los perfiles ficticios no son proveedores operativos.</p>';
 comparison.scrollIntoView({behavior:'smooth',block:'start'});
}
function profilePage(clinic){
 document.title=clinic.name+' | Odontología en Mazatlán | Growa';
 state.activeClinic=clinic;
 root.innerHTML=crumbs([{label:'Clínicas',url:'/odontologia#clinicas'},{label:clinic.name}])+
 '<section class="profile-hero"><div><span class="eyebrow">PERFIL ODONTOLÓGICO · MAZATLÁN</span>'+
 '<h1>'+safe(clinic.name)+'</h1>'+
 '<div class="clinic-kicker">'+demoLabel(clinic)+'<span>◉ '+safe(clinic.zone)+'</span></div>'+
 '<p>'+safe(clinic.description)+'</p><div class="clinic-perks">'+badges(clinic)+'</div>'+
 '<div class="profile-hero-actions"><button class="primary-btn" type="button" data-quote="'+safe(clinic.id)+'">Preparar consulta ↗</button><a class="outline-btn" href="/odontologia#clinicas">Volver a las clínicas</a></div></div>'+
 '<div class="profile-image-column"><div class="profile-photo">'+photo(clinic,'',true)+'</div>'+profileCredit(clinic)+'</div></section>'+
 '<div class="announcement"><span>ⓘ</span><p><strong>'+safe(clinic.demo?'Proveedor ficticio DEMO.':'Información declarada por el proveedor.')+'</strong> '+safe(clinic.notice)+' No se debe interpretar este perfil como acreditación, recomendación clínica ni disponibilidad confirmada.</p></div>'+
 (clinic.demo?'<section class="dental-gallery" aria-label="Imágenes ilustrativas de odontología"><div class="dental-gallery-head"><span class="eyebrow">ESPACIOS Y ATENCIÓN DENTAL</span><h2>Una mirada a la experiencia odontológica</h2><p>Fotografías de referencia. No muestran instalaciones, personal ni servicios de este proveedor ficticio.</p></div><div class="dental-gallery-grid">'+[photos.consultation,photos.profile].map(x=>'<figure><img src="'+safe(safePhoto(x?.url)||'/static/img/dental-fallback.svg')+'" loading="lazy" decoding="async" alt="'+safe(x?.alt||'Imagen ilustrativa')+'" referrerpolicy="no-referrer"><figcaption>Imagen ilustrativa · <a target="_blank" rel="noopener noreferrer" href="'+safe(x?.source||'https://www.pexels.com/')+'">'+safe(x?.photographer||'Pexels')+' · Pexels</a></figcaption></figure>').join('')+'</div></section>':'')+'<div class="profile-facts"><div><small>Zona</small><strong>'+safe(clinic.zone)+', Mazatlán</strong></div><div><small>Consulta de referencia</small><strong>'+money(clinic.consultation_reference_mxn)+'</strong></div><div><small>Idioma</small><strong>'+safe(clinic.english?'Inglés declarado · por confirmar':'Español / confirmar idiomas')+'</strong></div></div>'+
 '<div class="profile-info"><article class="profile-body"><span class="eyebrow">INFORMACIÓN GENERAL</span><h2>Qué sabemos de este perfil</h2>'+
 '<p>'+safe(clinic.description)+'</p><p>Growa no publica especialistas, años de experiencia, tasas de éxito, cédulas, reseñas ni certificaciones si no hay documentación que permita comprobarlas.</p>'+
 '<h2>Tratamientos sobre los que puedes preguntar</h2><p>Estas son categorías generales para preparar una conversación con una clínica; <strong>no son servicios acreditados como disponibles en este perfil.</strong></p>'+
 '<div class="profile-services">'+state.treatments.map(t=>'<span>'+safe(t.name)+'</span>').join('')+'</div>'+
 '<h2>Información que conviene solicitar</h2><ul><li>Cédula profesional y especialidad del odontólogo, según corresponda.</li><li>Plan por escrito, alcance, materiales y número de visitas.</li><li>Precio final del procedimiento y posibles costos adicionales.</li><li>Condiciones de seguimiento, complicaciones y continuidad de atención.</li><li>Idioma de atención, accesos y movilidad comprobados directamente.</li></ul>'+
 '<h2>Organiza la estancia</h2><p>Una vez que hayas comprobado el tratamiento, puedes explorar alojamiento, traslados y un itinerario provisional en Growa. El planificador no sustituye la confirmación médica.</p>'+
 '<a href="/planificar?prestador='+safe(clinic.id)+'" class="outline-btn">Abrir planificador de estancia ↗</a></article>'+
 '<aside class="profile-aside"><span class="eyebrow">INFORMACIÓN ECONÓMICA</span><h3>Solicita claridad antes de viajar</h3><p>Referencia de consulta: <strong>'+money(clinic.consultation_reference_mxn)+'</strong></p><p>'+safe(clinic.price_label)+'. No equivale al precio de implantes, carillas, coronas u otros tratamientos.</p>'+
 '<p>La preparación de solicitud en Growa es una simulación y no envía datos a ningún prestador.</p><button class="primary-btn" data-quote="'+safe(clinic.id)+'">Preparar resumen ↗</button>'+
 '<a class="back-link" href="/odontologia#clinicas">← Comparar más clínicas</a></aside></div>';
}
async function openQuote(clinicId){
 const shell=$('#quote-shell'),select=$('#quote-clinic');
 state.returnFocus=document.activeElement;
 const items=state.allClinics;
 if(!items.length){toast('No hay perfiles disponibles para preparar esta solicitud.');return;}
 select.innerHTML=items.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+'</option>').join('');
 if(clinicId&&items.some(x=>x.id===clinicId))select.value=clinicId;
 $('#quote-treatment').innerHTML=treatmentOptions();
 if(state.selectedTreatment)$('#quote-treatment').value=state.selectedTreatment;
 $('#quote-result').hidden=true;$('#quote-result').innerHTML='';
 $('#quote-form').hidden=false;$('#quote-error').textContent='';
 shell.hidden=false;$('#scrim').hidden=false;document.body.style.overflow='hidden';
 $('#quote-close').focus();
}
function closeQuote(){
 $('#quote-shell').hidden=true;$('#scrim').hidden=true;document.body.style.overflow='';
 state.returnFocus?.focus?.();
}
function downloadBrief(data){
 const text=[
  'GROWA HOSPITALITY — RESUMEN PRELIMINAR (NO ENVIADO)',
  'Prestador: '+data.clinic_name,
  'Tratamiento de interés: '+data.procedure,
  'Viaje: '+({sin_definir:'Sin definir',proximo_mes:'Próximo mes',tres_meses:'Próximos tres meses',mas_adelante:'Más adelante'}[data.travel_window]||data.travel_window),
  'Idioma: '+(data.language==='en'?'Inglés':'Español'),
  'Hospedaje: '+(data.needs_hotel?'Explorar':'No solicitado'),
  'Transporte: '+(data.needs_transport?'Explorar':'No solicitado'),
  '',
  'No se ha enviado ninguna solicitud a una clínica.',
  'No existe cotización ni precio de procedimiento verificado.',
  'Antes de viajar, confirma cédulas, plan clínico, precios y seguimiento.'
 ].join('\n');
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='growa-resumen-odontologia.txt';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function submitQuote(e){
 e.preventDefault();
 const payload={clinic_id:$('#quote-clinic').value,treatment:$('#quote-treatment').value,
   travel_window:$('#quote-window').value,language:$('#quote-language').value,
   needs_hotel:$('#quote-hotel').checked,needs_transport:$('#quote-transport').checked};
 $('#quote-submit').disabled=true;$('#quote-error').textContent='';
 try{
  const data=await api('/api/dental/quote-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  state.quotePreview=data;
  $('#quote-form').hidden=true;$('#quote-result').hidden=false;
  $('#quote-result').innerHTML='<div class="quote-result"><span class="tag demo">BORRADOR · NO ENVIADO</span><h3>Tu resumen está preparado</h3>'+
   '<dl><dt>Prestador</dt><dd>'+safe(data.clinic_name)+'</dd><dt>Interés</dt><dd>'+safe(data.procedure)+'</dd><dt>Idioma</dt><dd>'+safe(data.language==='en'?'Inglés':'Español')+'</dd><dt>Hospedaje</dt><dd>'+(data.needs_hotel?'Sí':'No')+'</dd><dt>Transporte</dt><dd>'+(data.needs_transport?'Sí':'No')+'</dd></dl>'+
   '<p>'+safe(data.notice)+'</p><button type="button" class="primary-btn wide" id="download-brief">Guardar resumen en mi dispositivo ↗</button><button type="button" class="outline-btn wide" id="quote-again">Editar preferencias</button></div>';
 }catch(err){$('#quote-error').textContent=err.message}finally{$('#quote-submit').disabled=false}
}
function wire(){
 document.addEventListener('error',event=>{
  const img=event.target;
  if(img?.tagName==='IMG'&&img.dataset.fallback!=='1'){
   img.dataset.fallback='1';img.src='/static/img/dental-fallback.svg';
  }
 },true);
 const mobile=$('#mobile-nav-toggle'),menu=$('#mobile-nav');
 mobile.addEventListener('click',()=>{menu.hidden=!menu.hidden;mobile.setAttribute('aria-expanded',String(!menu.hidden));mobile.textContent=menu.hidden?'☰':'×'});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#quote-shell').hidden){closeQuote();return}if(e.key==='Escape'&&!menu.hidden){menu.hidden=true;mobile.setAttribute('aria-expanded','false');mobile.textContent='☰'}});
 $('#quote-close').onclick=closeQuote;$('#scrim').onclick=closeQuote;$('#quote-form').onsubmit=submitQuote;
 $('#compare-close').onclick=()=>$('#compare-tray').hidden=true;
 $('#compare-clear').onclick=()=>{state.compare.clear();syncCompareChecks();renderCompareTray();const cmp=$('#comparison');if(cmp)cmp.hidden=true};
 $('#compare-show').onclick=showComparison;
 root.addEventListener('click',event=>{
  const quote=event.target.closest('[data-quote]');if(quote){openQuote(quote.dataset.quote);return}
  const t=event.target.closest('[data-treatment]');if(t){state.selectedTreatment=t.dataset.treatment;updateTreatmentNote();if($('#clinic-q'))syncURL(paramsFromFilters());return}
  if(event.target.closest('#treatment-quote')){openQuote(state.clinics[0]?.id);return}
  if(event.target.closest('#clear-filters')||event.target.closest('#inline-clear')){resetFilters();return}
  if(event.target.closest('#retry-clinics')){refreshClinics();return}
 });
 root.addEventListener('change',event=>{
  const input=event.target;
  if(input.matches('[data-compare]')){toggleCompare(input.dataset.compare,input.checked);return}
  if(input.matches('#clinic-zone,#clinic-english,#clinic-access,#clinic-verified,#clinic-sort'))refreshClinics();
 });
 let timer;
 root.addEventListener('input',event=>{if(event.target.matches('#clinic-q')){clearTimeout(timer);timer=setTimeout(refreshClinics,260)}});
 $('#quote-shell').addEventListener('click',event=>{
  if(event.target.closest('#download-brief')&&state.quotePreview)downloadBrief(state.quotePreview);
  if(event.target.closest('#quote-again')){$('#quote-form').hidden=false;$('#quote-result').hidden=true}
 });
}
async function start(){
 wire();
 try{
  const [t,cl]=await Promise.all([api('/api/dental/treatments'),api('/api/dental/clinics')]);
  state.treatments=t.items||[];state.allClinics=cl.items||[];state.clinics=cl.items||[];state.zones=cl.zones||[];state.total=cl.total||0;
  const requested=new URLSearchParams(location.search).get('tratamiento');
  state.selectedTreatment=state.treatments.some(x=>x.id===requested)?requested:null;
  const id=pathClinic();
  if(id){
   const profile=await api('/api/dental/clinics/'+encodeURIComponent(id));
   const c=profile.clinic;
   if(!state.allClinics.some(x=>x.id===c.id))state.allClinics.push(c);
   profilePage(c);
  }else renderHome();
 }catch(err){root.innerHTML='<div class="empty-list" style="margin:60px 0"><h3>La información dental no está disponible</h3><p>'+safe(err.message)+'</p><a href="/" class="outline-btn">Volver a Growa</a></div>';}
}
start();
})();
