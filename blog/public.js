document.querySelector('.sort-field select')?.addEventListener('change',event=>event.target.form.requestSubmit());
document.querySelector('[data-copy]')?.addEventListener('click',async event=>{
  const button=event.currentTarget,status=document.querySelector('#copy-status');
  try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Enlace copiado';status.textContent='Enlace copiado al portapapeles.';}catch{status.textContent='No se pudo copiar. Copiá la dirección desde la barra del navegador.';}
});
const sectionLinks=[...document.querySelectorAll('.reading-aside nav a')];
if(sectionLinks.length){let pending=false;const headings=[...document.querySelectorAll('.prose h2')];const update=()=>{pending=false;let current=headings[0];for(const h of headings)if(h.getBoundingClientRect().top<=160)current=h;sectionLinks.forEach(a=>{if(a.hash==='#'+current.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});};window.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update);}},{passive:true});update();}
