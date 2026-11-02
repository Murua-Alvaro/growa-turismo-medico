/* Growa Journey — role-aware, non-clinical coordination workspace.
 * The API, not the UI, enforces access to patients and providers.
 * Demo mode is local, synthetic and cannot modify persistent data.
 */
(()=>{
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const escapeHTML=v=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const fmtDate=v=>v?new Date(v.length===10?v+"T12:00:00":v).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"}):"Sin fecha";
const fmtTime=v=>v?String(v).slice(11,16)+" h · Mazatlán":"Horario por confirmar";
const cap=v=>String(v||"").replace(/(^|\s)\S/g,x=>x.toUpperCase());
const inviteToken=decodeURIComponent((location.hash.match(/(?:^#|&)invite=([^&]+)/)||[])[1]||"");
const isDemo=["patient","doctor"].includes(new URLSearchParams(location.search).get("demo"));
const sampleDoctor=new URLSearchParams(location.search).get("demo")==="doctor";
const state={user:null,cases:[],caseId:null,detail:null,nav:"overview",providers:[],invite:inviteToken,inviteLink:"",showLogin:false,modal:null,filter:"",loading:false,demo:isDemo,caseOpen:false};
const icon={overview:"◫",tasks:"☑",appointments:"▦",messages:"✉",events:"◷",new:"＋"};
const stageIndex={"request":0,"review":1,"planning":2,"scheduled":3,"completed":4};
const stageLabels={"request":"Solicitud recibida","review":"Revisión administrativa","planning":"Organizando la visita","scheduled":"Cita confirmada","completed":"Proceso finalizado","cancelled":"Cancelado"};
const kinds={"general":"General","cita":"Citas","viaje":"Viaje","documentacion":"Documentación","presupuesto":"Presupuesto"};
let toastTimer=0;
function notify(message){const el=$("#notice");el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4900)}
function cookie(name){return document.cookie.split("; ").find(x=>x.startsWith(name+"="))?.slice(name.length+1)||""}
async function api(path,method="GET",data){
 const headers={"Accept":"application/json"}; if(data!==undefined)headers["Content-Type"]="application/json";
 if(!["GET","HEAD"].includes(method)&&!["/api/login","/api/journey/claim"].includes(path))headers["x-csrf-token"]=decodeURIComponent(cookie("growa_csrf"));
 const r=await fetch(path,{method,headers,credentials:"same-origin",cache:"no-store",body:data===undefined?undefined:JSON.stringify(data)});
 let out={};try{out=await r.json()}catch{}
 if(!r.ok)throw new Error(typeof out.detail==="string"?out.detail:"No se pudo completar la solicitud ("+r.status+").");
 return out;
}
const demoCase={id:"demo-case",patient_name:"Paciente de ejemplo",service_label:"Consulta odontológica de orientación",stage:"planning",stage_label:"Organizando la visita",provider:"Profesional de demostración",clinic:"Clínica ilustrativa · DEMO",tasks_done:2,tasks_total:5,claimed:true,created_at:"2026-11-01T10:00:00",updated_at:"2026-11-02T10:00:00"};
function fakeDetail(){
 return {case:demoCase,patient_email:null,can_manage:sampleDoctor,
  stages:Object.keys(stageIndex).map(code=>({code,label:stageLabels[code]})),
  tasks:[
   {id:"t1",title:"Revisar detalles de la visita",detail:"Comprueba las fechas y el lugar indicado.",kind:"general",assigned_to:"patient",completed:true,due_date:null},
   {id:"t2",title:"Confirmar idioma preferido",detail:"Indica si prefieres atención en español o inglés.",kind:"general",assigned_to:"patient",completed:true,due_date:null},
   {id:"t3",title:"Confirmar horario propuesto",detail:"El equipo debe confirmar antes de organizar el traslado.",kind:"cita",assigned_to:"provider",completed:false,due_date:"2026-11-07"},
   {id:"t4",title:"Organizar transporte local",detail:"Acordar punto de encuentro y condiciones de traslado.",kind:"viaje",assigned_to:"patient",completed:false,due_date:"2026-11-10"},
   {id:"t5",title:"Revisar presupuesto administrativo",detail:"Verificar conceptos y condiciones de cancelación.",kind:"presupuesto",assigned_to:"provider",completed:false,due_date:null}
  ],
  appointments:[{id:"a1",starts_at:"2026-11-11T11:00:00",duration_minutes:45,mode:"presencial",state:"proposed"}],
  messages:[
   {id:"m1",sender:"Equipo de demostración",self:sampleDoctor,category:"general",text:"Bienvenido. Aquí podrás dar seguimiento a tus preparativos, pendientes y horarios.",created_at:"2026-11-01T12:30:00"},
   {id:"m2",sender:"Paciente de ejemplo",self:!sampleDoctor,category:"viaje",text:"Gracias. ¿Puedo solicitar ayuda para organizar el transporte desde mi alojamiento?",created_at:"2026-11-02T09:00:00"}
  ],
  events:[{label:"Planificación de la visita iniciada",created_at:"2026-11-02T10:00:00",by:"Equipo de demostración"},{label:"Solicitud administrativa registrada",created_at:"2026-11-01T10:00:00",by:"Equipo de demostración"}],
  notice:"Demostración ficticia. No envíes información médica."
 };
}
function demoStart(){state.user={id:"demo",name:sampleDoctor?"Doctora de ejemplo":"Visitante de ejemplo",role:sampleDoctor?"provider":"patient",email:"ejemplo@demo.invalid"};state.cases=[demoCase];state.caseId="demo-case";state.detail=fakeDetail();state.caseOpen=true;}
function isManager(){return state.user&&["admin","coordinator","provider"].includes(state.user.role)}
function isAdmin(){return state.user&&["admin","coordinator"].includes(state.user.role)}
function displayRole(){return isAdmin()?"Coordinación":state.user?.role==="provider"?"Equipo de clínica":"Espacio del paciente"}
function initials(v){return (v||"G").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
async function refresh(){
 if(state.demo){render();return}
 state.loading=true;
 try{
  const data=await api("/api/journey/cases");state.cases=data.items||[];
  if(isAdmin()){try{state.providers=await api("/api/journey/providers")}catch{state.providers=[]}}
  if(state.caseId&&!state.cases.find(c=>c.id===state.caseId)){state.caseId=null;state.detail=null;state.caseOpen=false}
  if(!state.caseId&&state.cases.length===1){state.caseId=state.cases[0].id;if(!isManager())state.caseOpen=true;}
  if(state.caseId)state.detail=await api("/api/journey/cases/"+encodeURIComponent(state.caseId));
 }finally{state.loading=false}
 render();
}
async function boot(){
 if(state.demo){demoStart();render();return}
 try{state.user=await api("/api/me")}catch{state.user=null}
 if(state.user&&!state.invite){try{await refresh()}catch(err){notify(err.message);render()}}else render();
}
function auth(){
 const invite=!!state.invite;
 $("#app").innerHTML='<div class="auth-scene"><section class="auth-story"><span class="eyebrow">GROWA / MEDICAL JOURNEY</span>'+
 '<h1>Tu visita, <em>paso a paso.</em></h1>'+
 '<p>Un espacio sencillo para coordinar consultas, confirmar citas, revisar pendientes y comunicarte con el equipo encargado de tu visita a Mazatlán.</p>'+
 '<div class="auth-steps"><span>01 · Tu solicitud</span><span>02 · Tus pendientes</span><span>03 · Tu cita</span><span>04 · Seguimiento</span></div>'+
 '<div class="warning" style="margin-top:28px">El portal organiza trámites y comunicaciones logísticas. No sustituye una consulta médica ni almacena expedientes clínicos.</div></section>'+
 '<section class="auth-panel"><span class="eyebrow">'+(invite?'INVITACIÓN PERSONAL':'ACCESO PRIVADO')+'</span>'+
 '<h2>'+(invite&&!state.showLogin?'Activa tu espacio':"Entra a tu cuenta")+'</h2>'+
 '<p>'+(invite&&!state.showLogin?'Tienes una invitación privada para consultar tu proceso. Usa el mismo correo al que fue dirigida.':'Consulta tus casos y coordina los siguientes pasos con seguridad.')+'</p>'+
 (invite&&!state.showLogin?
 '<form class="form-stack" id="register-form"><label class="field">Correo de la invitación<input name="email" type="email" required maxlength="180" autocomplete="email"></label>'+
 '<label class="field">Tu nombre<input name="name" minlength="2" maxlength="140" required autocomplete="name"></label>'+
 '<label class="field">Crea una contraseña segura<input name="password" type="password" minlength="14" maxlength="200" required autocomplete="new-password"></label>'+
 '<label style="display:flex;gap:10px;align-items:start;font-size:11px;line-height:1.6;color:#687985"><input type="checkbox" name="accept_terms" required style="margin-top:4px"> Entiendo que esta versión es un piloto de coordinación administrativa y no compartiré diagnósticos ni archivos clínicos.</label><button class="btn primary" type="submit">Activar acceso →</button><button type="button" class="link-btn" data-action="toggle-login">¿Ya tienes cuenta? Inicia sesión</button></form>':
 '<form class="form-stack" id="login-form"><label class="field">Correo electrónico<input name="email" type="email" required autocomplete="username"></label>'+
 '<label class="field">Contraseña<input name="password" type="password" required autocomplete="current-password"></label>'+
 '<button class="btn primary" type="submit">Acceder a mi espacio →</button>'+
 (invite?'<button class="link-btn" data-action="toggle-login" type="button">Crear cuenta con mi invitación</button>':'')+'</form>')+
 '<div class="warning" style="margin-top:22px">¿Solo quieres conocer la interfaz? <a href="/mi-proceso?demo=patient" style="text-decoration:underline">Ver experiencia del paciente</a> · <a href="/panel-medico?demo=doctor" style="text-decoration:underline">Ver experiencia del médico</a>. Datos ficticios.</div></section></div>';
}
function acceptance(){
 $("#app").innerHTML='<div class="auth-scene"><section class="auth-story"><span class="eyebrow">INVITACIÓN PRIVADA</span><h1>Tu espacio está <em>listo.</em></h1><p>La invitación se vinculará a la cuenta con la que has iniciado sesión, siempre que coincida el correo electrónico.</p></section>'+
 '<section class="auth-panel"><span class="eyebrow">CONFIRMACIÓN</span><h2>Aceptar invitación</h2><p>Cuenta actual: <strong>'+escapeHTML(state.user.email)+'</strong></p><div class="form-stack"><button class="btn primary" data-action="accept-invite">Vincular proceso →</button><button class="btn" data-action="logout">Cambiar de cuenta</button></div></section></div>';
}
function sideNav(){
 const tabs=[["overview","Resumen"],["tasks","Pendientes"],["appointments","Mis citas"],["messages","Mensajes"],["events","Actividad"]];
 if(isAdmin())tabs.push(["new","Nuevo proceso"]);
 return '<aside class="sidebar"><div class="sidebar-header"><span class="eyebrow">GROWA JOURNEY</span><strong>'+escapeHTML(displayRole())+'</strong><small>Gestión de visitas · Mazatlán</small></div>'+
 '<nav class="sidebar-nav" aria-label="Navegación del espacio">'+tabs.map(([id,name])=>'<button type="button" class="'+(state.nav===id?'active':'')+'" data-nav="'+id+'"><span aria-hidden="true">'+icon[id]+'</span>'+name+'</button>').join('')+'</nav>'+
 '<div class="sidebar-bottom"><div class="identity"><strong>'+escapeHTML(state.user.name)+'</strong><small>'+escapeHTML(state.user.email)+'</small></div><button class="btn" data-action="logout">Cerrar sesión</button></div></aside>';
}
function shell(body){
 const banner=state.demo?'<div class="demo-banner"><span>VISTA DE DEMOSTRACIÓN · Todos los datos son ficticios. Nada se guarda en Neon.</span><a href="/mi-proceso" style="text-decoration:underline">Salir de la demo</a></div>':'';
 $("#app").innerHTML='<div class="workspace">'+sideNav()+'<main class="main-workspace" id="main-content">'+banner+body+'</main></div>'+
 '<div id="modal-root">'+(state.modal||"")+'</div>';
}
function summaryCards(){
 const cases=state.cases,active=cases.filter(c=>c.stage!=="completed"&&c.stage!=="cancelled").length;
 const done=cases.reduce((x,c)=>x+c.tasks_done,0),total=cases.reduce((x,c)=>x+c.tasks_total,0);
 return '<div class="metrics">'+[
  ["Procesos activos",active,"Seguimiento en curso"],["Casos registrados",cases.length,"Solo casos autorizados"],
  ["Pendientes resueltos",done+" / "+total,"Tareas administrativas"],
  ["Por confirmar",cases.filter(c=>c.stage==="request"||c.stage==="review").length,"Solicitudes iniciales"]
 ].map(([label,n,sub])=>'<div class="metric"><span>'+label+'</span><strong>'+n+'</strong><small>'+sub+'</small></div>').join("")+'</div>';
}
function caseRows(){
 const data=state.cases.filter(c=>(c.patient_name+" "+c.clinic+" "+c.service_label).toLowerCase().includes(state.filter.toLowerCase()));
 if(!data.length)return '<div class="empty">Todavía no hay procesos para mostrar. '+(isAdmin()?'Crea uno desde «Nuevo proceso» para invitar a un paciente.':'Cuando te asignen uno, aparecerá en este espacio.')+'</div>';
 return '<div class="case-list">'+data.map(c=>'<button class="case-row" data-open-case="'+escapeHTML(c.id)+'"><span class="avatar">'+escapeHTML(initials(c.patient_name))+'</span>'+
 '<span><strong>'+escapeHTML(isManager()?c.patient_name:c.service_label)+'</strong><small>'+escapeHTML(c.clinic)+' · '+escapeHTML(c.service_label)+'</small></span>'+
 '<span class="tag '+(c.stage==="cancelled"?"gray":c.stage==="request"?"amber":"")+'">'+escapeHTML(c.stage_label)+'</span></button>').join("")+'</div>';
}
function overview(){
 const greeting=isManager()?"Panel de seguimiento":"Tu proceso, en orden";
 return '<header class="page-head"><div><span class="eyebrow">'+escapeHTML(displayRole()).toUpperCase()+'</span><h1>'+greeting+'.</h1><p>'+(isManager()?'Coordina los casos y atiende los pendientes de cada visita.':'Consulta lo que sigue y mantén comunicación con tu equipo.')+'</p></div>'+
 '<div class="head-actions">'+(isAdmin()?'<button class="btn primary" data-nav="new">＋ Crear proceso</button>':'')+'<button class="btn" data-action="refresh">↻ Actualizar</button></div></header>'+
 summaryCards()+
 '<section class="panel"><div class="panel-head"><div><h2>'+ (isManager()?'Procesos asignados':'Mis procesos')+'</h2><p class="sub">Selecciona un proceso para abrir su seguimiento completo.</p></div>'+
 (isManager()?'<div class="search"><input id="case-search" placeholder="Buscar paciente o servicio..." aria-label="Buscar procesos" value="'+escapeHTML(state.filter)+'"></div>':'')+'</div>'+caseRows()+'</section>';
}
function taskRows(tasks,short=false){
 const arr=short?tasks.slice(0,4):tasks;
 if(!arr.length)return '<div class="empty">No hay pendientes. El equipo los añadirá cuando sean necesarios.</div>';
 return '<div class="task-list">'+arr.map(t=>'<label class="task-row '+(t.completed?'done':'')+'"><input type="checkbox" data-task="'+escapeHTML(t.id)+'" '+(t.completed?'checked':'')+' '+(state.demo?'disabled title="Solo demostración"':!state.detail.can_manage&&t.assigned_to!=="patient"?'disabled':'')+' aria-label="Marcar pendiente: '+escapeHTML(t.title)+'"><span>'+
 '<strong>'+escapeHTML(t.title)+'</strong><p>'+escapeHTML(t.detail||"")+'</p><small>'+escapeHTML(kinds[t.kind]||"General")+' · '+(t.assigned_to==="patient"?"Paciente":"Equipo")+(t.due_date?' · Límite '+fmtDate(t.due_date):'')+'</small></span></label>').join("")+'</div>';
}
function appointmentRows(items){
 if(!items.length)return '<div class="empty">No hay propuestas de cita todavía. Un horario solo se considera confirmado cuando lo valida el proveedor.</div>';
 return '<div class="appointment-list">'+items.map(a=>'<div class="appt"><div><strong>'+escapeHTML(fmtDate(a.starts_at))+' · '+escapeHTML(fmtTime(a.starts_at))+'</strong><small>'+escapeHTML(a.mode==="videollamada"?"Videollamada":"Consulta presencial")+' · '+a.duration_minutes+' min · '+(a.state==="proposed"?"Pendiente de confirmar":a.state==="confirmed"?"Confirmada":"Cancelada")+'</small></div>'+
 '<div class="head-actions"><span class="tag '+(a.state==="proposed"?"amber":a.state==="cancelled"?"gray":"")+'">'+(a.state==="confirmed"?"Confirmada":a.state==="proposed"?"Propuesta":"Cancelada")+'</span>'+
 (state.detail.can_manage&&a.state==="proposed"?'<button class="btn mini" data-appointment="'+escapeHTML(a.id)+'" data-state="confirmed" '+(state.demo?'disabled':'')+'>Confirmar</button><button class="btn mini danger" data-appointment="'+escapeHTML(a.id)+'" data-state="cancelled" '+(state.demo?'disabled':'')+'>Cancelar</button>':'')+'</div></div>').join("")+'</div>';
}
function feed(items){
 if(!items.length)return '<div class="empty">Aquí se registrarán los cambios del proceso.</div>';
 return '<div class="activity-list">'+items.map(e=>'<div class="feed-item"><strong>'+escapeHTML(e.label)+'</strong><small>'+escapeHTML(fmtDate(e.created_at))+' · '+escapeHTML(e.by)+'</small></div>').join("")+'</div>';
}
function statusRail(c){
 const idx=stageIndex[c.stage]??0;
 return '<div class="progress-box"><div class="panel-head"><div><h2>Tu recorrido</h2><p>Seguimiento administrativo de la solicitud y sus etapas.</p></div><span class="tag">'+escapeHTML(c.stage_label)+'</span></div>'+
 '<div class="progress-track">'+Object.keys(stageIndex).map((code,i)=>'<div class="progress-step '+(i<idx?'done':i===idx?'current':'')+'"><b>0'+(i+1)+'</b>'+escapeHTML(stageLabels[code])+'</div>').join("")+'</div></div>';
}
function detailView(){
 const d=state.detail,c=d.case;
 const stageNext={"request":"review","review":"planning","planning":"scheduled","scheduled":"completed"};
 const next=stageNext[c.stage];
 const actionButtons='<div class="head-actions">'+
 (d.can_manage&&next?'<button class="btn primary" data-action="advance" '+(state.demo?'disabled':'')+'>Avanzar etapa →</button>':'')+
 (d.can_manage&&c.stage!=="completed"&&c.stage!=="cancelled"?'<button class="btn" data-action="new-task">＋ Pendiente</button>':'')+
 (isAdmin()&&!c.claimed?'<button class="btn" data-action="reissue" '+(state.demo?'disabled':'')+'>Nueva invitación</button>':'')+
 '<button class="btn" data-action="print">Imprimir resumen</button></div>';
 let content="";
 if(state.nav==="tasks"){
  content='<div class="panel"><div class="panel-head"><div><h2>Pendientes administrativos</h2><p class="sub">Acciones, responsables y fechas de referencia; sin archivos clínicos.</p></div><span class="section-count">'+d.tasks.filter(x=>x.completed).length+' de '+d.tasks.length+' resueltos</span></div>'+taskRows(d.tasks)+
  (d.can_manage?'<div style="margin-top:18px"><button class="btn primary" data-action="new-task" '+(state.demo?'disabled':'')+'>＋ Añadir pendiente</button></div>':'')+'</div>';
 }else if(state.nav==="appointments"){
  content='<section class="panel"><div class="panel-head"><div><h2>Citas y propuestas</h2><p class="sub">Horario local de Mazatlán. Una propuesta no es una cita confirmada.</p></div>'+
  (d.can_manage?'<button class="btn primary" data-action="new-appointment" '+(state.demo?'disabled':'')+'>＋ Proponer cita</button>':'')+'</div>'+appointmentRows(d.appointments)+'</section>';
 }else if(state.nav==="messages"){
  content='<section class="panel"><div class="panel-head"><div><h2>Consultas administrativas</h2><p class="sub">Conversación privada entre el paciente y su equipo autorizado.</p></div><span class="tag gray">'+d.messages.length+' mensajes</span></div>'+
  '<div class="message-list" id="conversation">'+(d.messages.length?d.messages.map(m=>'<article class="message '+(m.self?'mine':'')+'"><small>'+escapeHTML(m.sender)+' · '+escapeHTML(kinds[m.category]||"General")+' · '+fmtDate(m.created_at)+'</small><p>'+escapeHTML(m.text)+'</p></article>').join(""):'<div class="empty">Aún no hay consultas.</div>')+'</div>'+
  '<form class="message-form" id="message-form"><textarea name="text" maxlength="700" minlength="2" required placeholder="Ej. ¿Podemos revisar el horario o las opciones de traslado?" '+(state.demo?'disabled':'')+'></textarea>'+
  '<div class="actions"><select name="category" aria-label="Categoría del mensaje"><option value="general">General</option><option value="cita">Citas</option><option value="viaje">Viaje</option><option value="documentacion">Documentación administrativa</option><option value="presupuesto">Presupuesto</option></select><button class="btn primary" type="submit" '+(state.demo?'disabled':'')+'>Enviar mensaje →</button></div></form>'+
  '<p class="note">No compartas diagnósticos, imágenes médicas, estudios, resultados ni información sensible. Para dudas médicas, consulta directamente a tu profesional.</p></section>';
 }else if(state.nav==="events"){
  content='<section class="panel"><div class="panel-head"><div><h2>Historial de actividad</h2><p class="sub">Registro transparente de cambios en tu proceso.</p></div></div>'+feed(d.events)+'</section>';
 }else{
  content=statusRail(c)+'<div class="split"><section class="panel"><div class="panel-head"><div><h2>Siguientes pasos</h2><p class="sub">Una lista clara de lo que corresponde a cada persona.</p></div><button class="btn mini" data-nav="tasks">Ver todos →</button></div>'+taskRows(d.tasks,true)+'</section>'+
  '<section class="panel"><div class="panel-head"><div><h2>Próximas citas</h2><p class="sub">Fechas compartidas por el equipo.</p></div><button class="btn mini" data-nav="appointments">Ver agenda →</button></div>'+appointmentRows(d.appointments.slice(0,2))+'</section></div>'+
  '<div class="split"><section class="panel"><div class="panel-head"><div><h2>Actividad reciente</h2><p class="sub">Lo último que ha ocurrido.</p></div><button class="btn mini" data-nav="events">Ver historial →</button></div>'+feed(d.events.slice(0,5))+'</section>'+
  '<section class="panel"><div class="panel-head"><div><h2>¿Necesitas ayuda?</h2><p class="sub">El equipo puede ayudarte con horarios, documentos administrativos y logística.</p></div></div>'+
  '<div class="warning">La coordinación por este portal no implica confirmación médica ni reserva con un proveedor externo.</div><button style="margin-top:18px" class="btn primary" data-nav="messages">Escribir al equipo →</button></section></div>';
 }
 return '<div class="breadcrumb"><button data-action="back">Todos los procesos</button><span>/</span>'+escapeHTML(c.service_label)+'</div>'+
 '<header class="page-head"><div class="detail-title"><span class="avatar">'+escapeHTML(initials(c.patient_name))+'</span><div><span class="eyebrow">PROCESO #'+escapeHTML(c.id.slice(0,8).toUpperCase())+'</span>'+
 '<h1>'+escapeHTML(d.can_manage?c.patient_name:"Mi visita a Mazatlán")+'</h1><p class="detail-sub">'+escapeHTML(c.service_label)+' · '+escapeHTML(c.clinic)+'<br>Profesional asignado: '+escapeHTML(c.provider)+'</p></div></div>'+actionButtons+'</header>'+
 (c.stage==="cancelled"?'<div class="warning" style="margin-bottom:18px">Este proceso fue cancelado. Su historial permanece visible.</div>':'')+content;
}
function createForm(){
 const opts=state.providers.length?state.providers.map(p=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+' · '+escapeHTML(p.provider)+'</option>').join(""):'<option value="">No hay proveedores reales con cuenta asignada</option>';
 return '<header class="page-head"><div><span class="eyebrow">COORDINACIÓN · ALTAS</span><h1>Nuevo proceso.</h1><p>Registra una solicitud administrativa e invita al paciente a su espacio privado.</p></div></header>'+
 '<section class="panel" style="max-width:850px"><div class="panel-head"><div><h2>Información para coordinar la visita</h2><p class="sub">Solo datos necesarios para contacto y logística. No introduzcas motivos clínicos ni diagnósticos.</p></div></div>'+
 '<form id="create-form" class="form-grid">'+
 '<label class="field">Nombre del paciente<input name="patient_name" minlength="2" maxlength="140" autocomplete="off" required></label>'+
 '<label class="field">Correo electrónico<input name="patient_email" type="email" maxlength="180" autocomplete="off" required></label>'+
 '<label class="field full">Clínica / prestador asignado<select name="listing_id" required>'+opts+'</select></label>'+
 '<label class="field">Servicio administrativo<input name="service_label" maxlength="110" minlength="3" placeholder="Ej. Primera consulta odontológica" required></label>'+
 '<label class="field">Idioma de preferencia<select name="preferred_language"><option value="es">Español</option><option value="en">Inglés</option></select></label>'+
 '<div class="full warning">Se crea una invitación válida durante siete días. El enlace da acceso a activar una cuenta, pero el paciente deberá verificar que utiliza el correo correcto. Compártelo por un canal privado.</div>'+
 '<div class="full"><button class="btn primary" type="submit" '+(!state.providers.length||state.demo?'disabled':'')+'>Crear e invitar →</button></div></form></section>';
}
function render(){
 if(!state.user){auth();return}
 if(state.invite&&!state.demo){acceptance();return}
 if(state.nav==="new"&&isAdmin()){shell(createForm());return}
 let body;
 if(state.detail&&state.caseId&&state.caseOpen)body=detailView();
 else body=overview();
 shell(body);
 if(state.nav==="messages"){const feed=$("#conversation");if(feed)feed.scrollTop=feed.scrollHeight}
}
async function openCase(id,nav="overview"){
 state.caseId=id;state.nav=nav;state.caseOpen=true;
 if(state.demo){state.detail=fakeDetail();render();return}
 state.detail=await api("/api/journey/cases/"+encodeURIComponent(id));render();
}
function popup(title,inner,formId){
 state.modal='<div class="modal-backdrop" role="presentation" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="popup-title"><div class="modal-header"><span class="eyebrow">GROWA JOURNEY</span><button class="close" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div><h2 id="popup-title">'+title+'</h2><form id="'+formId+'" class="form-stack">'+inner+'</form></div></div>';
 render();
}
function newTask(){
 popup("Añadir un pendiente",'<p>Asigna tareas de documentación administrativa, agenda o viaje.</p>'+
 '<label class="field">Título<input name="title" maxlength="120" minlength="3" required placeholder="Ej. Confirmar traslado"></label>'+
 '<label class="field">Detalles (sin datos clínicos)<textarea name="detail" maxlength="320" rows="3"></textarea></label>'+
 '<div class="form-grid"><label class="field">Categoría<select name="kind"><option value="general">General</option><option value="cita">Cita</option><option value="documentacion">Documentación</option><option value="viaje">Viaje</option><option value="presupuesto">Presupuesto</option></select></label>'+
 '<label class="field">Responsable<select name="assigned_to"><option value="patient">Paciente</option><option value="provider">Equipo de clínica</option></select></label></div>'+
 '<label class="field">Fecha límite opcional<input name="due_date" type="date"></label><div class="modal-actions"><button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Guardar pendiente</button></div>','task-form');
}
function newAppointment(){
 popup("Proponer una cita",'<p>Los horarios se guardan como propuestas hasta que el proveedor los confirme explícitamente. Hora de Mazatlán.</p>'+
 '<label class="field">Fecha y hora local<input name="starts_at" type="datetime-local" required></label>'+
 '<div class="form-grid"><label class="field">Modalidad<select name="mode"><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option></select></label>'+
 '<label class="field">Duración aproximada<select name="duration_minutes"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60" selected>60 minutos</option><option value="90">90 minutos</option></select></label></div>'+
 '<div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Crear propuesta</button></div>','appointment-form');
}
function invitationPopup(){
 popup("Enlace privado creado",'<p>La solicitud quedó registrada. Copia el enlace para compartirlo directamente con el paciente; no se envía de forma automática.</p>'+
 '<div class="invite-link" id="generated-link">'+escapeHTML(state.inviteLink)+'</div>'+
 '<div class="modal-actions"><button type="button" class="btn" data-action="copy-invite">Copiar enlace</button><button type="button" class="btn primary" data-action="close-modal">Cerrar</button></div>','invitation-form');
}
async function reloadDetail(){
 if(state.demo){render();return}
 state.detail=await api("/api/journey/cases/"+encodeURIComponent(state.caseId));
 const cases=await api("/api/journey/cases");state.cases=cases.items;render();
}
document.addEventListener("click",async e=>{
 const nav=e.target.closest("[data-nav]");const opener=e.target.closest("[data-open-case]");
 if(nav){
  state.nav=nav.dataset.nav;
  if(state.nav==="overview"){state.caseId=null;state.detail=null;state.caseOpen=false}
  if(!state.caseId&&state.cases.length)try{await openCase(state.cases[0].id,state.nav)}catch(err){notify(err.message)}
  render();return;
 }
 if(opener){try{await openCase(opener.dataset.openCase)}catch(err){notify(err.message)}return}
 const appt=e.target.closest("[data-appointment]");if(appt){
  if(state.demo){notify("Esta es una demostración sin cambios guardados.");return}
  if(!confirm("¿Confirmas que deseas "+(appt.dataset.state==="confirmed"?"confirmar":"cancelar")+" esta propuesta?"))return;
  try{await api("/api/journey/cases/"+state.caseId+"/appointments/"+appt.dataset.appointment,"PATCH",{state:appt.dataset.state});await reloadDetail();notify("Cita actualizada.")}catch(err){notify(err.message)}
  return;
 }
 const act=e.target.closest("[data-action]");if(!act)return;
 const action=act.dataset.action;
 if(action==="close-modal"){if(e.target.closest(".modal")&&e.target!==act)return;state.modal=null;render();return}
 if(action==="toggle-login"){state.showLogin=!state.showLogin;render();return}
 if(action==="back"){state.caseId=null;state.detail=null;state.caseOpen=false;state.nav="overview";render();return}
 if(action==="new-task"){if(state.demo)return notify("En modo demo no se guardan cambios.");newTask();return}
 if(action==="new-appointment"){if(state.demo)return notify("En modo demo no se guardan cambios.");newAppointment();return}
 if(action==="print"){window.print();return}
 if(action==="reissue"){
  if(state.demo)return notify("No disponible en demostración.");
  if(!confirm("Se invalidará la invitación anterior. ¿Generar una nueva?"))return;
  try{const r=await api("/api/journey/cases/"+state.caseId+"/reissue","POST",{reason:"Reenvío administrativo solicitado"});state.inviteLink=r.invitation_url;invitationPopup()}catch(err){notify(err.message)}return;
 }
 if(action==="copy-invite"){
  try{await navigator.clipboard.writeText(state.inviteLink);notify("Enlace copiado.")}catch{notify("Selecciona el enlace y cópialo manualmente.")}return;
 }
 if(action==="refresh"){try{await refresh();notify("Información actualizada.")}catch(err){notify(err.message)}return}
 if(action==="advance"){
  if(state.demo)return notify("En modo demo no se guardan cambios.");
  const next={"request":"review","review":"planning","planning":"scheduled","scheduled":"completed"}[state.detail.case.stage];
  if(!next||!confirm("¿Avanzar el proceso a «"+stageLabels[next]+"»?"))return;
  try{await api("/api/journey/cases/"+state.caseId+"/stage","PATCH",{stage:next});await reloadDetail();notify("Etapa actualizada.")}catch(err){notify(err.message)}return;
 }
 if(action==="accept-invite"){
  try{await api("/api/journey/claim-existing","POST",{token:state.invite});state.invite="";history.replaceState(null,"",location.pathname);await refresh();notify("Invitación aceptada.")}catch(err){notify(err.message)}return;
 }
 if(action==="logout"){
  if(state.demo){location.href="/mi-proceso";return}
  try{await api("/api/logout","POST",{})}catch(err){notify(err.message)}
  state.user=null;state.cases=[];state.caseId=null;state.detail=null;state.caseOpen=false;state.nav="overview";render();return;
 }
});
document.addEventListener("input",e=>{
 if(e.target.id==="case-search"){state.filter=e.target.value;const list=$(".case-list");if(list){const temp=document.createElement("div");temp.innerHTML=caseRows();list.replaceWith(temp.firstElementChild)}}
});
document.addEventListener("change",async e=>{
 const t=e.target.closest("[data-task]");if(!t||state.demo)return;
 const done=t.checked;
 try{await api("/api/journey/cases/"+state.caseId+"/tasks/"+t.dataset.task,"PATCH",{completed:done});await reloadDetail();notify(done?"Pendiente completado.":"Pendiente reabierto.")}catch(err){t.checked=!done;notify(err.message)}
});
document.addEventListener("submit",async e=>{
 const form=e.target;
 if(!["login-form","register-form","create-form","task-form","appointment-form","message-form"].includes(form.id))return;
 e.preventDefault();
 if(state.demo)return notify("Modo de demostración: nada se guarda.");
 const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.dataset.old=button.textContent;button.textContent="Procesando…"}
 const fields=new FormData(form),v=name=>String(fields.get(name)||"").trim();
 try{
  if(form.id==="login-form"){
   state.user=await api("/api/login","POST",{email:v("email"),password:v("password")});
   if(!state.invite)await refresh();else render();
  }else if(form.id==="register-form"){
   await api("/api/journey/claim","POST",{token:state.invite,email:v("email"),name:v("name"),password:v("password"),accept_terms:fields.get("accept_terms")==="on"});
   state.invite="";history.replaceState(null,"",location.pathname);
   state.user=await api("/api/me");await refresh();notify("Tu espacio ha sido activado.");
  }else if(form.id==="create-form"){
   const out=await api("/api/journey/cases","POST",{patient_name:v("patient_name"),patient_email:v("patient_email"),listing_id:v("listing_id"),service_label:v("service_label"),preferred_language:v("preferred_language")});
   state.inviteLink=out.invitation_url;state.caseId=out.case.id;state.caseOpen=true;state.nav="overview";await refresh();invitationPopup();
  }else if(form.id==="task-form"){
   await api("/api/journey/cases/"+state.caseId+"/tasks","POST",{title:v("title"),detail:v("detail"),kind:v("kind"),assigned_to:v("assigned_to"),due_date:v("due_date")||null});
   state.modal=null;await reloadDetail();notify("Pendiente registrado.");
  }else if(form.id==="appointment-form"){
   await api("/api/journey/cases/"+state.caseId+"/appointments","POST",{starts_at:v("starts_at"),mode:v("mode"),duration_minutes:Number(v("duration_minutes"))});
   state.modal=null;await reloadDetail();notify("Propuesta de cita creada.");
  }else if(form.id==="message-form"){
   await api("/api/journey/cases/"+state.caseId+"/messages","POST",{text:v("text"),category:v("category")});
   await reloadDetail();notify("Mensaje enviado.");
  }
 }catch(err){notify(err.message);if(button){button.disabled=false;button.textContent=button.dataset.old}}
});
boot();
})();