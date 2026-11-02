/* Growa visual concept: presentation-only interactions.
 * No database writes, APIs, sessions, local storage, analytics or clinical information.
 */
(()=>{
"use strict";
const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const menuButton=$("#menu-toggle"),mobileNav=$("#mobile-nav");
function closeMenu(){
 if(!menuButton||!mobileNav)return;
 menuButton.setAttribute("aria-expanded","false");
 menuButton.setAttribute("aria-label","Abrir menú");
 mobileNav.hidden=true;
 document.body.classList.remove("no-scroll");
}
if(menuButton&&mobileNav){
 menuButton.addEventListener("click",()=>{
  const open=menuButton.getAttribute("aria-expanded")!=="true";
  menuButton.setAttribute("aria-expanded",String(open));
  menuButton.setAttribute("aria-label",open?"Cerrar menú":"Abrir menú");
  mobileNav.hidden=!open;
  document.body.classList.toggle("no-scroll",open && matchMedia("(max-width: 760px)").matches);
 });
 mobileNav.addEventListener("click",e=>{
  if(e.target.closest("a"))closeMenu();
 });
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&menuButton.getAttribute("aria-expanded")==="true"){
   closeMenu();menuButton.focus();
  }
 });
 document.addEventListener("pointerdown",e=>{
  if(menuButton.getAttribute("aria-expanded")==="true"&&!e.target.closest(".site-header"))closeMenu();
 });
 window.addEventListener("resize",()=>{if(innerWidth>1060)closeMenu()});
}
const views={
 patient:{
  text:[
   "Visualiza tus próximas acciones.",
   "Revisa propuestas de cita y cambios de estado.",
   "Envía consultas administrativas al equipo."
  ],
  link:"/mi-proceso?demo=patient",cta:"Explorar vista del paciente",
  role:"VISITANTE DE EJEMPLO",kicker:"Tu visita, paso a paso",
  heading:"Todo listo para tu próxima visita.",
  subtitle:"Revisa qué sigue y conoce el estado de tus preparativos.",
  numbers:["01","02 / 05","01"],
  labels:["Procesos activos","Pendientes resueltos","Próximos eventos"],
  listTitle:"Tu recorrido",
  tasks:["Revisar los detalles de tu visita","Confirmar opciones de traslado","Revisar propuesta de horario"]
 },
 doctor:{
  text:[
   "Revisa los procesos asignados a tu clínica.",
   "Organiza tareas y confirma propuestas de citas.",
   "Responde las consultas administrativas del paciente."
  ],
  link:"/panel-medico?demo=doctor",cta:"Explorar panel médico",
  role:"EQUIPO DE CLÍNICA · DEMO",kicker:"Gestión de procesos",
  heading:"Organiza cada caso con claridad.",
  subtitle:"Seguimiento compartido con el paciente y control de pendientes.",
  numbers:["04","07 / 12","02"],
  labels:["Procesos de ejemplo","Pendientes atendidos","Propuestas de cita"],
  listTitle:"Actividad del equipo",
  tasks:["Revisar solicitud administrativa","Confirmar agenda disponible","Preparar indicaciones de llegada"]
 }
};
function setText(selector,value){const el=$(selector);if(el)el.textContent=value}
function setAudience(audience){
 const v=views[audience];if(!v)return;
 $$("[data-audience]").forEach(button=>{
  const active=button.dataset.audience===audience;
  button.classList.toggle("active",active);
  button.setAttribute("aria-selected",String(active));
  button.tabIndex=active?0:-1;
 });
 setText("#mock-role-label",v.role);
 setText("#mock-kicker",v.kicker);
 setText("#mock-heading",v.heading);
 setText("#mock-subtitle",v.subtitle);
 setText("#mock-kpi-1",v.labels[0]);setText("#mock-kpi-2",v.labels[1]);setText("#mock-kpi-3",v.labels[2]);
 setText("#mock-num-1",v.numbers[0]);setText("#mock-num-2",v.numbers[1]);setText("#mock-num-3",v.numbers[2]);
 setText("#mock-list-title",v.listTitle);
 setText("#mock-task-1",v.tasks[0]);setText("#mock-task-2",v.tasks[1]);setText("#mock-task-3",v.tasks[2]);
 const panel=$("#product-preview");
 if(panel)panel.setAttribute("aria-labelledby","switch-"+audience);
 const list=$(".platform-points");
 if(list)list.innerHTML=v.text.map(item=>{
  const li=document.createElement("li"),mark=document.createElement("span");
  mark.textContent="✓";li.append(mark,document.createTextNode(item));return li.outerHTML;
 }).join("");
 const link=$("#audience-link");
 if(link){link.href=v.link;link.replaceChildren(document.createTextNode(v.cta+" "),Object.assign(document.createElement("span"),{textContent:"↗"}));}
}
$$("[data-audience]").forEach(button=>{
 button.addEventListener("click",()=>setAudience(button.dataset.audience));
 button.addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
  event.preventDefault();
  const target=event.key==="Home"?"patient":event.key==="End"?"doctor":button.dataset.audience==="patient"?"doctor":"patient";
  setAudience(target);$("#switch-"+target)?.focus();
 });
});
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
if(!reduced&&"IntersectionObserver" in window){
 document.documentElement.classList.add("has-motion");
 const obs=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add("visible");obs.unobserve(entry.target)}
 },{threshold:0.075,rootMargin:"0px 0px -20px 0px"});
 $$(".reveal").forEach(el=>obs.observe(el));
}
})();
