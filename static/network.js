/* Neon-backed fictitious directory; only demo tables are exposed. */
(()=>{"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=new Date(), pad=n=>String(n).padStart(2,"0");
const iso=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join("-");
const state={data:null,user:null,doctor:"all",tab:"calendar",date:iso(today),month:new Date(today.getFullYear(),today.getMonth(),1),search:"",patient:null};
const fullDate=s=>new Date(s+"T12:00:00").toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
const monthName=d=>d.toLocaleDateString("es-MX",{month:"long",year:"numeric"});
const hours=s=>String(s).slice(11,16);
const initials=s=>shortName(s).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase();
const shortName=s=>String(s||"").replace(/\s*·\s*DEMO/gi,"").replace(/Paciente de prueba/i,"Paciente");
const canEdit=()=>["admin","coordinator"].includes(state.user?.role);
const doctors=()=>state.data?.doctors||[];
const patients=()=>state.data?.patients||[];
const visits=()=>state.data?.appointments||[];
const doctor=id=>doctors().find(x=>x.id===id);
const patient=id=>patients().find(x=>x.id===id);
const byDoctor=()=>patients().filter(p=>state.doctor==="all"||p.doctor_id===state.doctor);
const filteredVisits=()=>visits().filter(v=>state.doctor==="all"||v.doctor_id===state.doctor);
function notice(message){const el=$("#notice");el.textContent=message;el.hidden=false;setTimeout(()=>el.hidden=true,4600)}
async function api(path,method="GET",body){
 const headers={"Accept":"application/json"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 if(!["GET","HEAD"].includes(method)){let match=document.cookie.match(/(?:^|; )growa_csrf=([^;]*)/);headers["x-csrf-token"]=match?decodeURIComponent(match[1]):""}
 const r=await fetch(path,{method,body:body===undefined?undefined:JSON.stringify(body),headers,credentials:"same-origin",cache:"no-store"});
 let out={};try{out=await r.json()}catch{}
 if(!r.ok)throw Error(out.detail||"Error de conexión ("+r.status+")");
 return out;
}
async function load(){
 try{
  const results=await Promise.all([api("/api/demo-network"),api("/api/me").catch(()=>null)]);
  state.data=results[0];state.user=results[1];
  const future=visits().find(v=>v.starts_at.slice(0,10)>=state.date);
  if(future){state.date=future.starts_at.slice(0,10);let d=new Date(state.date+"T12:00:00");state.month=new Date(d.getFullYear(),d.getMonth(),1)}
  render();
 }catch(err){$("#workspace").innerHTML='<div class="empty-note">No fue posible consultar las tablas de prueba en Neon. '+esc(err.message)+'</div>';notice(err.message)}
}
async function reload(){
 const newData=await api("/api/demo-network");state.data=newData;render();
}
function render(){
 const d=state.data;if(!d)return;
 $("#count-doctors").textContent=d.doctors.length;
 $("#count-patients").textContent=d.patients.length;
 $("#count-visits").textContent=d.appointments.length;
 $("#new-appointment").hidden=!canEdit();
 $$(".tabs button").forEach(b=>{b.classList.toggle("active",b.dataset.tab===state.tab);b.setAttribute("aria-selected",String(b.dataset.tab===state.tab))});
 renderDoctors();renderBody();
}
function renderDoctors(){
 const available=doctors().filter(d=>(d.name+" "+d.specialty).toLowerCase().includes(state.search.toLowerCase()));
 let html='<button class="doctor-item '+(state.doctor==="all"?"active":"")+'" data-doctor="all"><span class="avatar">＋</span><span class="doctor-copy"><b>Toda la red</b><small>Directorio integrado</small></span><span class="doctor-count">'+doctors().length+'</span></button>';
 html+=available.map(d=>'<button class="doctor-item '+(d.id===state.doctor?"active":"")+'" data-doctor="'+esc(d.id)+'"><span class="avatar">'+esc(initials(d.name))+'</span><span class="doctor-copy"><b>'+esc(shortName(d.name))+'</b><small>'+esc(d.specialty)+'</small></span><span class="doctor-count">'+patients().filter(p=>p.doctor_id===d.id).length+'</span></button>').join("");
 $("#doctor-list").innerHTML=html;
}
function renderBody(){
 if(state.tab==="calendar")$("#workspace").innerHTML=renderCalendar();
 if(state.tab==="patients")$("#workspace").innerHTML=renderPatients();
 if(state.tab==="profile")$("#workspace").innerHTML=renderProfile();
}
function renderCalendar(){
 const date=state.month,year=date.getFullYear(),month=date.getMonth(),length=new Date(year,month+1,0).getDate(),offset=(new Date(year,month,1).getDay()+6)%7;
 const weeks=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
 const events=filteredVisits(),dayVisits=events.filter(v=>v.starts_at.slice(0,10)===state.date).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 let cal=weeks.map(w=>'<div class="weekday">'+w+'</div>').join("");
 for(let i=0;i<offset;i++)cal+='<div class="day empty" aria-hidden="true"></div>';
 for(let n=1;n<=length;n++){
  const key=iso(new Date(year,month,n)),items=events.filter(v=>v.starts_at.slice(0,10)===key);
  cal+='<button class="day '+(key===state.date?"selected":"")+'" data-day="'+key+'" aria-label="'+esc(fullDate(key))+', '+items.length+' citas">'+
  '<span class="date '+(key===iso(today)?"today":"")+'">'+n+'</span>'+
  items.slice(0,2).map(v=>'<span class="appointment-mark '+(v.status==="proposed"?"soft":"")+'">'+esc(hours(v.starts_at))+' · '+esc(shortName(patient(v.patient_id)?.name||"Paciente"))+'</span>').join("")+
  (items.length>2?'<span class="appointment-mark soft">+'+(items.length-2)+' más</span>':"")+'</button>';
 }
 while((offset+length)%7!==0){cal+='<div class="day empty" aria-hidden="true"></div>';offset++}
 const selectedTitle=state.doctor==="all"?"Agenda de la red":shortName(doctor(state.doctor)?.name);
 return '<div class="panel-title"><div><h2>'+esc(selectedTitle)+'</h2><p>Consultas organizadas por fecha · Horario local de Mazatlán</p></div><span class="status">INFORMACIÓN ILUSTRATIVA</span></div>'+
 '<div class="cal-head"><h3>'+esc(monthName(date))+'</h3><div class="cal-arrows"><button data-month="-1" aria-label="Mes anterior">←</button><button data-month="0" aria-label="Mes actual">Hoy</button><button data-month="1" aria-label="Mes siguiente">→</button></div></div>'+
 '<div class="cal-grid">'+cal+'</div><section class="day-agenda"><div class="agenda-head"><h3>'+esc(fullDate(state.date))+'</h3><span class="muted">'+dayVisits.length+' citas</span></div>'+
 (dayVisits.length?dayVisits.map(visitRow).join(""):'<p class="empty-note">Sin citas simuladas para este día. Selecciona otro día o profesional.</p>')+'</section>';
}
function visitRow(v){
 const name=patient(v.patient_id)?.name||"Paciente",doc=doctor(v.doctor_id)?.name||"Profesional";
 const label={confirmed:"Confirmada",proposed:"Por confirmar",cancelled:"Cancelada"}[v.status]||"En agenda";
 return '<article class="visit"><span class="visit-time">'+esc(hours(v.starts_at))+'</span><div class="visit-title">'+esc(shortName(name))+'<small>'+esc(shortName(doc))+' · '+esc(shortName(v.service))+'</small></div>'+
 '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="status '+esc(v.status)+'">'+label+'</span>'+
 (canEdit()&&v.status==="proposed"?'<button class="btn" data-change="'+esc(v.id)+'" data-status="confirmed">Confirmar</button>':'')+
 (canEdit()&&v.status!=="cancelled"?'<button class="btn" data-change="'+esc(v.id)+'" data-status="cancelled">Cancelar</button>':'')+'</div></article>';
}
function renderPatients(){
 const list=byDoctor(),special=state.patient?patient(state.patient):null;
 if(special&&list.some(x=>x.id===special.id)){
  const pv=visits().filter(v=>v.patient_id===special.id);
  return '<div class="panel-title"><div><h2>'+esc(shortName(special.name))+'</h2><p>Ficha de seguimiento · '+esc(special.id)+'</p></div><button class="btn" data-back-patients>← Volver al directorio</button></div>'+
  '<div class="profile-meta"><div><small>Profesional asignado</small><strong>'+esc(shortName(doctor(special.doctor_id)?.name||""))+'</strong></div><div><small>Idioma ilustrativo</small><strong>'+esc(special.languages)+'</strong></div><div><small>Procesos en agenda</small><strong>'+pv.length+'</strong></div></div>'+
  '<h3 style="font-size:13px">Historial de citas simuladas</h3>'+ (pv.length?pv.map(visitRow).join(""):'<p class="empty-note">Sin movimientos de prueba.</p>');
 }
 return '<div class="panel-title"><div><h2>Directorio de pacientes.</h2><p>'+list.length+' registros · '+(state.doctor==="all"?"todos los profesionales":"filtrados por médico asignado")+'</p></div><span class="status">AGENDA ADMINISTRATIVA</span></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Identificador</th><th>Paciente</th><th>Profesional asignado</th><th>Citas</th><th></th></tr></thead><tbody>'+
 list.map(p=>'<tr><td class="code">'+esc(p.id)+'</td><td><strong>'+esc(shortName(p.name))+'</strong></td><td>'+esc(shortName(doctor(p.doctor_id)?.name||"—"))+'</td><td>'+visits().filter(v=>v.patient_id===p.id).length+'</td><td><button class="btn" data-patient="'+esc(p.id)+'">Ver ficha →</button></td></tr>').join("")+
 '</tbody></table></div>';
}
function renderProfile(){
 if(state.doctor==="all"){
  return '<div class="panel-title"><div><h2>Perfiles profesionales.</h2><p>Selecciona un médico en el directorio para consultar su ficha y sus pacientes.</p></div></div>'+
  '<div class="table-wrap"><table><thead><tr><th>Profesional</th><th>Especialidad ilustrativa</th><th>Pacientes</th><th>Agenda</th></tr></thead><tbody>'+
  doctors().map(d=>'<tr><td><strong>'+esc(shortName(d.name))+'</strong><div class="code">'+esc(d.id)+'</div></td><td>'+esc(d.specialty)+'</td><td>'+patients().filter(p=>p.doctor_id===d.id).length+'</td><td><button class="btn" data-doctor="'+esc(d.id)+'">Abrir perfil →</button></td></tr>').join("")+'</tbody></table></div>';
 }
 const d=doctor(state.doctor),p=byDoctor(),a=filteredVisits().sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 if(!d)return '<p class="empty-note">Selecciona un profesional.</p>';
 return '<span class="kicker">PERFIL PROFESIONAL</span><div class="profile-hero"><span class="profile-monogram">'+esc(initials(d.name))+'</span><div><h2>'+esc(shortName(d.name))+'</h2><p>'+esc(d.specialty)+' · '+esc(shortName(d.clinic))+'</p><span class="status">PERFIL ILUSTRATIVO</span></div></div>'+
 '<div class="profile-meta"><div><small>Pacientes asignados</small><strong>'+p.length+'</strong></div><div><small>Citas programadas</small><strong>'+a.filter(v=>v.status!=="cancelled").length+'</strong></div><div><small>Idioma ilustrativo</small><strong>'+esc(d.languages)+'</strong></div></div>'+
 '<div class="panel-title"><div><h2>Próximas citas.</h2><p>Historial administrativo de ejemplo, sin información médica.</p></div><button class="btn" data-tab="patients">Ver pacientes →</button></div>'+
 (a.length?a.map(visitRow).join(""):'<p class="empty-note">Sin agenda registrada.</p>');
}
function renderForm(){
 const d=state.doctor==="all"?doctors()[0]:doctor(state.doctor);
 $("#appointment-doctor").innerHTML=doctors().map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d?.id?"selected":"")+'>'+esc(shortName(x.name))+'</option>').join("");
 renderFormPatients();
 $("#appointment-date").value=state.date+"T10:00";
}
function renderFormPatients(){
 const id=$("#appointment-doctor").value;
 $("#appointment-patient").innerHTML=patients().filter(p=>p.doctor_id===id).map(p=>'<option value="'+esc(p.id)+'">'+esc(shortName(p.name))+'</option>').join("");
}
document.addEventListener("click",async e=>{
 const t=e.target.closest("button");if(!t)return;
 if(t.dataset.doctor){state.doctor=t.dataset.doctor;state.patient=null;render();return}
 if(t.dataset.tab){state.tab=t.dataset.tab;state.patient=null;render();return}
 if(t.dataset.day){state.date=t.dataset.day;renderBody();return}
 if(t.dataset.month!==undefined){const m=Number(t.dataset.month);
  state.month=m===0?new Date(today.getFullYear(),today.getMonth(),1):new Date(state.month.getFullYear(),state.month.getMonth()+m,1);
  state.date=m===0?iso(today):iso(state.month);renderBody();return}
 if(t.dataset.patient){state.patient=t.dataset.patient;renderBody();return}
 if(t.hasAttribute("data-back-patients")){state.patient=null;renderBody();return}
 if(t.dataset.change){
  try{await api("/api/demo-network/appointments/"+encodeURIComponent(t.dataset.change),"PATCH",{status:t.dataset.status});await reload();notice("Agenda actualizada.")}catch(err){notice(err.message)}return
 }
});
$("#doctor-search").addEventListener("input",e=>{state.search=e.target.value;renderDoctors()});
$("#new-appointment").addEventListener("click",()=>{renderForm();$("#appointment-modal").hidden=false});
$("#appointment-close").addEventListener("click",()=>$("#appointment-modal").hidden=true);
$("#appointment-modal").addEventListener("click",e=>{if(e.target.id==="appointment-modal")e.target.hidden=true});
$("#appointment-doctor").addEventListener("change",renderFormPatients);
$("#appointment-form").addEventListener("submit",async e=>{
 e.preventDefault();const f=new FormData(e.target);
 const body={doctor_id:f.get("doctor_id"),patient_id:f.get("patient_id"),starts_at:f.get("starts_at"),duration_minutes:Number(f.get("duration_minutes")),service:f.get("service")};
 try{await api("/api/demo-network/appointments","POST",body);$("#appointment-modal").hidden=true;state.tab="calendar";state.doctor=body.doctor_id;state.date=body.starts_at.slice(0,10);let d=new Date(state.date+"T12:00:00");state.month=new Date(d.getFullYear(),d.getMonth(),1);await reload();notice("Cita registrada en el entorno de muestra.")}catch(err){notice(err.message)}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#appointment-modal").hidden=true});
load();
})();