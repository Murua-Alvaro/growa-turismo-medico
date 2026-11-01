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
 return '<article class="result" data-id="'+id+'">'+
 '<div class="result-cover"><a href="/odontologia/clinicas/'+id+'" aria-label="Ver ficha de '+esc(c.name)+'">'+renderImg(pic)+'</a>'+
 '<span class="cover-tag">'+(c.demo?'IMAGEN DE REFERENCIA':'FOTOGRAFÍA DE FICHA')+'</span>'+refImg(c)+'</div>'+
 '<div class="result-body"><div class="result-overline"><span>Odontología · '+esc(c.zone)+'</span>'+status(c)+'</div>'+
 '<h3><a href="/odontologia/clinicas/'+id+'">'+esc(c.name)+'</a></h3>'+
 '<p class="result-description">'+esc(c.description)+'</p>'+
 '<div class="result-attributes"><span><b>Ubicación</b>'+esc(c.zone)+', Mazatlán</span>'+
 '<span><b>Idioma</b>'+(c.english?'Inglés declarado':'Por confirmar')+'</span>'+
 '<span><b>Acceso</b>'+(c.accessible?'Accesibilidad declarada':'Por confirmar')+'</span></div>'+
 '<div class="result-foot"><label class="compare-choice"><input type="checkbox" data-compare="'+id+'" '+(selected?'checked':'')+'> Añadir a comparación</label>'+
 '<a href="/odontologia/clinicas/'+id+'">Ver ficha completa <span aria-hidden="true">↗</span></a></div></div>'+
 '<div class="result-action"><span class="result-action-kicker">Consulta de referencia</span>'+
 '<strong class="result-price">'+money(c.consultation_reference_mxn)+'</strong>'+
 '<small>'+(c.demo?'Importe ficticio · DEMO':esc(c.price_label))+'</small>'+
 '<div class="result-action-bottom"><button type="button" class="action-primary" data-quote="'+id+'">Preparar solicitud</button>'+
 '<a class="action-secondary" href="/odontologia/clinicas/'+id+'">Más información</a></div></div>'+
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
 const title=$('#selected-procedure');if(title)title.textContent=state.interest?'Interés: '+categoryName(state.interest):'Selecciona un tratamiento de interés';
 const p=$('#procedure-disclosure');if(p)p.hidden=!state.interest;
 const desc=$('#procedure-description');if(desc)desc.textContent=state.treatments.find(x=>x.id===state.interest)?.about||'';
 if($('#results-list'))updateAddress(query());
}
function renderHome(){
 document.title='Clínicas dentales en Mazatlán | Growa';
 const t=state.treatments,z=state.zones;
 root.innerHTML=crumbs()+
 '<section class="market-head"><div class="market-heading"><p class="market-location">MÉXICO / SINALOA / MAZATLÁN</p>'+
 '<h1>Clínicas dentales en Mazatlán</h1>'+
 '<p>Consulta perfiles, compara servicios declarados y organiza tu estancia.</p></div>'+
 '<div class="market-head-media">'+renderImg(photos.hero||{},true)+'<span>Fotografía ilustrativa · '+esc(photos.hero?.photographer||'Pexels')+'</span></div></section>'+
 '<form class="search-panel" id="directory-search" role="search"><div class="search-main"><label for="clinic-q">¿Qué clínica buscas?</label>'+
 '<input id="clinic-q" type="search" placeholder="Nombre, colonia o zona" autocomplete="off"></div>'+
 '<div class="search-procedure"><label for="procedure-select">Tratamiento de interés</label><select id="procedure-select"><option value="">Cualquier tratamiento</option>'+
 t.map(x=>field(x.id,x.name)).join('')+'</select></div>'+
 '<button type="submit" class="search-button">Buscar clínicas <span aria-hidden="true">→</span></button></form>'+
 '<div class="search-disclaimer"><span class="bullet-dot"></span><span>Directorio en demostración: los perfiles marcados DEMO son ficticios y los tratamientos deben confirmarse con cada prestador.</span></div>'+
 '<section class="procedures" id="tratamientos"><div class="minor-heading"><h2>Buscar por tratamiento</h2><span>Selección orientativa · No acredita disponibilidad</span></div>'+
 '<div class="procedure-row">'+t.map(x=>'<button type="button" class="procedure-item" data-procedure="'+esc(x.id)+'" aria-pressed="false">'+esc(x.name)+' <span>↗</span></button>').join('')+'</div>'+
 '<div id="procedure-disclosure" class="procedure-disclosure" hidden><strong id="selected-procedure"></strong><span id="procedure-description"></span><button type="button" data-quote="">Preparar consulta →</button></div></section>'+
 '<section class="market-results" id="clinicas"><div class="market-layout">'+
 '<aside class="filter-sidebar" id="filters" aria-label="Filtros"><div class="filter-title"><h2>Filtrar clínicas</h2><button type="button" data-reset>Limpiar</button></div>'+
 '<div class="filter-group"><label for="clinic-zone">Ubicación</label><select id="clinic-zone"><option value="">Todo Mazatlán</option>'+z.map(x=>field(x,x)).join('')+'</select></div>'+
 '<div class="filter-group"><span class="filter-label">Características</span><label class="filter-check"><input id="clinic-english" type="checkbox"> Atención en inglés</label>'+
 '<label class="filter-check"><input id="clinic-access" type="checkbox"> Accesibilidad</label></div>'+
 '<div class="filter-group"><span class="filter-label">Estado del perfil</span><label class="filter-check"><input id="clinic-verified" type="checkbox"> Solo verificados</label></div>'+
 '<div class="sidebar-explain">El catálogo muestra características declaradas. Una ficha de demostración no representa una clínica operativa.</div>'+
 '<a class="sidebar-link" href="/mazatlan">Conoce Mazatlán <span>↗</span></a></aside>'+
 '<div class="results-area"><div class="results-bar"><div><h2>Opciones disponibles</h2><p id="result-count" role="status"></p></div>'+
 '<div class="results-tools"><button type="button" class="mobile-filter" id="toggle-filters" aria-controls="filters" aria-expanded="false">Filtros</button>'+
 '<label for="clinic-sort">Ordenar por</label><select id="clinic-sort"><option value="name">Nombre</option><option value="zone">Zona</option><option value="reference_asc">Consulta: menor precio</option><option value="reference_desc">Consulta: mayor precio</option></select></div></div>'+
 '<div class="active-filters" id="active-filters" hidden></div>'+
 '<div class="result-list" id="results-list">'+state.visible.map(card).join('')+'</div>'+
 '<div class="listing-footer">Las cantidades mostradas, cuando existan, son referencias de consulta. No se publican precios de procedimientos sin cotizaciones verificadas.</div>'+
 '<section class="comparison-section" id="comparison" hidden></section></div></div></section>'+
 '<section class="information" id="informacion"><div><p class="section-overline">ANTES DE ELEGIR</p><h2>Información que conviene comprobar</h2></div>'+
 '<div class="information-grid"><article><strong>01</strong><h3>Profesionales y permisos</h3><p>Solicita cédula, especialidad cuando corresponda y documentación del establecimiento.</p></article>'+
 '<article><strong>02</strong><h3>Presupuesto completo</h3><p>Confirma materiales, número de visitas, costos adicionales y seguimiento por escrito.</p></article>'+
 '<article><strong>03</strong><h3>Organización del viaje</h3><p>Consulta tiempos de atención antes de contratar hospedaje o transporte.</p></article></div></section>'+
 '<section class="faq-section" id="preguntas"><div class="minor-heading"><h2>Preguntas frecuentes</h2></div>'+
 '<details><summary>¿Son precios de tratamientos dentales?</summary><p>No. Las cifras ilustrativas corresponden a consultas de referencia; el costo de tratamientos debe cotizarse directamente con el proveedor.</p></details>'+
 '<details><summary>¿Las clínicas están verificadas?</summary><p>Las fichas DEMO son ficticias. Los demás perfiles indican su estado de validación. No se muestran reseñas ni credenciales inventadas.</p></details>'+
 '<details><summary>¿Se envía una solicitud desde Growa?</summary><p>Por ahora se prepara un resumen descargable; no se envía a ninguna clínica.</p></details></section>';
 // Restore deep-linked filter state only if supplied in the URL.
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
  if(e.key==='Escape'){if(!$('#quote-shell').hidden)closeQuote();else if(!navigation.hidden){navigation.hidden=true;mobile.setAttribute('aria-expanded','false');mobile.textContent='☰'}}
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
  if(el.id==='toggle-filters'){
   state.filtersOpen=!state.filtersOpen;$('#filters').classList.toggle('open',state.filtersOpen);
   el.setAttribute('aria-expanded',String(state.filtersOpen));return;
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