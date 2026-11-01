/* Growa Community v0.7 — progressive enhancement for opt-in social features.
   All actions go through authenticated same-origin APIs. No direct PII displayed. */
'use strict';
(function(){
 const byId=id=>document.getElementById(id);
 const h=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[x]||'&#39;'));
 const c={tab:'directory',connections:[],members:[],active:null,registered:false};
 const notice=text=>msg(text);
 function requiresSession(){
  if(state.user)return false;
  showModal('login-modal');
  msg('Inicia sesión o crea una cuenta para participar.');
  return true;
 }
 function selectTab(tab){
  if(tab!=='directory'&&requiresSession())return;
  c.tab=tab;
  document.querySelectorAll('[data-community-tab]').forEach(b=>b.classList.toggle('active',b.dataset.communityTab===tab));
  document.querySelectorAll('.community-pane').forEach(el=>el.classList.toggle('active',el.id==='community-pane-'+tab));
  if(tab==='directory')loadMembers();
  if(tab==='profile')loadProfile();
  if(tab==='connections'||tab==='inbox')loadConnections(tab==='inbox');
 }
 function syncAuth(){
  const user=state.user;
  const join=byId('community-join');
  const mine=byId('community-myspace');
  if(join)join.textContent=user?'Editar mi perfil ↗':'Crear mi perfil ↗';
  if(mine)mine.textContent=user?'Mis conexiones':'Iniciar sesión';
  const admin=byId('community-admin-panel');
  if(admin)admin.hidden=!(user&&user.role==='admin');
 }
 async function onNavigate(){
  syncAuth();
  try{
   const status=await req('/api/community/status');
   const join=byId('community-join');
   if(join&&!state.user&&!status.signup_enabled){
    join.textContent='Registro temporalmente cerrado';
    join.disabled=true;
   }else if(join)join.disabled=false;
  }catch(e){/* Existing public directory remains available if status endpoint is offline. */}
  selectTab(c.tab);
 }
 async function register(event){
  event.preventDefault();
  const err=byId('join-error');err.textContent='';
  const payload={name:byId('join-name').value.trim(),email:byId('join-email').value.trim(),
    password:byId('join-password').value,age18:byId('join-adult').checked,terms:byId('join-terms').checked};
  try{
   const data=await req('/api/community/register',{method:'POST',body:JSON.stringify(payload)});
   state.user=data.account;
   byId('join-password').value='';
   hideModal('join-modal');
   setAccount();syncAuth();notice(data.notice);
   selectTab('profile');
  }catch(e){err.textContent=e.message;}
 }
 function tags(values){return (values||[]).slice(0,8).map(t=>'<span>'+h(t)+'</span>').join('');}
 async function loadMembers(){
  const el=byId('community-directory');
  if(!el)return;
  try{
   const p=new URLSearchParams({q:byId('community-q').value.trim(),kind:byId('community-kind').value});
   const data=await req('/api/community/members?'+p);
   c.members=data.items||[];
   if(!c.members.length){
    el.innerHTML='<div class="community-empty"><div class="community-empty-icon">✦</div><h3>Una comunidad que se construye contigo.</h3><p>Aún no hay perfiles publicados que coincidan. Solo mostramos personas que activan voluntariamente su visibilidad.</p><button class="btn dark" id="community-empty-join">Participar en la red</button></div>';
    byId('community-empty-join').onclick=()=>state.user?selectTab('profile'):showModal('join-modal');
    return;
   }
   el.innerHTML=c.members.map(item=>{
    const mine=state.user?.id===item.id;
    return '<article class="community-card"><div class="community-card-head"><div class="community-avatar" aria-hidden="true">'+h(item.name.slice(0,1).toUpperCase())+'</div><div><h3>'+h(item.name)+'</h3><small>'+h(item.role_label)+' · '+h(item.languages||'es')+'</small></div></div>'+
      '<p><strong>'+h(item.headline||'Me interesa conocer Mazatlán')+'</strong></p>'+
      '<p>'+h(item.bio||'Conectemos a través de intereses compartidos.')+'</p><div class="community-tags">'+tags(item.interests)+'</div>'+
      '<div class="community-card-actions"><button class="btn dark compact" data-connect="'+h(item.id)+'" '+(mine?'disabled':'')+'>'+(mine?'Mi perfil':'Solicitar conexión')+'</button><button class="simple-link" data-report="'+h(item.id)+'">Reportar</button></div></article>';
   }).join('');
   el.querySelectorAll('[data-connect]').forEach(button=>button.onclick=()=>connect(button.dataset.connect));
   el.querySelectorAll('[data-report]').forEach(button=>button.onclick=()=>report(button.dataset.report));
  }catch(e){el.innerHTML='<div class="community-empty"><h3>No fue posible cargar la red.</h3><p>'+h(e.message)+'</p></div>';}
 }
 async function loadProfile(){
  if(!state.user)return;
  try{
   const result=await req('/api/community/me'),p=result.profile;
   byId('cp-name').value=p?.name||state.user.name||'';
   byId('cp-headline').value=p?.headline||'';
   byId('cp-bio').value=p?.bio||'';
   byId('cp-kind').value=p?.kind||'visitor';
   byId('cp-languages').value=p?.languages||'es';
   byId('cp-discoverable').checked=Boolean(result.discoverable);
   document.querySelectorAll('#community-profile-form .interest-options input').forEach(x=>x.checked=(p?.interests||[]).includes(x.value));
  }catch(e){msg(e.message,true);}
 }
 async function saveProfile(event){
  event.preventDefault();
  if(requiresSession())return;
  const payload={display_name:byId('cp-name').value.trim(),
   headline:byId('cp-headline').value.trim(),bio:byId('cp-bio').value.trim(),
   profile_kind:byId('cp-kind').value,languages:byId('cp-languages').value.trim(),
   interests:[...document.querySelectorAll('#community-profile-form .interest-options input:checked')].map(x=>x.value),
   discoverable:byId('cp-discoverable').checked};
  try{
   await req('/api/community/me',{method:'PUT',body:JSON.stringify(payload)});
   notice(payload.discoverable?'Tu perfil ya aparece en el directorio público.':'Perfil actualizado y privado.');
   loadMembers();
  }catch(e){msg(e.message,true);}
 }
 async function connect(memberId){
  if(requiresSession())return;
  if(!confirm('¿Enviar una solicitud de conexión? Solo podrán enviarse mensajes cuando ambos acepten.'))return;
  try{const v=await req('/api/community/connect',{method:'POST',body:JSON.stringify({member_id:memberId})});notice(v.notice);}
  catch(e){msg(e.message,true);}
 }
 async function report(memberId){
  if(requiresSession())return;
  if(!confirm('¿Reportar este perfil por contenido inapropiado o privacidad?'))return;
  try{const v=await req('/api/community/report',{method:'POST',body:JSON.stringify({member_id:memberId,reason:'other'})});notice(v.notice);}
  catch(e){msg(e.message,true);}
 }
 async function loadConnections(inbox=false){
  if(!state.user)return;
  try{
   const res=await req('/api/community/connections');
   c.connections=res.items||[];
   if(inbox)renderInbox();
   else renderConnections();
  }catch(e){msg(e.message,true);}
 }
 function renderConnections(){
  const el=byId('community-connections');
  if(!c.connections.length){
   el.innerHTML='<div class="community-empty"><h3>Tus conexiones comienzan con una invitación.</h3><p>Explora la red y solicita contacto. Nadie puede enviarte mensajes sin aceptación mutua.</p><button id="community-find" class="btn dark">Descubrir personas</button></div>';
   byId('community-find').onclick=()=>selectTab('directory');
   return;
  }
  el.innerHTML=c.connections.map(item=>{
   const actions=[];
   if(item.status==='pending'&&!item.outgoing){
    actions.push('<button data-conn="'+h(item.id)+'" data-action="accept">Aceptar</button>');
    actions.push('<button data-conn="'+h(item.id)+'" data-action="reject" class="danger">Rechazar</button>');
   }
   if(item.status==='accepted'){
    actions.push('<button data-chat="'+h(item.id)+'">Conversar</button>');
    actions.push('<button data-conn="'+h(item.id)+'" data-action="block" class="danger">Bloquear</button>');
    actions.push('<button data-conn="'+h(item.id)+'" data-action="remove">Desconectar</button>');
   }
   return '<article class="connection-card"><div><strong>'+h(item.with_name)+'</strong><p>'+(item.status==='pending'?(item.outgoing?'Invitación enviada':'Invitación recibida'):h(item.status))+'</p></div><div class="connection-actions">'+actions.join('')+'</div></article>';
  }).join('');
  el.querySelectorAll('[data-conn]').forEach(b=>b.onclick=()=>changeConnection(b.dataset.conn,b.dataset.action));
  el.querySelectorAll('[data-chat]').forEach(b=>{b.onclick=()=>{c.active=b.dataset.chat;selectTab('inbox');};});
 }
 async function changeConnection(id,action){
  if(['block','remove','reject'].includes(action)&&!confirm('¿Confirmar la acción sobre esta conexión?'))return;
  try{await req('/api/community/connections/'+encodeURIComponent(id)+'/action',{method:'POST',body:JSON.stringify({action})});
   notice('Conexión actualizada.');loadConnections(c.tab==='inbox');
  }catch(e){msg(e.message,true);}
 }
 function renderInbox(){
  const people=c.connections.filter(x=>x.status==='accepted');
  const nav=byId('inbox-contacts');
  if(!people.length){
   nav.textContent='Aún no tienes conexiones aceptadas.';
   byId('inbox-messages').innerHTML='<div class="community-empty"><h3>Mensajes con consentimiento.</h3><p>Primero conecta con otra persona y espera su aceptación.</p></div>';
   byId('community-message-form').hidden=true;
   return;
  }
  nav.innerHTML=people.map(p=>'<button data-inbox="'+h(p.id)+'" class="'+(c.active===p.id?'active':'')+'">'+h(p.with_name)+'</button>').join('');
  nav.querySelectorAll('[data-inbox]').forEach(button=>button.onclick=()=>{c.active=button.dataset.inbox;renderInbox();});
  if(!c.active||!people.some(p=>p.id===c.active))c.active=people[0].id;
  nav.querySelectorAll('[data-inbox]').forEach(button=>button.classList.toggle('active',button.dataset.inbox===c.active));
  loadMessages();
 }
 async function loadMessages(){
  if(!c.active)return;
  const pane=byId('inbox-messages');
  try{
   const data=await req('/api/community/messages/'+encodeURIComponent(c.active));
   const messages=data.items||[];
   pane.innerHTML=messages.length?messages.map(m=>'<div class="inbox-bubble '+(m.mine?'mine':'')+'">'+h(m.body)+'<time>'+h(m.created_at.slice(0,16).replace('T',' · '))+'</time></div>').join(''):
    '<div class="community-empty"><h3>Tu conversación empieza aquí.</h3><p>Preséntate con respeto, sin compartir información clínica.</p></div>';
   byId('community-message-form').hidden=false;
   pane.scrollTop=pane.scrollHeight;
  }catch(e){pane.textContent=e.message;byId('community-message-form').hidden=true;}
 }
 async function sendMessage(event){
  event.preventDefault();
  if(!c.active||requiresSession())return;
  const input=byId('community-message-text'),body=input.value.trim();
  if(body.length<2)return;
  try{await req('/api/community/messages/'+encodeURIComponent(c.active),{method:'POST',body:JSON.stringify({message:body})});
   input.value='';loadMessages();
  }catch(e){msg(e.message,true);}
 }
 async function withdraw(){
  if(requiresSession())return;
  if(!confirm('¿Retirar tu perfil público y eliminar los mensajes que enviaste? La acción no puede deshacerse.'))return;
  try{const out=await req('/api/community/me/withdraw',{method:'POST'});
   c.active=null;
   notice(out.notice);
   selectTab('directory');
  }catch(e){msg(e.message,true);}
 }
 async function loadModeration(){
  if(state.user?.role!=='admin')return;
  const panel=byId('community-reports');
  try{
   const data=await req('/api/community/moderation/reports');
   const rows=data.items||[];
   panel.innerHTML=rows.length?rows.map(x=>'<article class="connection-card"><div><strong>Reporte '+h(x.reason)+'</strong><p>Perfil '+h(x.target_id.slice(0,10))+' · '+h(x.created_at.slice(0,10))+'</p></div><div class="connection-actions"><button data-hide-member="'+h(x.target_id)+'">Ocultar perfil</button></div></article>').join(''):
    '<div class="community-empty"><h3>Sin reportes recientes.</h3><p>No existen incidencias pendientes en esta vista.</p></div>';
   panel.querySelectorAll('[data-hide-member]').forEach(btn=>btn.onclick=()=>hideMember(btn.dataset.hideMember));
  }catch(e){panel.textContent=e.message;}
 }
 async function hideMember(id){
  if(!confirm('¿Ocultar el perfil señalado del directorio público?'))return;
  try{const result=await req('/api/community/moderation/hide/'+encodeURIComponent(id),{method:'POST'});
   notice(result.notice);loadModeration();loadMembers();
  }catch(e){msg(e.message,true);}
 }
 function init(){
  if(!byId('community-join'))return;
  byId('community-join').onclick=()=>state.user?selectTab('profile'):showModal('join-modal');
  byId('community-myspace').onclick=()=>state.user?selectTab('connections'):showModal('login-modal');
  byId('community-register-form').onsubmit=register;
  byId('community-profile-form').onsubmit=saveProfile;
  byId('community-message-form').onsubmit=sendMessage;
  byId('community-search').onclick=loadMembers;
  byId('community-q').onkeydown=e=>{if(e.key==='Enter')loadMembers();};
  byId('community-kind').onchange=loadMembers;
  byId('community-refresh').onclick=()=>loadConnections(false);
  byId('community-withdraw').onclick=withdraw;
  byId('community-audit').onclick=loadModeration;
  document.querySelectorAll('[data-community-tab]').forEach(btn=>btn.onclick=()=>selectTab(btn.dataset.communityTab));
  syncAuth();
 }
 window.GrowaCommunity={onNavigate,syncAuth};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
