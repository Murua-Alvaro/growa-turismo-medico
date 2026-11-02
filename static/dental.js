/* GROWA / DENTAL DIRECTORY
   Native, provider-driven directory UI. Never synthesise ratings, clinical
   outcomes, qualifications, services offered, or treatment prices. */
(()=>{
'use strict';
const $=(q,scope=document)=>scope.querySelector(q);
const $$=(q,scope=document)=>Array.from(scope.querySelectorAll(q));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n==null?'Sin importe publicado':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
const photos=window.GROWA_DENTAL_PHOTOS||{};
const isURL=x=>{try{return new URL(x).protocol==='https:'}catch{return false}};
const imgData=c=>c.demo&&photos[c.name]?photos[c.name]:{url:c.image_url,source:'',photographer:'',alt:'Imagen del catálogo del prestador'};
const renderImg=(obj,priority=false)=>'<img src="'+esc(isURL(obj.url)?obj.url:'/static/img/dental-fallback.svg')+'" alt="'+esc(obj.alt||'Fotografía informativa')+'" '+(priority?'loading="eager" fetchpriority="high"':'loading="lazy"')+' decoding="async" referrerpolicy="no-referrer">';
const refImg=c=>c.demo?'<span class="image-source">Fotografía ilustrativa · Pexels</span>':'';
const sourceLink=c=>{const p=imgData(c);return c.demo&&p.source?'<a href="'+esc(p.source)+'" target="_blank" rel="noopener noreferrer">'+esc(p.photographer)+' / Pexels</a>':''};
const state={all:[],visible:[],treatments:[],zones:[],selected:new Set(),interest:'',request:0,current:null,returnFocus:null,quote:null,filtersOpen:false};
const root=$('#main');
let searchTimer=null,noticeTimer=null;
const urlParams=new URLSearchParams(location.search);
function notify(text){const t=$('#toast');t.textContent=text;t.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>t.hidden=true,3200)}
async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:'No fue posible cargar la información');return data}
const categoryName=id=>state.treatments.find(x=>x.id===id)?.name||'Procedimiento por definir';
const crumbs=(detail=false)=>'<nav class="crumbs" aria-label="Ruta"><a href="/">Inicio</a><span>/</span><a href="/odontologia">Odontología</a>'+(detail?'<span>/</span><span>Ficha de clínica</span>':'<span>/</span><span>Mazatlán</span>')+'</nav>';
const status=c=>c.demo?'<span class="label label-demo">Demostración</span>':c.verified?'<span class="label label-verified">Verificado por Growa*</span>':'<span class="label label-pending">Pendiente de validación</span>';
const field=(id,name,label)=>'<option value="'+esc(id)+'">'+esc(name||label)+'</option>';
function card(c){
 const pic=imgData(c),id=esc(c.id),selected=state.selected.has(c.id);
 const profileHref='/odontologia/clinicas/'+id;
 return '<article class="result" data-id="'+id+'">'+
 '<div class="result-cover"><a href="'+profileHref+'" aria-label="Ver ficha de '+esc(c.name)+'">'+renderImg(pic)+'</a>'+
 '<span class="cover-tag">'+(c.demo?'FOTOGRAFÍA ILUSTRATIVA':'IMAGEN DEL PERFIL')+'</span>'+refImg(c)+'</div>'+
 '<div class="result-body"><div class="result-overline"><span>ODONTOLOGÍA · '+esc(c.zone)+'</span>'+status(c)+'</div>'+
 '<h3><a href="'+profileHref+'">'+esc(c.name)+'</a></h3>'+
 '<p class="result-description">'+esc(c.description)+'</p>'+
 '<div class="result-attributes"><span><b>Ubicación</b>'+esc(c.zone)+', Mazatlán</span>'+
 '<span><b>Idioma</b>'+(c.english?'Inglés declarado':'Por confirmar')+'</span>'+
 '<span><b>Accesibilidad</b>'+(c.accessible?'Declarada':'Por confirmar')+'</span></div>'+
 '<div class="result-foot"><label class="compare-choice"><input type="checkbox" data-compare="'+id+'" '+(selected?'checked':'')+'> Comparar perfil</label>'+
 '<a href="'+profileHref+'">Conocer la clínica <span aria-hidden="true">↗</span></a></div></div>'+
 '<div class="result-action"><span class="result-action-kicker">Consulta de referencia</span>'+
 '<strong class="result-price">'+money(c.consultation_reference_mxn)+'</strong>'+
 '<small>'+(c.demo?'IMPORTE FICTICIO · DEMO':esc(c.price_label))+'</small>'+
 '<div class="result-action-bottom"><a class="action-secondary" href="'+profileHref+'">Ver información <span aria-hidden="true">↗</span></a>'+
 '<button type="button" class="action-primary" data-quote="'+id+'">Preparar consulta <span aria-hidden="true">↗</span></button></div></div>'+
 '</article>';
}
function displayList(){
 const area=$('#results-list');if(!area)return;
 $('#result-count').textContent=state.visible.length+' '+(state.visible.length===1?'perfil encontrado':'perfiles encontrados');
 area.innerHTML=state.visible.length?state.visible.map(card).join(''):'<div class="no-results"><h3>No hay resultados para estos filtros</h3><p>Amplía la búsqueda o restablece los filtros para ver todas las opciones disponibles.</p><button type="button" class="action-secondary" data-reset>Restablecer filtros</button></div>';
 updateCompareUI();
}
function activePills(){
 const p=$('#active-filters');if(!p)return;
 const values=[];
 if($('#clinic-q')?.value.trim())values.push('Búsqueda: '+$('#clinic-q').value.trim());
 if($('#clinic-zone')?.value)values.push('Zona: '+$('#clinic-zone').value);
 if($('#clinic-english')?.checked)values.push('Inglés');
 if($('#clinic-access')?.checked)values.push('Accesibilidad');
 if($('#clinic-verified')?.checked)values.push('Verificados');
 p.innerHTML=values.map(x=>'<span>'+esc(x)+'</span>').join('');
 p.hidden=values.length===0;
}
function query(){
 const p=new URLSearchParams();
 const v=$('#clinic-q')?.value.trim();if(v)p.set('q',v);
 if($('#clinic-zone')?.value)p.set('zone',$('#clinic-zone').value);
 if($('#clinic-english')?.checked)p.set('english','true');
 if($('#clinic-access')?.checked)p.set('accessible','true');
 if($('#clinic-verified')?.checked)p.set('verified','true');
 p.set('sort',$('#clinic-sort')?.value||'name');
 return p;
}
function updateAddress(params){
 const p=new URLSearchParams();
 if(params.get('q'))p.set('q',params.get('q'));
 if(params.get('zone'))p.set('zona',params.get('zone'));
 if(params.get('english'))p.set('ingles','1');
 if(params.get('accessible'))p.set('accesible','1');
 if(params.get('verified'))p.set('verificado','1');
 if(params.get('sort')!=='name')p.set('orden',params.get('sort'));
 if(state.interest)p.set('tratamiento',state.interest);
 history.replaceState(null,'','/odontologia'+(p.toString()?'?'+p:'')+(location.hash||''));
}
async function refresh(){
 const p=query(),serial=++state.request;
 const count=$('#result-count');if(count)count.textContent='Buscando…';
 try{
  const r=await api('/api/dental/clinics?'+p.toString());
  if(serial!==state.request)return;
  state.visible=r.items||[];
  for(const clinic of state.visible){
   if(!state.all.some(existing=>existing.id===clinic.id))state.all.push(clinic);
  }
  displayList();activePills();updateAddress(p);
 }catch(e){
  if(serial!==state.request)return;
  $('#results-list').innerHTML='<div class="no-results"><h3>No pudimos cargar las clínicas</h3><p>'+esc(e.message)+'</p><button type="button" class="action-secondary" data-retry>Reintentar</button></div>';
  $('#result-count').textContent='Error de conexión';
 }
}
function reset(){
 $('#clinic-q').value='';$('#clinic-zone').value='';$('#clinic-english').checked=false;
 $('#clinic-access').checked=false;$('#clinic-verified').checked=false;$('#clinic-sort').value='name';
 refresh();
}
function selectInterest(id,toggle=true){
 state.interest=toggle&&state.interest===id?'':id;
 $$('.procedure-item').forEach(b=>{const active=b.dataset.procedure===state.interest;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 const title=$('#selected-procedure');if(title)title.textContent=state.interest?categoryName(state.interest):'';
 const p=$('#procedure-disclosure');if(p)p.hidden=!state.interest;
 const desc=$('#procedure-description');if(desc)desc.textContent=state.treatments.find(x=>x.id===state.interest)?.about||'';
 const selector=$('#procedure-select');if(selector)selector.value=state.interest;
 if($('#results-list'))updateAddress(query());
}
function treatmentIcon(name){
 const n=String(name||'').toLowerCase();
 const base='viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"';
 if(n.includes('implante'))return '<svg '+base+'><path d="M8 3h8M9 6h6M8 9h8M9 12h6M10 15h4M12 18v3"/><path d="M7 3l1 6 4 9 4-9 1-6"/></svg>';
 if(n.includes('ortodoncia'))return '<svg '+base+'><path d="M4 9c-1 3-1 6 0 9M20 9c1 3 1 6 0 9M4 11h16M4 16h16"/><rect x="6" y="8" width="4" height="10" rx="1"/><rect x="14" y="8" width="4" height="10" rx="1"/></svg>';
 if(n.includes('limpieza')||n.includes('prevención'))return '<svg '+base+'><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';
 if(n.includes('corona')||n.includes('prótesis'))return '<svg '+base+'><path d="m3 7 4 4 5-6 5 6 4-4-2 12H5z"/><path d="M5 16h14"/></svg>';
 return '<svg '+base+'><path d="M12 5c-3-3-8-2-9 2-1 3 1 6 2 9l2 5 2-1 3-7 3 7 2 1 2-5c1-3 3-6 2-9-1-4-6-5-9-2z"/></svg>';
}
function renderHome(){
 document.title='Odontología en Mazatlán | Growa Hospitality';
 root.classList.add('is-directory');
 const t=state.treatments,z=state.zones,heroPhoto=photos['Odontología Marina Norte · DEMO']||photos.hero||{};
 root.innerHTML='<div class="dental-home">'+
 '<section class="dental-hero" aria-labelledby="dental-hero-title">'+
 '<div class="dental-hero-media">'+renderImg(heroPhoto,true)+'</div>'+
 '<div class="dental-hero-shade"></div><div class="dental-hero-content"><p class="dental-hero-eyebrow">ODONTOLOGÍA EN MAZATLÁN</p>'+
 '<h1 id="dental-hero-title">Tu salud dental, <em>con la tranquilidad de un viaje bien planeado.</em></h1>'+
 '<p>Conoce opciones de atención odontológica, compara información disponible y prepara tu visita a Mazatlán desde un mismo lugar.</p>'+
 '<div class="dental-hero-links"><a href="#clinicas" class="dental-hero-cta">Explorar clínicas <span aria-hidden="true">↗</span></a>'+
 '<a href="/mi-proceso" class="dental-hero-secondary">Consultar mi proceso <span aria-hidden="true">→</span></a></div>'+
 '<small class="dental-hero-caption">DIRECTORIO INDEPENDIENTE · INFORMACIÓN SUJETA A CONFIRMACIÓN DEL PRESTADOR</small></div>'+
 '<span class="dental-hero-photo-caption">Fotografía ilustrativa · '+esc(heroPhoto.photographer||'Pexels')+'</span></section>'+
 '<section class="procedures" id="tratamientos" aria-label="Tratamientos odontológicos"><div class="procedure-header"><span>EXPLORAR POR TRATAMIENTO</span><p>Categorías orientativas; consulta la oferta directamente con cada clínica.</p></div>'+
 '<div class="procedure-row" role="group" aria-label="Selecciona un tratamiento">'+t.map(x=>'<button type="button" class="procedure-item" data-procedure="'+esc(x.id)+'" aria-pressed="false"><span class="procedure-icon">'+treatmentIcon(x.name)+'</span><span class="procedure-name">'+esc(x.name)+'</span></button>').join('')+'</div>'+
 '<div class="treatment-select-mobile"><label for="procedure-select">Elegir tratamiento</label><select id="procedure-select"><option value="">Todos los tratamientos</option>'+t.map(x=>field(x.id,x.name)).join('')+'</select></div>'+
 '<div id="procedure-disclosure" class="procedure-disclosure" hidden><div><span class="procedure-disclosure-prefix">TRATAMIENTO DE INTERÉS</span><strong id="selected-procedure"></strong></div><p id="procedure-description"></p><button type="button" data-quote="">Preparar consulta <span aria-hidden="true">↗</span></button></div></section>'+
 '<section class="market-results" id="clinicas"><div class="directory-heading"><div><p class="directory-eyebrow">DIRECTORIO DE ODONTOLOGÍA / MAZATLÁN</p><h2>Clínicas de odontología<br><em>en Mazatlán.</em></h2><p>Explora información publicada por los prestadores. Los perfiles DEMO son ficticios.</p></div><div class="directory-heading-action"><a href="/planificar">Planifica tu estancia <span aria-hidden="true">↗</span></a></div></div>'+
 '<div class="market-layout"><button type="button" id="filters-backdrop" class="filters-backdrop" aria-label="Cerrar filtros" hidden></button>'+
 '<aside class="filter-sidebar" id="filters" aria-label="Filtros del directorio"><div class="filter-title"><h2>Refinar búsqueda</h2><button type="button" data-reset>Restablecer</button><button type="button" class="filter-mobile-close" data-close-filters aria-label="Cerrar filtros">×</button></div>'+
 '<div class="filter-group"><label for="clinic-zone">Ubicación</label><select id="clinic-zone"><option value="">Todo Mazatlán</option>'+z.map(x=>field(x,x)).join('')+'</select></div>'+
 '<div class="filter-group"><span class="filter-label">Servicios e instalaciones</span>'+
 '<label class="filter-check"><input id="clinic-english" type="checkbox"> Atención en inglés</label>'+
 '<label class="filter-check"><input id="clinic-access" type="checkbox"> Accesibilidad declarada</label></div>'+
 '<div class="filter-group"><span class="filter-label">Estado del perfil</span><label class="filter-check"><input id="clinic-verified" type="checkbox"> Solo perfiles verificados</label></div>'+
 '<div class="sidebar-explain">Las características proceden del catálogo. Las fichas DEMO no representan clínicas reales ni acreditan disponibilidad.</div>'+
 '<a class="sidebar-link" href="/mazatlan">Conoce Mazatlán <span aria-hidden="true">↗</span></a></aside>'+
 '<div class="results-area"><div class="results-bar"><div class="results-headings"><h2>Opciones disponibles</h2><p id="result-count" role="status"></p></div>'+
 '<div class="results-tools"><button type="button" class="mobile-filter" id="toggle-filters" aria-controls="filters" aria-expanded="false">Filtros <span aria-hidden="true">↓</span></button>'+
 '<label for="clinic-sort">Ordenar por</label><select id="clinic-sort"><option value="name">Nombre</option><option value="zone">Zona</option><option value="reference_asc">Consulta: menor importe</option><option value="reference_desc">Consulta: mayor importe</option></select></div></div>'+
 '<form class="search-panel" id="directory-search" role="search"><label for="clinic-q" class="visually-hidden">Buscar clínicas por nombre o zona</label>'+
 '<span class="search-icon" aria-hidden="true">⌕</span><input id="clinic-q" type="search" placeholder="Buscar clínica, colonia o zona" autocomplete="off">'+
 '<button type="submit" class="search-button">Buscar <span aria-hidden="true">↗</span></button></form>'+
 '<div class="active-filters" id="active-filters" hidden></div>'+
 '<div class="result-list" id="results-list">'+state.visible.map(card).join('')+'</div>'+
 '<p class="listing-footer">Los importes, cuando se publican, corresponden exclusivamente a consultas de referencia. No constituyen cotizaciones de tratamientos. La selección de un tratamiento no confirma que un prestador lo ofrezca.</p>'+
 '<section class="comparison-section" id="comparison" hidden></section></div></div></section>'+
 '<section class="information" id="informacion"><div><p class="section-overline">ANTES DE ELEGIR</p><h2>Qué conviene verificar antes de viajar.</h2></div>'+
 '<div class="information-grid"><article><strong>01 /</strong><h3>Credenciales y permisos</h3><p>Solicita cédulas profesionales y la documentación aplicable del establecimiento.</p></article>'+
 '<article><strong>02 /</strong><h3>Costos y materiales</h3><p>Pregunta por el presupuesto total, materiales, número de visitas y seguimiento.</p></article>'+
 '<article><strong>03 /</strong><h3>Itinerario</h3><p>Acuerda los tiempos de atención antes de contratar traslados u hospedaje.</p></article></div></section>'+
 '<section class="faq-section" id="preguntas"><div class="minor-heading"><h2>Preguntas frecuentes</h2></div>'+
 '<details><summary>¿Son precios de tratamientos dentales?</summary><p>No. Las cifras ilustrativas corresponden a consultas de referencia; el costo de tratamientos debe cotizarse directamente con el proveedor.</p></details>'+
 '<details><summary>¿Las clínicas están verificadas?</summary><p>Los perfiles marcados DEMO son ficticios. Las fichas de otros prestadores indican su estado de validación; no se presentan reseñas ni credenciales sin verificar.</p></details>'+
 '<details><summary>¿Se envía una solicitud desde Growa?</summary><p>Por ahora puedes preparar un resumen descargable. No se envía a ninguna clínica ni confirma una cita.</p></details></section></div>';
 const a=urlParams;
 $('#clinic-q').value=a.get('q')||'';
 if(z.includes(a.get('zona')))$('#clinic-zone').value=a.get('zona');
 $('#clinic-english').checked=a.get('ingles')==='1';
 $('#clinic-access').checked=a.get('accesible')==='1';
 $('#clinic-verified').checked=a.get('verificado')==='1';
 if(['name','zone','reference_asc','reference_desc'].includes(a.get('orden')))$('#clinic-sort').value=a.get('orden');
 if(state.interest){const id=state.interest;state.interest='';selectInterest(id);$('#procedure-select').value=id;}
 if([...a.keys()].some(x=>['q','zona','ingles','accesible','verificado','orden'].includes(x)))refresh();
 else{displayList();activePills();}
}
function galleryItem(p,first=false){
 return '<figure class="gallery-item">'+renderImg(p,first)+'<figcaption>Fotografía de referencia · '+esc(p.photographer||'Pexels')+'</figcaption></figure>';
}
function profile(c){
 root.classList.remove('is-directory');
 document.title=c.name+' | Odontología | Growa';
 state.current=c;
 const pic=imgData(c);
 const imgs=c.demo?[pic,photos.consultation,photos.profile]:[pic];
 root.innerHTML=crumbs(true)+
 '<div class="profile-head"><p class="market-location">ODONTOLOGÍA / MAZATLÁN</p><h1>'+esc(c.name)+'</h1><div class="profile-sub"><span>⌖ '+esc(c.zone)+', Sinaloa</span>'+status(c)+'</div></div>'+
 '<div class="profile-layout"><div class="profile-left"><div class="profile-gallery '+(imgs.length===1?'single':'')+'">'+imgs.filter(Boolean).map((p,i)=>galleryItem(p,i===0)).join('')+'</div>'+
 '<nav class="profile-nav"><a href="#perfil">Presentación</a><a href="#informacion">Información</a><a href="#tratamientos">Tratamientos</a><a href="#verificacion">Verificación</a></nav>'+
 '<section class="profile-section" id="perfil"><h2>Acerca del perfil</h2><p>'+esc(c.description)+'</p>'+
 '<p class="quiet">Ubicación registrada: '+esc(c.zone)+', Mazatlán, Sinaloa.</p></section>'+
 '<section class="profile-section" id="informacion"><h2>Información práctica</h2><div class="fact-grid">'+
 '<div><small>Idioma</small><strong>'+(c.english?'Atención en inglés declarada':'Por confirmar')+'</strong></div>'+
 '<div><small>Accesibilidad</small><strong>'+(c.accessible?'Declarada por el perfil':'Por confirmar')+'</strong></div>'+
 '<div><small>Consulta de referencia</small><strong>'+money(c.consultation_reference_mxn)+'</strong></div>'+
 '<div><small>Zona</small><strong>'+esc(c.zone)+'</strong></div></div></section>'+
 '<section class="profile-section" id="tratamientos"><h2>Procedimientos que puedes consultar</h2><p>La lista corresponde a categorías generales de odontología. No confirma que este prestador realice alguno de los siguientes procedimientos.</p>'+
 '<div class="procedure-text-list">'+state.treatments.map(t=>'<span>'+esc(t.name)+'</span>').join('')+'</div></section>'+
 '<section class="profile-section" id="verificacion"><h2>Verificación del perfil</h2><p>'+esc(c.notice)+'</p>'+
 '<dl class="verification-list"><dt>Reseñas verificadas</dt><dd>No disponibles</dd><dt>Certificaciones comprobadas</dt><dd>No publicadas</dd>'+
 '<dt>Precio de procedimientos</dt><dd>Requiere cotización individual</dd></dl></section>'+
 '<a class="return-link" href="/odontologia#clinicas">← Volver a todas las clínicas</a></div>'+
 '<aside class="profile-right"><div class="profile-contact"><p class="section-overline">SOLICITUD DE INFORMACIÓN</p>'+
 '<div class="consult-price"><small>Consulta de referencia</small><strong>'+money(c.consultation_reference_mxn)+'</strong><span>'+esc(c.price_label)+'</span></div>'+
 '<p>Este perfil todavía no permite confirmar precios ni citas en línea.</p>'+
 '<button class="action-primary" type="button" data-quote="'+esc(c.id)+'">Preparar solicitud</button>'+
 '<a class="action-secondary" href="/planificar?prestador='+esc(c.id)+'">Planificar estancia</a>'+
 '<small>Se generará un resumen en tu dispositivo. No se enviará información clínica.</small></div>'+
 '<div class="profile-help"><h3>Antes de viajar</h3><p>Solicita por escrito el plan, los materiales, el costo final y el seguimiento.</p></div></aside></div>';
}
function toggleCompare(id,checked){
 if(!state.all.find(c=>c.id===id))return;
 if(checked&&state.selected.size>=3&&!state.selected.has(id)){notify('Puedes comparar hasta tres perfiles.');syncCheckboxes();return}
 if(checked)state.selected.add(id);else state.selected.delete(id);
 updateCompareUI();
}
function syncCheckboxes(){ $$('[data-compare]').forEach(b=>b.checked=state.selected.has(b.dataset.compare))}
function updateCompareUI(){
 syncCheckboxes();
 const tray=$('#compare-tray');tray.hidden=state.selected.size===0;
 $('#compare-list').innerHTML=[...state.selected].map(id=>state.all.find(x=>x.id===id)).filter(Boolean).map(c=>'<span>'+esc(c.name)+'</span>').join('');
 $('#compare-show').disabled=state.selected.size<2;
}
function showComparison(){
 const selected=[...state.selected].map(id=>state.all.find(x=>x.id===id)).filter(Boolean);
 if(selected.length<2){notify('Selecciona al menos dos perfiles.');return}
 const section=$('#comparison');if(!section)return;
 const rows=[
 ['Zona',c=>c.zone],['Inglés declarado',c=>c.english?'Sí':'Por confirmar'],
 ['Accesibilidad declarada',c=>c.accessible?'Sí':'Por confirmar'],
 ['Consulta de referencia',c=>money(c.consultation_reference_mxn)],
 ['Precio de tratamiento',()=> 'Requiere cotización'],
 ['Verificación',c=>c.demo?'Ficha ficticia':c.verified?'Growa verificado':'Pendiente']
 ];
 section.hidden=false;section.innerHTML='<div class="minor-heading"><h2>Comparar perfiles</h2><button type="button" data-close-comparison>Cerrar ×</button></div>'+
 '<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Característica</th>'+
 selected.map(c=>'<th><a href="/odontologia/clinicas/'+esc(c.id)+'">'+esc(c.name)+'</a></th>').join('')+'</tr></thead>'+
 '<tbody>'+rows.map(([name,get])=>'<tr><th>'+esc(name)+'</th>'+selected.map(c=>'<td>'+esc(get(c))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 section.scrollIntoView({behavior:'smooth',block:'start'});
}
function openQuote(id=''){
 if(!state.all.length){notify('No hay perfiles disponibles.');return}
 state.returnFocus=document.activeElement;
 $('#quote-clinic').innerHTML=state.all.map(c=>field(c.id,c.name)).join('');
 if(state.all.some(c=>c.id===id))$('#quote-clinic').value=id;
 $('#quote-treatment').innerHTML=state.treatments.map(t=>field(t.id,t.name)).join('');
 if(state.interest)$('#quote-treatment').value=state.interest;
 $('#quote-error').textContent='';$('#quote-form').hidden=false;$('#quote-result').hidden=true;
 $('#quote-shell').hidden=false;$('#scrim').hidden=false;document.body.style.overflow='hidden';
 $('#quote-close').focus();
}
function closeQuote(){
 $('#quote-shell').hidden=true;$('#scrim').hidden=true;document.body.style.overflow='';
 state.returnFocus?.focus?.();
}
async function submitQuote(e){
 e.preventDefault();$('#quote-error').textContent='';$('#quote-submit').disabled=true;
 const p={clinic_id:$('#quote-clinic').value,treatment:$('#quote-treatment').value,
  travel_window:$('#quote-window').value,language:$('#quote-language').value,
  needs_hotel:$('#quote-hotel').checked,needs_transport:$('#quote-transport').checked};
 try{
  const r=await api('/api/dental/quote-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
  state.quote=r;$('#quote-form').hidden=true;$('#quote-result').hidden=false;
  $('#quote-result').innerHTML='<div class="preview-result"><span class="label label-demo">BORRADOR · NO ENVIADO</span>'+
  '<h3>Resumen preparado</h3><dl><dt>Clínica</dt><dd>'+esc(r.clinic_name)+'</dd><dt>Tratamiento de interés</dt><dd>'+esc(r.procedure)+'</dd>'+
  '<dt>Idioma</dt><dd>'+esc(r.language==='en'?'Inglés':'Español')+'</dd><dt>Hospedaje</dt><dd>'+(r.needs_hotel?'Sí':'No')+'</dd>'+
  '<dt>Transporte</dt><dd>'+(r.needs_transport?'Sí':'No')+'</dd></dl><p>Sin envío ni cotización clínica confirmada.</p>'+
  '<button type="button" class="action-primary" id="download-brief">Descargar resumen</button><button type="button" class="action-secondary" id="edit-brief">Editar</button></div>';
 }catch(err){$('#quote-error').textContent=err.message}
 finally{$('#quote-submit').disabled=false}
}
function download(){
 if(!state.quote)return;const r=state.quote;
 const content=['GROWA — RESUMEN DE ODONTOLOGÍA (NO ENVIADO)','Prestador: '+r.clinic_name,
  'Interés: '+r.procedure,'Idioma: '+r.language,'Viaje: '+r.travel_window,
  'Hospedaje: '+(r.needs_hotel?'Sí':'No'),'Transporte: '+(r.needs_transport?'Sí':'No'),
  '','Este resumen no confirma precios ni una cita. Verifica condiciones con el prestador.'].join('\n');
 const href=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=href;a.download='growa-odontologia-resumen.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),12000);
}
function setup(){
 const mobile=$('#mobile-nav-toggle'),navigation=$('#mobile-nav');
 mobile.onclick=()=>{navigation.hidden=!navigation.hidden;mobile.setAttribute('aria-expanded',String(!navigation.hidden));mobile.textContent=navigation.hidden?'☰':'×'};
 $('#quote-close').onclick=closeQuote;$('#scrim').onclick=closeQuote;$('#quote-form').onsubmit=submitQuote;
 $('#compare-close').onclick=()=>{$('#compare-tray').hidden=true};
 $('#compare-clear').onclick=()=>{state.selected.clear();updateCompareUI();const area=$('#comparison');if(area)area.hidden=true};
 $('#compare-show').onclick=showComparison;
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#quote-shell').hidden)closeQuote();else if(!navigation.hidden){navigation.hidden=true;mobile.setAttribute('aria-expanded','false');mobile.textContent='☰'}else if(state.filtersOpen){state.filtersOpen=false;$('#filters')?.classList.remove('open');const back=$('#filters-backdrop');if(back)back.hidden=true;$('#toggle-filters')?.setAttribute('aria-expanded','false');document.body.style.overflow='';$('#toggle-filters')?.focus()}}
  if(e.key==='Tab'&&!$('#quote-shell').hidden){
   const tabbable=$$('#quote-shell button:not([disabled]),#quote-shell select:not([disabled]),#quote-shell input:not([disabled])').filter(x=>!x.closest('[hidden]'));
   if(!tabbable.length)return;const first=tabbable[0],last=tabbable.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 document.addEventListener('error',e=>{const x=e.target;if(x?.tagName==='IMG'&&x.dataset.fallback!=='1'){x.dataset.fallback='1';x.src='/static/img/dental-fallback.svg'}},true);
 root.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el)return;
  if(el.dataset.procedure){selectInterest(el.dataset.procedure);$('#procedure-select').value=state.interest;return}
  if(el.hasAttribute('data-reset')){reset();return}
  if(el.hasAttribute('data-retry')){refresh();return}
  if(el.hasAttribute('data-quote')){openQuote(el.dataset.quote);return}
  if(el.hasAttribute('data-close-comparison')){$('#comparison').hidden=true;return}
  if(el.id==='toggle-filters'||el.id==='filters-backdrop'||el.hasAttribute('data-close-filters')){
    state.filtersOpen=el.id==='toggle-filters'?!state.filtersOpen:false;
    $('#filters')?.classList.toggle('open',state.filtersOpen);
    const toggle=$('#toggle-filters');if(toggle)toggle.setAttribute('aria-expanded',String(state.filtersOpen));
    const back=$('#filters-backdrop');if(back)back.hidden=!state.filtersOpen;
    document.body.style.overflow=state.filtersOpen?'hidden':'';
    if(!state.filtersOpen&&el.id!=='toggle-filters')toggle?.focus();
    return;
   }
 });
 root.addEventListener('change',e=>{
  const el=e.target;
  if(el.hasAttribute('data-compare')){toggleCompare(el.dataset.compare,el.checked);return}
  if(el.id==='procedure-select'){selectInterest(el.value,false);return}
  if(['clinic-zone','clinic-english','clinic-access','clinic-verified','clinic-sort'].includes(el.id))refresh();
 });
 root.addEventListener('input',e=>{
  if(e.target.id==='clinic-q'){clearTimeout(searchTimer);searchTimer=setTimeout(refresh,250)}
 });
 root.addEventListener('submit',e=>{
  if(e.target.id==='directory-search'){e.preventDefault();clearTimeout(searchTimer);refresh();$('#clinicas')?.scrollIntoView({behavior:'smooth'})}
 });
 $('#quote-shell').addEventListener('click',e=>{
  if(e.target.id==='download-brief')download();
  if(e.target.id==='edit-brief'){$('#quote-result').hidden=true;$('#quote-form').hidden=false}
 });
}
async function init(){
 setup();
 try{
  const [t,cls]=await Promise.all([api('/api/dental/treatments'),api('/api/dental/clinics')]);
  state.treatments=t.items||[];state.all=cls.items||[];state.visible=cls.items||[];state.zones=cls.zones||[];
  const interest=urlParams.get('tratamiento');if(state.treatments.some(x=>x.id===interest))state.interest=interest;
  const match=location.pathname.match(/^\/odontologia\/clinicas\/([a-f0-9]{32})\/?$/);
  if(match){
   const detail=await api('/api/dental/clinics/'+encodeURIComponent(match[1]));
   state.current=detail.clinic;if(!state.all.some(x=>x.id===state.current.id))state.all.push(state.current);
   profile(state.current);
  }else{renderHome();}
 }catch(e){root.innerHTML='<div class="page-error"><h1>No se puede abrir el directorio</h1><p>'+esc(e.message)+'</p><a href="/odontologia" class="action-primary">Reintentar</a></div>'}
}
init();
})();