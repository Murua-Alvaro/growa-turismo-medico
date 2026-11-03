/* Growa Explore — independent, resilient public directory.
   No dependency on SPA/app.js, auth, agenda, community, or medical workflows. */
(()=>{
 'use strict';
 const $=selector=>document.querySelector(selector);
 const $$=selector=>Array.from(document.querySelectorAll(selector));
 const types={all:'Todas las opciones',hotel:'Hospedaje',medico:'Servicios médicos',transporte:'Movilidad',negocio:'Comercio local'};
 const state={category:'all',catalog:[],map:null,markers:[],mapOpen:false,requestNo:0,all:[]};
 const money=value=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(value)||0);
 const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=value=>String(value??'');
 const query=new URLSearchParams(location.search);
 const categoryFromUrl=query.get('categoria');
 if(categoryFromUrl&&Object.hasOwn(types,categoryFromUrl))state.category=categoryFromUrl;
 let timer=null;
 function showCategories(){
  const entries=Object.entries(types);
  $('#category-pills').innerHTML=entries.map(([key,name])=>'<button type="button" data-cat="'+key+'" class="'+(state.category===key?'active':'')+'" aria-pressed="'+(state.category===key)+'"><span class="category-label">'+name+'</span><span class="category-arrow" aria-hidden="true">↗</span></button>').join('');
 }
 function params(){
  const p=new URLSearchParams({
   category:state.category,zone:$('#catalog-zone').value,
   max_price:$('#catalog-price').value,
   accessible:String($('#filter-access').checked),
   english:String($('#filter-english').checked),
   verified:String($('#filter-verified').checked)
  });
  const q=$('#catalog-q').value.trim();
  if(q)p.set('query',q);
  else p.set('q','');
  return {q,p};
 }
 function card(item){
  const category=types[item.category]||'Servicio';
  const subtitle=[item.accessible?'Accesible':'',item.english?'Atención en inglés':'',item.subtype||''].filter(Boolean);
  const tags=subtitle.map(value=>'<span>'+escapeHTML(value)+'</span>').join('');
  const photo=item.image_url?'<img src="'+escapeHTML(item.image_url)+'" loading="lazy" alt="Imagen ilustrativa de '+escapeHTML(category)+'">':'';
  const status=item.demo?'DEMOSTRACIÓN':item.verified?'VERIFICADO':'DECLARADO';
  const description=text(item.description).slice(0,160);
  return '<article class="listing-card"><div class="listing-image" role="button" tabindex="0" aria-label="Ver detalles de '+escapeHTML(item.name)+'" data-detail="'+escapeHTML(item.id)+'">'+photo+
   '<div class="listing-badges"><span>'+status+'</span></div></div>'+
   '<div class="listing-info"><div class="listing-zone"><span>'+escapeHTML(category)+'</span><span>'+escapeHTML(item.zone||'Mazatlán')+'</span></div>'+
   '<h3><button class="listing-name" type="button" data-detail="'+escapeHTML(item.id)+'">'+escapeHTML(item.name)+'</button></h3><p>'+escapeHTML(description)+'</p>'+
   '<div class="amenities">'+tags+'</div><div class="listing-bottom"><div><strong>'+money(item.price_mxn)+'</strong><small>'+(item.demo?'Precio ilustrativo':'Tarifa declarada, por confirmar')+'</small></div>'+
   '<button type="button" data-detail="'+escapeHTML(item.id)+'">Ver detalles ↗</button></div></div></article>';
 }
 function sortItems(items){
  const order=$('#catalog-sort').value;
  if(order==='default')return items;
  const copy=[...items];
  if(order==='price-asc')return copy.sort((a,b)=>Number(a.price_mxn||0)-Number(b.price_mxn||0));
  if(order==='price-desc')return copy.sort((a,b)=>Number(b.price_mxn||0)-Number(a.price_mxn||0));
  if(order==='name')return copy.sort((a,b)=>text(a.name).localeCompare(text(b.name),'es'));
  return copy;
 }
 function render(items,engine){
  state.catalog=sortItems(items);
  $('#results-title').textContent=state.category==='all'?'Opciones para tu estancia':types[state.category];
  $('#results-count').textContent=state.catalog.length+' resultados'+(engine==='contextual-local'?' · búsqueda contextual':'');
  const root=$('#results');
  root.innerHTML=state.catalog.length?state.catalog.map(card).join(''):
   '<div class="empty-state"><h3>No encontramos resultados</h3><p>Prueba otra búsqueda, categoría o zona.</p></div>';
  updateMapMarkers();
 }
 function renderError(reason){
  $('#results-count').textContent='No se pudo actualizar el directorio';
  $('#results').innerHTML='<div class="empty-state" role="alert"><h3>El directorio no está disponible.</h3><p>La página está funcionando, pero la consulta de servicios no respondió. Puedes volver a intentarlo.</p><button type="button" id="explore-retry">Volver a cargar ↗</button></div>';
  $('#explore-retry').addEventListener('click',search);
  console.warn('Growa Explore: catalog request unavailable',reason);
 }
 async function fetchJSON(url){
  const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('HTTP '+response.status+' al consultar '+url.split('?')[0]);
  return response.json();
 }
 async function search(){
  const seq=++state.requestNo;
  const {q,p}=params();
  $('#results-count').textContent='Buscando opciones…';
  try{
   const output=await fetchJSON((q?'/api/discover?':'/api/catalog?')+p.toString());
   if(seq!==state.requestNo)return;
   render(Array.isArray(output.items)?output.items:[],output.engine||'');
  }catch(error){if(seq===state.requestNo)renderError(error.message);}
 }
 function openDetail(id){
  const item=state.catalog.find(x=>String(x.id)===String(id));
  if(!item)return;
  const image=item.image_url?'<img class="standalone-detail-visual" src="'+escapeHTML(item.image_url)+'" alt="Imagen ilustrativa del servicio">':'';
  const tags=[item.subtype,item.zone,item.accessible?'Accesibilidad declarada':'',item.english?'Atención en inglés':''].filter(Boolean);
  const destination='/planificar'+(item.category==='medico'?'?prestador='+encodeURIComponent(item.id):'');
  $('#explore-detail-content').innerHTML=image+'<div class="standalone-detail-content"><span class="standalone-detail-heading">'+escapeHTML(types[item.category]||'SERVICIO')+' · '+(item.demo?'FICHA DE DEMOSTRACIÓN':item.verified?'VERIFICADO':'INFORMACIÓN DECLARADA')+'</span>'+
   '<h2>'+escapeHTML(item.name)+'</h2><p>'+escapeHTML(item.description||'Contacta al prestador para confirmar información y disponibilidad.')+'</p>'+
   '<ul>'+tags.map(tag=>'<li>'+escapeHTML(tag)+'</li>').join('')+'</ul>'+
   '<div class="standalone-detail-price"><div><strong>'+money(item.price_mxn)+'</strong><small>'+(item.demo?'Tarifa ilustrativa de demostración':'Tarifa orientativa, sujeta a confirmación')+'</small></div>'+
   '<a href="'+destination+'">Planificar estancia ↗</a></div></div>';
  $('#explore-detail-modal').hidden=false;
  document.body.style.overflow='hidden';
  $('#explore-detail-close').focus();
 }
 function closeDetail(){
  $('#explore-detail-modal').hidden=true;
  document.body.style.overflow='';
 }
 function reset(){
  state.category='all';showCategories();
  $('#catalog-q').value='';
  $('#catalog-zone').value='';
  $('#catalog-price').value='0';
  for(const id of ['filter-access','filter-english','filter-verified'])$('#'+id).checked=false;
  $('#catalog-sort').value='default';
  search();
 }
 function updateMapMarkers(){
  if(!state.map||!window.maplibregl)return;
  state.markers.forEach(marker=>marker.remove());state.markers=[];
  state.catalog.forEach(item=>{
   const latitude=Number(item.latitude),longitude=Number(item.longitude);
   if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return;
   const el=document.createElement('div');
   el.textContent=money(item.price_mxn);
   el.style.cssText='background:#0b4968;color:#fff;border:2px solid #fff;border-radius:3px;padding:8px 10px;font:700 10px DM Sans,Arial;box-shadow:0 2px 9px #102f4736';
   const popup=new maplibregl.Popup({offset:14}).setDOMContent((()=>{
    const node=document.createElement('div');
    const title=document.createElement('strong');title.textContent=text(item.name);
    const place=document.createElement('p');place.textContent=text(item.zone||'Mazatlán')+' · Ubicación orientativa';
    node.append(title,place);return node;
   })());
   state.markers.push(new maplibregl.Marker({element:el}).setLngLat([longitude,latitude]).setPopup(popup).addTo(state.map));
  });
 }
 async function toggleMap(){
  state.mapOpen=!state.mapOpen;
  $('#map-panel').hidden=!state.mapOpen;
  $('.explore-layout').classList.toggle('with-map',state.mapOpen);
  $('#toggle-map').innerHTML=state.mapOpen?'<span aria-hidden="true">⌖</span> Ocultar mapa':'<span aria-hidden="true">⌖</span> Ver mapa';
  $('#toggle-map').setAttribute('aria-pressed',String(state.mapOpen));
  if(!state.mapOpen)return;
  if(!window.maplibregl){
   try{
    await new Promise((resolve,reject)=>{
     const script=document.createElement('script');script.src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
     script.onload=resolve;script.onerror=()=>reject(new Error('No se puede cargar el proveedor de mapas'));
     document.head.appendChild(script);
    });
   }catch(error){$('#map').textContent='No se pudo cargar el mapa. El directorio sigue disponible en formato de lista.';return;}
  }
  if(!state.map){
   state.map=new maplibregl.Map({container:'map',style:'https://demotiles.maplibre.org/style.json',center:[-106.446,23.239],zoom:10.8});
   state.map.addControl(new maplibregl.NavigationControl(),'top-right');
   state.map.on('load',updateMapMarkers);
  }else{state.map.resize();updateMapMarkers();}
 }
 async function loadZones(){
  try{
   const zones=await fetchJSON('/api/zones');
   if(!Array.isArray(zones))return;
   const select=$('#catalog-zone');const previous=select.value;
   select.innerHTML='<option value="">Todas las zonas</option>'+zones.map(zone=>'<option value="'+escapeHTML(zone)+'">'+escapeHTML(zone)+'</option>').join('');
   select.value=previous;
  }catch(error){console.warn('Growa Explore: zones unavailable',error.message);}
 }
 function init(){
  showCategories();
  $('#category-pills').addEventListener('click',event=>{
   const target=event.target.closest('button[data-cat]');
   if(!target)return;state.category=target.dataset.cat;showCategories();search();
  });
  for(const id of ['catalog-zone','catalog-price','filter-access','filter-english','filter-verified','catalog-sort']){
   $('#'+id).addEventListener('change',search);
  }
  $('#catalog-q').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,300);});
  $('#clear-filters').addEventListener('click',reset);
  $('#toggle-map').addEventListener('click',toggleMap);
  $$('#view-explore [data-anchor]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.anchor)?.scrollIntoView({behavior:'smooth',block:'start'})));
  $$('#view-explore [data-go]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.go==='planner')location.assign('/planificar');}));
  $('#results').addEventListener('click',event=>{
   const target=event.target.closest('[data-detail]');
   if(target)openDetail(target.dataset.detail);
  });
  $('#results').addEventListener('keydown',event=>{
   const target=event.target.closest('[data-detail]');
   if(target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openDetail(target.dataset.detail);}
  });
  $('#explore-detail-close').addEventListener('click',closeDetail);
  $('#explore-detail-modal').addEventListener('click',event=>{if(event.target.id==='explore-detail-modal')closeDetail();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#explore-detail-modal').hidden)closeDetail();});
  loadZones();search();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
