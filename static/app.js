/* Growa Hospitality Platform 0.4 — zero framework; demo offers never represented as verified. */
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const state = {user:null, catalog:[], all:[], category:'all', plan:[], chosen:null, map:null, markers:[], mapVisible:false};
const TYPES = {all:'Todas las opciones',hotel:'Hospedaje',medico:'Servicios médicos',transporte:'Transporte privado',negocio:'Negocios cercanos'};
const STATUSES = {pending:'Pendiente',confirmed:'Confirmada',canceled:'Cancelada',rejected:'Rechazada',requires_review:'Revisión'};
const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n||0);
function safe(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function csrf(){const match=document.cookie.match(/(?:^|; )growa_csrf=([^;]*)/);return match?decodeURIComponent(match[1]):'';}
function msg(text,error=false){const el=$('#toast');el.textContent=text;el.className='toast show'+(error?' error':'');setTimeout(()=>el.className='toast',4300);}
function dateOffset(n){const t=new Date();t.setDate(t.getDate()+n);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mazatlan',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);}
async function req(path,opt={}){
 const headers=Object.assign({},opt.headers||{});
 if(opt.body)headers['Content-Type']='application/json';
 if(['POST','PUT','PATCH','DELETE'].includes(opt.method))headers['X-CSRF-Token']=csrf();
 let response;try{response=await fetch(path,Object.assign({credentials:'same-origin'},opt,{headers}));}catch(e){throw Error('No hay conexión con el servidor.');}
 const type=response.headers.get('content-type')||'';
 const data=type.includes('application/json')?await response.json():await response.text();
 if(!response.ok){let detail=data&&data.detail?data.detail:'Error de solicitud';throw Error(typeof detail==='string'?detail:JSON.stringify(detail));}
 return data;
}
let returnFocus=null;
function syncModalLock(){document.body.classList.toggle('modal-open',$('.modal-backdrop').some(el=>!el.hidden));}
function showModal(id){
 returnFocus=document.activeElement;
 $('#'+id).hidden=false;
 syncModalLock();
 $('#'+id+' .close-modal')?.focus();
}
function hideModal(id){
 $('#'+id).hidden=true;
 syncModalLock();
 if(!$('.modal-backdrop').some(el=>!el.hidden))returnFocus?.focus?.();
}
function canOperate(){return state.user && ['admin','coordinator'].includes(state.user.role);}
function go(view){
 if(['trips','partners'].includes(view) && !state.user){showModal('login-modal');msg('Inicia sesión para abrir coordinación.');return;}
 $$('.view').forEach(e=>e.classList.toggle('active',e.id==='view-'+view));
 $('[data-go]').forEach(e=>e.classList.toggle('selected',e.dataset.go===view));
 $('.nav-item').forEach(e=>{if(e.dataset.go===view)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
 window.scrollTo({top:0,behavior:'smooth'});
 if(view==='explore')searchCatalog();
 if(view==='trips')loadTrips();
 if(view==='partners')googleStatus();
}
function setAccount(){
 const button=$('#account-button');
 button.textContent=state.user?'Salir · '+state.user.name.split(' ')[0]:'Iniciar sesión';
 $$('.private').forEach(n=>n.hidden=!state.user);
}
function formatDate(value){return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00'));}
function label(listing){
 return '<span>'+safe(listing.category==='medico'?'Atención independiente':TYPES[listing.category])+'</span>'+(listing.demo?'<span>DEMO</span>':listing.verified?'<span>Verificado</span>':'<span>Por verificar</span>');
}
function listingCard(item){
 const badges=[];
 if(item.accessible)badges.push('<span>Accesible</span>');
 if(item.english)badges.push('<span>Inglés</span>');
 const photo=item.image_url?'<img loading="lazy" src="'+safe(item.image_url)+'" alt="Fotografía ilustrativa de '+safe(item.category)+'">':'';
 const desc=(item.description||'').slice(0,115);
 const action=item.category==='negocio'?'<button data-detail="'+safe(item.id)+'">Consultar</button>':'<button data-plan="'+safe(item.id)+'">Planificar ↗</button>';
 return '<article class="listing-card"><div class="listing-image" role="button" tabindex="0" data-detail="'+safe(item.id)+'">'+photo+
  '<div class="listing-badges">'+(item.demo?'<span>DEMOSTRACIÓN</span>':item.verified?'<span>VERIFICADO</span>':'<span>DECLARADO</span>')+'</div></div>'+
  '<div class="listing-info"><div class="listing-zone"><span>'+safe(TYPES[item.category])+'</span><span>◉ '+safe(item.zone)+'</span></div>'+
  '<h3><button class="listing-name" data-detail="'+safe(item.id)+'">'+safe(item.name)+'</button></h3><p>'+safe(desc)+'</p><div class="amenities">'+badges.join('')+
  '<span>'+safe(item.subtype||'Servicio')+'</span></div><div class="listing-bottom"><div><strong>'+money(item.price_mxn)+
  '</strong><small>'+(item.demo?'Precio ilustrativo':'Tarifa declarada, por confirmar')+'</small></div>'+action+'</div></div></article>';
}
function wireCards(root){
 root.querySelectorAll('[data-plan]').forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.plan,listing=state.all.find(x=>x.id===id);
  if(!listing)return;
  if(listing.category==='medico')$('#plan-medical').value=id;
  if(listing.category==='hotel')$('#plan-hotel').value=id;
  if(listing.category==='transporte')$('#plan-transport').value=id;
  go('planner');
 });
 root.querySelectorAll('[data-detail]').forEach(btn=>{
  btn.onclick=()=>openDetail(btn.dataset.detail);
  btn.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDetail(btn.dataset.detail);}};
 });
}
function openDetail(id){
 const x=state.all.find(item=>item.id===id);
 if(!x)return;
 const photo=x.image_url?'<img src="'+safe(x.image_url)+'" alt="Imagen ilustrativa de la ficha" loading="lazy">':'';
 const tags=[x.accessible?'Accesibilidad declarada':null,x.english?'Atención en inglés':null,
             x.verified?'Verificación documental':null].filter(Boolean).map(v=>'<span>'+safe(v)+'</span>').join('');
 const contact=x.contact_url&&!x.demo?'<a class="btn outline" href="'+safe(x.contact_url)+'" target="_blank" rel="noopener noreferrer">Visitar negocio ↗</a>':'';
 $('#detail-content').innerHTML='<div class="detail-gallery">'+photo+'<div class="detail-gallery-label">'+
   (x.demo?'FICHA DEMOSTRATIVA · IMAGEN ILUSTRATIVA':x.verified?'PROVEEDOR VERIFICADO':'INFORMACIÓN DECLARADA')+'</div></div>'+
   '<div class="detail-body"><span class="overline">'+safe(TYPES[x.category])+' · '+safe(x.zone)+'</span>'+
   '<h2>'+safe(x.name)+'</h2><p>'+safe(x.description)+'</p><div class="detail-tags">'+tags+'</div>'+
   '<div class="detail-pricing"><div><small>Precio de referencia</small><strong>'+money(x.price_mxn)+'</strong><em>'+
   (x.demo?'Importe sintético, no reservable externamente':'Sujeto a disponibilidad y confirmación del negocio')+'</em></div>'+
   '<div class="detail-actions">'+contact+(x.category!=='negocio'?'<button id="detail-plan" class="btn dark">Incluir en itinerario →</button>':'')+'</div></div></div>';
 const target=$('#detail-plan');
 if(target)target.onclick=()=>{hideModal('detail-modal');
   if(x.category==='medico')$('#plan-medical').value=x.id;
   if(x.category==='hotel')$('#plan-hotel').value=x.id;
   if(x.category==='transporte')$('#plan-transport').value=x.id;
   go('planner');};
 showModal('detail-modal');
}
function categories(){
 const types=[['all','Todas'],['hotel','Alojamiento'],['medico','Servicios médicos'],['transporte','Transporte'],['negocio','Negocios']];
 $('#category-pills').innerHTML=types.map(item=>'<button data-cat="'+item[0]+'" class="'+(state.category===item[0]?'active':'')+'">'+item[1]+'</button>').join('');
 $$('#category-pills [data-cat]').forEach(btn=>btn.onclick=()=>{state.category=btn.dataset.cat;categories();searchCatalog();});
}
async function loadAll(){
 const results=await Promise.all([req('/api/catalog'),req('/api/zones')]);
 state.all=results[0].items||[];
 const zoneOptions='<option value="">Todas las zonas</option>'+results[1].map(z=>'<option value="'+safe(z)+'">'+safe(z)+'</option>').join('');
 $('#catalog-zone').innerHTML=zoneOptions;
 $('#quick-zone').innerHTML='<option value="">Toda Mazatlán</option>'+results[1].map(z=>'<option value="'+safe(z)+'">'+safe(z)+'</option>').join('');
 fillProviders();
 const selected=[...state.all.filter(x=>x.category==='hotel').slice(0,2),...state.all.filter(x=>x.category==='medico').slice(0,1),...state.all.filter(x=>x.category==='transporte').slice(0,1)];
 $('#featured').innerHTML=selected.map(listingCard).join('');
 wireCards($('#featured'));
}
function fillProviders(){
 const opts=(kind)=>state.all.filter(x=>x.category===kind).map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+'</option>').join('');
 $('#plan-medical').innerHTML=opts('medico');
 $('#plan-hotel').innerHTML='<option value="">Recomendar automáticamente</option>'+opts('hotel');
 $('#plan-transport').innerHTML='<option value="">Recomendar automáticamente</option>'+opts('transporte');
 $('#slot-provider').innerHTML=opts('medico');
}
function sortCatalog(items){
 const mode=$('#catalog-sort')?.value||'default';
 if(mode==='default')return items;
 const rows=[...items];
 if(mode==='price-asc')return rows.sort((a,b)=>Number(a.price_mxn||0)-Number(b.price_mxn||0));
 if(mode==='price-desc')return rows.sort((a,b)=>Number(b.price_mxn||0)-Number(a.price_mxn||0));
 if(mode==='name')return rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es'));
 return rows;
}
async function searchCatalog(){
 const p=new URLSearchParams({category:state.category,q:$('#catalog-q').value||'',zone:$('#catalog-zone').value||'',
   max_price:$('#catalog-price').value||'0',accessible:$('#filter-access').checked?'true':'false',
   english:$('#filter-english').checked?'true':'false',verified:$('#filter-verified').checked?'true':'false'});
 try{
  const res=await req('/api/catalog?'+p);
  state.catalog=sortCatalog(res.items||[]);
  $('#results-title').textContent=state.category==='all'?'Opciones para tu estancia':TYPES[state.category];
  $('#results-count').textContent=state.catalog.length+' resultados encontrados';
  $('#results').innerHTML=state.catalog.length?state.catalog.map(listingCard).join(''):
   '<div class="empty-state">⌕<h3>Sin coincidencias</h3><p>Prueba otros filtros o una zona diferente.</p></div>';
  wireCards($('#results'));drawMap();
 }catch(e){msg(e.message,true);}
}
function quickSearch(){
 $('#catalog-q').value=$('#quick-q').value;
 $('#catalog-zone').value=$('#quick-zone').value;
 $('#catalog-price').value=$('#quick-price').value;
 state.category='all';categories();go('explore');
}
async function loadMap(){
 if(!state.mapVisible)return;
 if(window.maplibregl){if(!state.map){
  state.map=new maplibregl.Map({container:'map',style:'https://demotiles.maplibre.org/style.json',center:[-106.446,23.239],zoom:10.8});
  state.map.addControl(new maplibregl.NavigationControl(),'top-right');
  state.map.on('load',drawMap);
 }else{state.map.resize();drawMap();}return;}
 const script=document.createElement('script');script.src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
 script.onload=loadMap;script.onerror=()=>msg('No se pudieron cargar los mosaicos del mapa.',true);document.body.appendChild(script);
}
function drawMap(){
 if(!state.map||!window.maplibregl)return;
 state.markers.forEach(m=>m.remove());state.markers=[];
 for(const item of state.catalog){
  const dot=document.createElement('div');dot.style.cssText='background:#245345;color:white;border:2px solid white;border-radius:30px;padding:8px 10px;font:700 11px Arial;box-shadow:0 2px 10px #1233';
  dot.textContent=money(item.price_mxn);
  const popup=new maplibregl.Popup({offset:14}).setHTML('<strong>'+safe(item.name)+'</strong><br>'+safe(item.zone)+'<br>Tarifa orientativa');
  state.markers.push(new maplibregl.Marker({element:dot}).setLngLat([item.longitude,item.latitude]).setPopup(popup).addTo(state.map));
 }
}
function toggleMap(){
 state.mapVisible=!state.mapVisible;
 $('#map-panel').hidden=!state.mapVisible;
 $('.explore-layout').classList.toggle('with-map',state.mapVisible);
 $('#toggle-map').textContent=state.mapVisible?'◩ Ocultar mapa':'◩ Ver mapa';
 if(state.mapVisible)loadMap();
}
async function planning(e){
 e.preventDefault();
 const payload={
  medical_id:$('#plan-medical').value,day:$('#plan-day').value,
  hotel_id:$('#plan-hotel').value||null,transport_id:$('#plan-transport').value||null,
  nights:Number($('#plan-nights').value),preferred_hour:Number($('#plan-hour').value),
  max_budget:Number($('#plan-budget').value||0),accessible:$('#plan-access').checked
 };
 try{
  const data=await req('/api/plan',{method:'POST',body:JSON.stringify(payload)});
  state.plan=data.options||[];
  $('#planner-count').textContent=state.plan.length+' alternativas mostradas · '+data.total_feasible+' combinaciones viables.';
  $('#planner-results').innerHTML=state.plan.length?state.plan.map((o,i)=>{
   return '<article class="option"><div class="option-top"><strong>Alternativa '+String(i+1).padStart(2,'0')+'</strong><span class="availability">✓ Compatible</span></div>'+
    '<div class="option-details"><div class="route-stop"><span>01 · Consulta</span><strong>'+safe(o.medical)+'<br>'+safe(o.time)+'</strong></div>'+
    '<div class="route-stop"><span>02 · Hospedaje</span><strong>'+safe(o.hotel)+'<br>'+o.nights+' noches</strong></div>'+
    '<div class="route-stop"><span>03 · Transporte</span><strong>'+safe(o.transport)+'<br>'+o.distance_km+' km aprox.</strong></div></div>'+
    '<div class="option-foot"><div><b>'+money(o.price_mxn)+'</b><small>Total ilustrativo · requiere confirmación externa</small></div>'+
    '<button class="btn dark" data-book="'+i+'">Solicitar →</button></div></article>';
  }).join(''):'<div class="empty-state">◌<h3>No hay coincidencias</h3><p>Cambia la fecha, presupuesto o condiciones de accesibilidad.</p></div>';
  $$('#planner-results [data-book]').forEach(btn=>btn.onclick=()=>bookOption(Number(btn.dataset.book)));
 }catch(e){msg(e.message,true);}
}
function bookOption(i){
 if(!canOperate()){showModal('login-modal');msg('Las solicitudes son gestionadas por una cuenta de coordinación.');return;}
 state.chosen=state.plan[i];
 $('#reserve-summary').textContent=state.chosen.medical+' · '+state.chosen.hotel+' · '+state.chosen.transport+' · '+money(state.chosen.price_mxn);
 showModal('reserve-modal');
}
async function createBooking(e){
 e.preventDefault();if(!state.chosen)return;
 const payload={slot_id:state.chosen.slot_id,hotel_id:state.chosen.hotel_id,transport_id:state.chosen.transport_id,
  nights:state.chosen.nights,guests:Number($('#reserve-guests').value||1),
  guest_alias:$('#reserve-alias').value,idempotency_key:'gw-'+crypto.randomUUID()};
 try{
  const r=await req('/api/bookings',{method:'POST',body:JSON.stringify(payload)});
  hideModal('reserve-modal');msg('Solicitud creada. Referencia: '+r.id.slice(0,10));
  await loadTrips();go('trips');
 }catch(e){msg(e.message,true);}
}
function status(text){return '<span class="status '+safe(text)+'">'+safe(STATUSES[text]||text)+'</span>';}
function tripCard(b){
 const legs=b.legs.map(l=>'<div class="leg"><strong>'+safe(l.name)+'</strong><small>'+safe(l.kind)+' · '+safe(l.starts_at.replace('T',' ').slice(0,16))+'</small>'+
  status(l.status)+' '+(l.status==='pending'?'<div><button data-leg="'+safe(l.id)+'" data-action="confirmed">Confirmar</button><button data-leg="'+safe(l.id)+'" data-action="rejected">Rechazar</button></div>':'')+'</div>').join('');
 return '<article class="trip-card"><div class="trip-top"><div><small>ITINERARIO '+safe(b.id.slice(0,9))+'</small><h3>'+safe(b.guest_alias)+'</h3><p>'+formatDate(b.arrival_date)+' · '+b.nights+' noches</p></div><div>'+status(b.status)+'<div class="trip-price">'+money(b.price_mxn)+'</div></div></div>'+
  '<div class="trip-legs">'+legs+'</div><div class="trip-actions">'+
  (b.status==='confirmed'&&!b.calendar_synced?'<button class="btn dark" data-publish="'+safe(b.id)+'">Enviar a Google Calendar</button>':'')+
  (b.status!=='canceled'?'<button class="btn outline" data-cancel="'+safe(b.id)+'">Cancelar solicitud</button>':'')+'</div></article>';
}
async function loadTrips(){
 if(!state.user)return;
 try{
  const rows=await req('/api/bookings');
  $('#trip-list').innerHTML=rows.length?rows.map(tripCard).join(''):
   '<div class="empty-state">✦<h3>No hay solicitudes todavía.</h3><p>Comienza por crear una combinación desde Agenda.</p></div>';
  $$('[data-leg]').forEach(btn=>btn.onclick=()=>updateLeg(btn.dataset.leg,btn.dataset.action));
  $$('[data-cancel]').forEach(btn=>btn.onclick=()=>cancelBooking(btn.dataset.cancel));
  $$('[data-publish]').forEach(btn=>btn.onclick=()=>publishCalendar(btn.dataset.publish));
 }catch(e){msg(e.message,true);}
}
async function updateLeg(id,action){
 if(!confirm('¿Confirmar la acción sobre este componente?'))return;
 try{await req('/api/legs/'+id+'/'+action,{method:'PATCH'});await loadTrips();msg('Componente actualizado.');}catch(e){msg(e.message,true);}
}
async function cancelBooking(id){
 if(!confirm('¿Cancelar solicitud? No cancela reservas externas automáticamente.'))return;
 try{await req('/api/bookings/'+id+'/cancel',{method:'POST'});await loadTrips();msg('Solicitud cancelada localmente.');}catch(e){msg(e.message,true);}
}
async function providerCreate(e){
 e.preventDefault();const fd=new FormData(e.target);const payload=Object.fromEntries(fd.entries());
 payload.price_mxn=Number(payload.price_mxn||0);payload.capacity=Number(payload.capacity||1);
 payload.accessible=fd.has('accessible');payload.english=fd.has('english');
 try{const r=await req('/api/providers',{method:'POST',body:JSON.stringify(payload)});msg('Proveedor registrado: '+r.id.slice(0,10));e.target.reset();await loadAll();await searchCatalog();}catch(err){msg(err.message,true);}
}
async function slotsCreate(e){
 e.preventDefault();
 const payload={slot_date:$('#slot-day').value,times:$('#slot-times').value.split(',').map(x=>x.trim()).filter(Boolean)};
 try{const r=await req('/api/providers/'+$('#slot-provider').value+'/slots',{method:'POST',body:JSON.stringify(payload)});msg(r.count+' horarios cargados.');}catch(err){msg(err.message,true);}
}
async function googleStatus(){
 if(!state.user)return;
 try{const r=await req('/api/google/status');$('#google-status').textContent=r.connected?'Cuenta del coordinador autorizada.':r.configured?'Conexión configurada, pendiente de autorización.':'Falta configurar OAuth y cifrado del token.';$('#google-connect').disabled=!r.configured||r.connected;$('#google-disconnect').disabled=!r.connected;}catch(e){$('#google-status').textContent=e.message;}
}
async function googleConnect(){
 try{const r=await req('/api/google/connect',{method:'POST'});location.href=r.url;}catch(e){msg(e.message,true);}
}
async function googleDisconnect(){
 if(!confirm('¿Desconectar el calendario de coordinación?'))return;
 try{await req('/api/google/disconnect',{method:'POST'});msg('Calendario desvinculado.');googleStatus();}catch(e){msg(e.message,true);}
}
async function publishCalendar(id){
 try{await req('/api/bookings/'+id+'/google',{method:'POST'});msg('Itinerario publicado en Google Calendar.');loadTrips();}catch(e){msg(e.message,true);}
}
async function login(e){
 e.preventDefault();
 try{
  const user=await req('/api/login',{method:'POST',body:JSON.stringify({email:$('#login-email').value,password:$('#login-password').value})});
  state.user=user;hideModal('login-modal');setAccount();msg('Sesión iniciada.');$('#login-password').value='';
 }catch(err){$('#login-error').textContent=err.message;}
}
async function logout(){
 try{await req('/api/logout',{method:'POST'});}catch(e){}
 state.user=null;setAccount();go('home');msg('Sesión cerrada.');
}
async function account(){if(state.user){await logout();return;}showModal('login-modal');}
function bind(){
 $$('[data-go]').forEach(btn=>btn.onclick=()=>go(btn.dataset.go));
 $$('[data-category]').forEach(btn=>btn.onclick=()=>{state.category=btn.dataset.category;categories();go('explore');});
 $$('[data-close]').forEach(btn=>btn.onclick=()=>hideModal(btn.dataset.close));
 $('.modal-backdrop').forEach(m=>m.onclick=e=>{if(e.target===m)hideModal(m.id);});
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const visible=$('.modal-backdrop').find(el=>!el.hidden);
  if(visible)hideModal(visible.id);
 });
 $('#account-button').onclick=account;$('#login-form').onsubmit=login;
 $('#quick-submit').onclick=quickSearch;$('#quick-q').onkeydown=e=>{if(e.key==='Enter')quickSearch();};
 $('#clear-filters').onclick=()=>{state.category='all';$('#catalog-q').value='';$('#catalog-zone').value='';$('#catalog-price').value='0';['filter-access','filter-english','filter-verified'].forEach(id=>$('#'+id).checked=false);categories();searchCatalog();};
 ['catalog-zone','catalog-price','catalog-sort','filter-access','filter-english','filter-verified'].forEach(id=>$('#'+id).onchange=searchCatalog);
 let delay;$('#catalog-q').oninput=()=>{clearTimeout(delay);delay=setTimeout(searchCatalog,260);};
 $('#toggle-map').onclick=toggleMap;$('#plan-form').onsubmit=planning;$('#reserve-form').onsubmit=createBooking;
 $('#provider-form').onsubmit=providerCreate;$('#slots-form').onsubmit=slotsCreate;
 $('#google-connect').onclick=googleConnect;$('#google-disconnect').onclick=googleDisconnect;
 $('#plan-day').min=dateOffset(1);$('#plan-day').value=dateOffset(3);
 $('#slot-day').min=dateOffset(0);$('#slot-day').value=dateOffset(3);
 categories();setAccount();
}
async function startup(){
 bind();
 try{state.user=await req('/api/me');setAccount();}catch(e){}
 try{await loadAll();await searchCatalog();}catch(e){msg('No fue posible cargar el catálogo: '+e.message,true);}
 if(new URLSearchParams(location.search).has('calendar')){msg('Se recibió el retorno de Google Calendar.');history.replaceState(null,'',location.pathname);}
}
startup();
