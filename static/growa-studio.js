/* Growa Turismo Médico — navigation only. No API, account or database changes. */
(()=>{
  "use strict";
  const toggle=document.getElementById("menu-toggle");
  const menu=document.getElementById("site-navigation");
  if(!toggle||!menu)return;
  const mobile=window.matchMedia("(max-width: 1000px)");
  function close(){
    menu.hidden=mobile.matches;
    toggle.setAttribute("aria-expanded","false");
    toggle.setAttribute("aria-label","Abrir navegación");
    document.body.classList.remove("nav-open");
  }
  function sync(){
    if(mobile.matches){
      menu.hidden=true;
      close();
    }else{
      menu.hidden=false;
      toggle.setAttribute("aria-expanded","false");
      document.body.classList.remove("nav-open");
    }
  }
  toggle.addEventListener("click",()=>{
    if(!mobile.matches)return;
    const opening=toggle.getAttribute("aria-expanded")!=="true";
    toggle.setAttribute("aria-expanded",String(opening));
    toggle.setAttribute("aria-label",opening?"Cerrar navegación":"Abrir navegación");
    menu.hidden=!opening;
    document.body.classList.toggle("nav-open",opening);
  });
  menu.addEventListener("click",event=>{
    if(event.target.closest("a"))close();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&toggle.getAttribute("aria-expanded")==="true"){
      close();
      toggle.focus();
    }
  });
  mobile.addEventListener?.("change",sync);
  sync();
})();
