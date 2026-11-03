/* Growa interactive walkthrough. Reads synthetic Neon records; local-only writes for visitors. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean = value => String(value || "").replace(/\s*[·—-]\s*DEMO/gi,"").replace(/\s*Paciente de prueba/gi,"Paciente");
const initials = text => clean(text).replace(/^(Dra?\.?\s*)/i,"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase();
const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const atLocal = day => new Date(day+"T12:00:00");
const dayFormat = day => atLocal(day).toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
const shortDate = day => atLocal(day).toLocaleDateString("es-MX",{day:"2-digit",month:"short"});
const safeKey = "growa-journey-showcase-v1";
const hours = ["09:00","10:00","11:00","12:00","14:00","15:00","16:00"];
const today = iso(new Date());
const upperLimit = new Date();upperLimit.setDate(upperLimit.getDate()+180);
const fallbackDocs=[
 ["Dra. Sofía Beltrán","Odontología general"],["Dr. Andrés Robles","Implantología"],["Dra. Mariana Córdova","Ortodoncia"],["Dr. Daniel Peralta","Endodoncia"],["Dra. Valeria Ríos","Odontología estética"],["Dr. Nicolás Fuentes","Periodoncia"],["Dra. Lucía Ibarra","Rehabilitación oral"],["Dr. Emiliano Varela","Cirugía oral"],["Dra. Renata Salcedo","Odontopediatría"],["Dr. Mateo Luján","Prostodoncia"]
];
const fallback = () => ({
 doctors:fallbackDocs.map((x,i)=>({id:"DR"+String(i+1).padStart(3,"0"),name:x[0],specialty:x[1],city:"Mazatlán",languages:i%3===0?"Español":"Español, Inglés",clinic:"Centro odontológico ilustrativo"})),
 patients:Array.from({length:40},(_,i)=>({id:"PT"+String(i+1).padStart(3,"0"),kind:"patient",name:"Paciente "+String(i+1).padStart(2,"0"),doctor_id:"DR"+String(Math.floor(i/4)+1).padStart(3,"0"),languages:"Español"})),
 appointments:[],demo:true
});
const fromStorage=()=>{try{let rows=JSON.parse(localStorage.getItem(safeKey)||"[]");return Array.isArray(rows)?rows.filter(v=>v&&typeof v.id==="string"&&/^local-/.test(v.id)&&/^DR\d{3}$/.test(v.doctor_id)&&/^PT\d{3}$/.test(v.patient_id)&&typeof v.starts_at==="string"&&v.starts_at.length===16&&["proposed","confirmed","cancelled"].includes(v.status)).slice(-150):[]}catch{return []}};
const st={data:null,local:fromStorage(),doctor:"",patient:"",date:today,slot:"",view:"search",lastId:null};
const doc=id=>st.data?.doctors.find(x=>x.id===id);
const patient=id=>st.data?.patients.find(x=>x.id===id);
const allVisits=()=>[...(st.data?.appointments||[]),...st.local];
const docVisits=id=>allVisits().filter(v=>v.doctor_id===id);
const patientVisits=id=>allVisits().filter(v=>v.patient_id===id);
const selectedDoc=()=>doc(st.doctor);
const isWeekend=day=>[0,6].includes(atLocal(day).getDay());
const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>=today&&day<=iso(upperLimit)&&!isWeekend(day);
const localTime=entry=>entry.starts_at.slice(11,16);
const futureVisits=rows=>rows.filter(x=>x.status!=="cancelled"&&x.starts_at>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
const validSlot=(doctorId,day,hour,ignoreId)=>{if(!validDay(day)||!hours.includes(hour))return false;
 const start=new Date(day+"T"+hour+":00"),end=start.getTime()+45*60000;
 if(start.getTime()<=Date.now()+30*60000)return false;
 return !docVisits(doctorId).some(v=>{if(v.status==="cancelled"||v.id===ignoreId)return false;const s=new Date(v.starts_at.slice(0,16)+":00").getTime();const e=s+(Number(v.duration_minutes)||45)*60000;return start.getTime()<e&&end>s});
};
const nextBusiness=(from,advance=false)=>{const d=atLocal(from);if(advance)d.setDate(d.getDate()+1);let tries=0;while(tries++<184){const key=iso(d);if(validDay(key)&&hours.some(h=>validSlot(st.doctor,key,h)))return key;d.setDate(d.getDate()+1)}return from};
const save=()=>{try{localStorage.setItem(safeKey,JSON.stringify(st.local))}catch{toast("Este navegador no permite conservar el recorrido al cerrar.")}};
const toast=text=>{const node=$("toast");node.textContent=text;node.hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>node.hidden=true,4300)};
function showView(view,scroll=true){
 if(!["search","patient","doctor"].includes(view))return;
 st.view=view;
 document.querySelectorAll(".view").forEach(el=>el.hidden=el.id!=="view-"+view);
 document.querySelectorAll(".switcher [data-view]").forEach(el=>{let active=el.dataset.view===view;el.classList.toggle("active",active);el.setAttribute("aria-selected",String(active));el.tabIndex=active?0:-1});
 if(view==="patient")renderPatient();
 if(view==="doctor")renderDoctor();
 if(scroll)document.querySelector(".workspace").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderDoctors(){
 const docs=st.data?.doctors||[];
 const term=$("doctor-query").value.trim().toLocaleLowerCase("es");
 const spec=$("specialty-filter").value;
 const found=docs.filter(d=>(!spec||d.specialty===spec)&&[d.name,d.specialty,d.clinic].join(" ").toLocaleLowerCase("es").includes(term));
 $("results-caption").textContent=found.length+" profesionales encontrados";
 $("doctor-results").innerHTML=found.map(d=>'<button type="button" class="doc-option '+(d.id===st.doctor?"selected":"")+'" data-select-doctor="'+esc(d.id)+'" aria-pressed="'+(d.id===st.doctor)+'"><span class="doc-avatar">'+esc(initials(d.name))+'</span><span class="doc-text"><b>'+esc(clean(d.name))+'</b><small>'+esc(d.specialty)+'</small></span><span class="doc-arrow">↗</span></button>').join("")||'<p class="small-print">No encontramos coincidencias. Prueba otra búsqueda.</p>';
}
function selectDoctor(id){
 if(!doc(id))return;
 st.doctor=id;st.slot="";
 st.patient=(st.data.patients.find(p=>p.doctor_id===id)||{}).id||"";
 st.date=nextBusiness(today);
 $("visit-date").value=st.date;
 renderDoctors();renderBooking();
}
function renderBooking(){
 const d=selectedDoc();if(!d)return;
 $("doctor-preview").innerHTML='<div class="preview-line"><div><p class="preview-eyebrow">PERFIL PROFESIONAL · '+esc(d.id)+'</p><h4 class="preview-name">'+esc(clean(d.name))+'</h4><p class="preview-description">'+esc(d.specialty)+' · '+esc(clean(d.clinic))+'</p></div><span class="portrait" aria-hidden="true">'+esc(initials(d.name))+'</span></div><div class="preview-chips"><span>◉ Mazatlán</span><span>Idiomas: <b>'+esc(d.languages)+'</b></span><span>'+st.data.patients.filter(p=>p.doctor_id===d.id).length+' pacientes vinculados</span></div>';
 const assigned=st.data.patients.filter(p=>p.doctor_id===d.id);
 $("visit-patient").innerHTML=assigned.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===st.patient?"selected":"")+'>'+esc(clean(p.name))+' · '+esc(p.id)+'</option>').join("");
 if(!assigned.some(p=>p.id===st.patient))st.patient=assigned[0]?.id||"";
 $("visit-patient").value=st.patient;
 $("visit-date").value=st.date;
 renderSlots();
}
function renderSlots(){
 const d=selectedDoc();const day=st.date;
 const available=validDay(day);
 if(!d){$("time-slots").innerHTML='<p class="muted">Selecciona un profesional.</p>';return}
 const list=hours.map(h=>({hour:h,free:available&&validSlot(d.id,day,h)}));
 if(!list.some(x=>x.free))st.slot="";
 $("time-slots").innerHTML=list.map(({hour,free})=>'<button type="button" class="slot '+(st.slot===hour&&free?"active":"")+'" data-slot="'+hour+'" '+(!free?"disabled":"")+' aria-pressed="'+(st.slot===hour&&free)+'">'+hour+'</button>').join("");
 $("reserve").disabled=!(available&&st.slot&&validSlot(d.id,day,st.slot)&&st.patient);
}
function iconStatus(s){return {proposed:"Por confirmar",confirmed:"Confirmada",cancelled:"Cancelada"}[s]||"En seguimiento"}
function displayAppointment(v,hasActions=false){
 const d=doc(v.doctor_id),p=patient(v.patient_id),local=String(v.id).startsWith("local-");
 return '<article class="appt-row"><span class="day-num">'+esc(shortDate(v.starts_at.slice(0,10)))+'</span><div><b>'+esc(v.starts_at.slice(11,16))+' · '+esc(clean(hasActions?(p?.name||"Paciente"):(d?.name||"Profesional")))+'</b><small>'+esc(clean(v.service||"Consulta"))+' · '+esc(v.duration_minutes||45)+' minutos</small></div>'+
 (hasActions&&local&&v.status!=="cancelled"?'<div class="appt-actions">'+(v.status==="proposed"?'<button class="mini-btn" data-update-id="'+esc(v.id)+'" data-status="confirmed">Confirmar</button>':'')+'<button class="mini-btn" data-update-id="'+esc(v.id)+'" data-status="cancelled">Cancelar</button></div>':'<span class="pill '+esc(v.status)+'">'+iconStatus(v.status)+'</span>')+'</article>';
}
function renderPatient(){
 if(!st.data)return;
 const id=$("patient-select").value||st.patient||st.data.patients[0]?.id;
 const p=patient(id);if(!p){$("patient-summary").innerHTML='<p class="small-print">No hay perfiles disponibles.</p>';return}
 st.patient=id;$("patient-select").value=id;
 const d=doc(p.doctor_id);
 const entries=patientVisits(id).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 const future=futureVisits(entries);const next=future[0];
 const confirmed=entries.filter(v=>v.status==="confirmed").length;
 $("patient-summary").innerHTML='<div class="dashboard-headline"><div><p class="eyebrow">MI ESPACIO / PACIENTE</p><h4>'+esc(clean(p.name))+'</h4><p>Profesional asignado: '+esc(clean(d?.name||"—"))+' · '+esc(d?.specialty||"")+'</p></div><div class="round-icon">'+esc(initials(p.name))+'</div></div>'+
 '<div class="data-strip"><div><strong>'+entries.length+'</strong><small>Visitas registradas</small></div><div><strong>'+confirmed+'</strong><small>Citas confirmadas</small></div><div><strong>'+esc(next?shortDate(next.starts_at.slice(0,10)):"—")+'</strong><small>Próxima visita</small></div></div>'+
 '<div class="dashboard-columns"><section><h4>Tu ruta de atención.</h4><ol class="timeline"><li><span class="node done">✓</span><div><strong>Perfil vinculado</strong><p>Información administrativa disponible en el portal.</p></div></li><li><span class="node done">✓</span><div><strong>Profesional asignado</strong><p>'+esc(clean(d?.name||""))+' · '+esc(d?.specialty||"")+'</p></div></li><li><span class="node '+(future.length?"done":"")+'">'+(future.length?"✓":"3")+'</span><div><strong>Programación de consulta</strong><p>'+(next?"Próxima visita: "+esc(dayFormat(next.starts_at.slice(0,10)))+" a las "+esc(localTime(next)):"Selecciona una fecha desde el directorio de profesionales.")+'</p></div></li><li><span class="node">'+(confirmed?"✓":"4")+'</span><div><strong>Confirmación y seguimiento</strong><p>'+(confirmed?"Hay citas confirmadas en el historial.":"La confirmación depende del equipo coordinador.")+'</p></div></li></ol></section>'+
 '<section><h4>Visitas y movimientos.</h4><div class="appointment-list">'+(entries.length?entries.slice(-8).reverse().map(v=>displayAppointment(v)).join(""):'<p class="small-print">Todavía no hay visitas registradas.</p>')+'</div><p class="small-print">Se muestran únicamente perfiles ficticios. Las visitas nuevas se guardan en este navegador.</p><button class="secondary-btn" type="button" data-view="search" data-doctor-link="'+esc(p.doctor_id)+'" style="margin-top:14px">Programar otra consulta ↗</button></section></div>';
}
function renderDoctor(){
 if(!st.data)return;
 const id=$("dashboard-doctor").value||st.doctor||st.data.doctors[0]?.id;
 const d=doc(id);if(!d)return;
 $("dashboard-doctor").value=id;
 const rows=docVisits(id).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 const active=rows.filter(v=>v.status!=="cancelled");
 const future=futureVisits(rows);
 const assigned=st.data.patients.filter(p=>p.doctor_id===id);
 const confirmed=active.filter(v=>v.status==="confirmed").length;
 $("doctor-summary").innerHTML='<div class="dashboard-headline"><div><p class="eyebrow">ESPACIO PROFESIONAL / '+esc(d.id)+'</p><h4>'+esc(clean(d.name))+'</h4><p>'+esc(d.specialty)+' · '+esc(clean(d.clinic))+'</p></div><div class="round-icon">'+esc(initials(d.name))+'</div></div>'+
 '<div class="data-strip"><div><strong>'+assigned.length+'</strong><small>Pacientes asignados</small></div><div><strong>'+future.length+'</strong><small>Próximas visitas</small></div><div><strong>'+confirmed+'</strong><small>Citas confirmadas</small></div></div>'+
 '<div class="dashboard-columns"><section><h4>Agenda de consultas.</h4><div class="appointment-list">'+(future.length?future.slice(0,12).map(v=>displayAppointment(v,true)).join(""):'<p class="small-print">Sin próximas visitas. Programa una consulta en el directorio.</p>')+'</div><p class="small-print">Puedes confirmar o cancelar las visitas creadas en este recorrido. Las citas de referencia de Neon son de solo lectura.</p></section>'+
 '<section><h4>Pacientes asignados.</h4><div class="table-scroll"><table class="dashboard-table"><thead><tr><th>Perfil</th><th>Citas</th><th>Acción</th></tr></thead><tbody>'+assigned.map(p=>'<tr><td>'+esc(clean(p.name))+'</td><td>'+patientVisits(p.id).length+'</td><td><button class="mini-btn" type="button" data-open-patient="'+esc(p.id)+'">Abrir ficha ↗</button></td></tr>').join("")+'</tbody></table></div></section></div>';
}
function book(){
 if(!st.data||!st.patient||!st.slot||!validSlot(st.doctor,st.date,st.slot)){toast("Selecciona un día y un horario disponible.");renderSlots();return}
 const id="local-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
 const v={id,doctor_id:st.doctor,patient_id:st.patient,starts_at:st.date+"T"+st.slot,duration_minutes:45,status:"proposed",service:$("visit-service").value};
 st.local.push(v);if(st.local.length>150)st.local.shift();st.lastId=id;save();
 st.slot="";renderSlots();
 $("patient-select").value=st.patient;$("dashboard-doctor").value=st.doctor;
 $("success-detail").textContent=clean(patient(v.patient_id)?.name)+" · "+clean(doc(v.doctor_id)?.name)+" · "+dayFormat(st.date)+" a las "+v.starts_at.slice(11,16)+".";
 $("success-dialog").hidden=false;$("success-patient").focus();
}
const icsEscape=s=>String(s||"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
const compact=s=>s.replace(/[-:]/g,"").replace(/\./g,"").slice(0,15);
function exportIcs(rows){
 const ordered=rows.filter(v=>v.status!=="cancelled");if(!ordered.length){toast("No hay citas activas para exportar.");return}
 const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z/,"Z");
 const out=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GROWA//Agenda de muestra//ES","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
 ordered.forEach((v,i)=>{const start=atLocal(v.starts_at.slice(0,10));const [hh,mm]=v.starts_at.slice(11,16).split(":").map(Number);start.setHours(hh,mm,0,0);const end=new Date(start.getTime()+(v.duration_minutes||45)*60000);
 const fmt=d=>iso(d).replace(/-/g,"")+"T"+String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0")+"00";
 out.push("BEGIN:VEVENT","UID:growa-"+icsEscape(v.id)+"@growa.invalid","DTSTAMP:"+stamp,"DTSTART;TZID=America/Mazatlan:"+fmt(start),"DTEND;TZID=America/Mazatlan:"+fmt(end),"SUMMARY:"+icsEscape(clean(v.service)+" · "+clean(doc(v.doctor_id)?.name)),"DESCRIPTION:"+icsEscape("Cita ilustrativa para recorrer el portal Growa. No constituye reserva real."),"STATUS:TENTATIVE","END:VEVENT")});
 out.push("END:VCALENDAR");
 const url=URL.createObjectURL(new Blob([out.join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="growa-agenda-ilustrativa.ics";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function updateVisit(id,status){
 const v=st.local.find(v=>v.id===id);if(!v)return;
 if(status==="confirmed"&&!validSlot(v.doctor_id,v.starts_at.slice(0,10),localTime(v),v.id)){toast("Este horario presenta un conflicto.");return}
 v.status=status;save();renderDoctor();renderPatient();if(st.view==="search")renderSlots();toast(status==="confirmed"?"Visita confirmada en este recorrido.":"Visita cancelada en este recorrido.");
}
function applyOptions(){
 const opts=st.data.doctors.map(d=>'<option value="'+esc(d.id)+'">'+esc(clean(d.name))+' · '+esc(d.specialty)+'</option>').join("");
 $("dashboard-doctor").innerHTML=opts;
 $("patient-select").innerHTML=st.data.patients.map(p=>'<option value="'+esc(p.id)+'">'+esc(clean(p.name))+' · '+esc(p.id)+'</option>').join("");
 const specs=[...new Set(st.data.doctors.map(d=>d.specialty))].sort((a,b)=>a.localeCompare(b,"es"));
 $("specialty-filter").innerHTML='<option value="">Todas las especialidades</option>'+specs.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
}
async function init(){
 $("visit-date").min=today;$("visit-date").max=iso(upperLimit);
 try{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
 let response;try{response=await fetch("/api/demo-network",{cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}})}finally{clearTimeout(timer)}
 if(!response.ok)throw Error("respuesta "+response.status);
 const data=await response.json();
 if(!Array.isArray(data.doctors)||!Array.isArray(data.patients)||!data.doctors.length)throw Error("directorio no disponible");
 st.data=data;
 $("source-status").textContent="Directorio conectado a Neon · agenda ilustrativa";
 }catch(err){st.data=fallback();$("source-status").textContent="Modo de muestra sin conexión · datos de respaldo";toast("No se pudo consultar Neon. Se activaron perfiles de ejemplo en este navegador.")}
 $("metric-doctors").textContent=st.data.doctors.length;
 $("metric-patients").textContent=st.data.patients.length;
 $("metric-visits").textContent=st.data.appointments.length+st.local.length;
 applyOptions();selectDoctor(st.data.doctors[0].id);$("dashboard-doctor").value=st.doctor;$("patient-select").value=st.patient;renderPatient();renderDoctor();
}
document.addEventListener("click",e=>{
 const button=e.target.closest("button");if(!button)return;
 if(button.dataset.selectDoctor){selectDoctor(button.dataset.selectDoctor);return}
 if(button.dataset.slot){st.slot=button.dataset.slot;renderSlots();return}
 if(button.dataset.openPatient){$("patient-select").value=button.dataset.openPatient;st.patient=button.dataset.openPatient;showView("patient");return}
 if(button.dataset.updateId){updateVisit(button.dataset.updateId,button.dataset.status);return}
 if(button.dataset.view){if(button.dataset.doctorLink)selectDoctor(button.dataset.doctorLink);showView(button.dataset.view);return}
});
$("doctor-query").addEventListener("input",renderDoctors);
$("specialty-filter").addEventListener("change",renderDoctors);
$("visit-patient").addEventListener("change",e=>st.patient=e.target.value);
$("visit-date").addEventListener("change",e=>{st.date=e.target.value;st.slot="";if(!validDay(st.date))toast("Selecciona un día hábil dentro de los próximos seis meses.");renderSlots()});
$("next-date").addEventListener("click",()=>{st.date=nextBusiness(st.date,true);st.slot="";renderBooking()});
$("reserve").addEventListener("click",book);
$("patient-select").addEventListener("change",renderPatient);
$("dashboard-doctor").addEventListener("change",renderDoctor);
$("patient-print").addEventListener("click",()=>{renderPatient();window.print()});
$("dashboard-export").addEventListener("click",()=>exportIcs(docVisits($("dashboard-doctor").value)));
$("dialog-close").addEventListener("click",()=>$("success-dialog").hidden=true);
$("success-dialog").addEventListener("click",e=>{if(e.target===$("success-dialog"))$("success-dialog").hidden=true});
$("success-patient").addEventListener("click",()=>{$("success-dialog").hidden=true;showView("patient")});
$("success-calendar").addEventListener("click",()=>{const row=st.local.find(v=>v.id===st.lastId);if(row)exportIcs([row])});
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("success-dialog").hidden=true});
init();
})();