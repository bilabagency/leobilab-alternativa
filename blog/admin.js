(()=>{
  const $=s=>document.querySelector(s),form=$('#editor');
  let entries=[],etag=null,current=null,dirty=false,busy=false,challengeRequired=false,widget=null,selection=0,insertedImage=null;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug=s=>String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const message=(target,text,error=false)=>{target.textContent=text;target.classList.toggle('error',error);};
  async function api(op,data){
    const response=await fetch('/api/blog?op='+op,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-Blog-Admin':'1'}:{},body:data?JSON.stringify(data):undefined,credentials:'same-origin'});
    const result=await response.json();if(!response.ok){if(response.status===401)message($('#save-status'),'La sesión terminó. Copiá el texto que no hayas guardado antes de volver a entrar.',true);throw new Error(result.error||'No se pudo completar la acción.');}return result;
  }
  function locked(on){busy=on;$('#editor-panel').querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=on);}
  function markDirty(){dirty=true;message($('#save-status'),'Cambios sin guardar');}
  const state=e=>e.draft.status==='archived'?'archived':e.published?'published':'draft';
  function drawList(){
    const q=slug($('#admin-search').value),filter=$('#admin-filter').value;
    const found=entries.filter(e=>(filter==='all'||state(e)===filter)&&slug([e.draft.title,e.draft.category,...e.draft.tags].join(' ')).includes(q));
    const live=entries.filter(e=>e.published).length;$('#admin-count').textContent=`${entries.length} ${entries.length===1?'nota':'notas'} · ${live} ${live===1?'publicada':'publicadas'}`;
    $('#post-list').innerHTML=found.length?found.map(e=>`<article class="admin-row"><div><h2>${escape(e.draft.title)}</h2><p>${escape(e.draft.category)} · ${escape(e.draft.date)}${e.published&&e.draft.revision!==e.published.revision?' · Hay cambios en borrador':''}</p></div><div><span class="badge">${{published:'Publicada',draft:'Borrador',archived:'Archivada'}[state(e)]}</span>${e.published?`<p><a href="/blog/${escape(e.published.slug)}/" target="_blank" rel="noopener">Ver nota publicada</a></p>`:''}</div><button data-edit="${escape(e.id)}">Editar</button></article>`).join(''):'<div class="empty-state"><h2>No hay notas en esta vista.</h2><p>Probá con otro filtro o creá una nueva publicación.</p></div>';
    $('#category-options').innerHTML=[...new Set(entries.map(e=>e.draft.category))].map(c=>`<option value="${escape(c)}"></option>`).join('');
  }
  async function load(){const data=await api('posts');entries=data.catalog.entries;etag=data.etag;drawList();$('#login-panel').hidden=true;$('#workspace').hidden=false;$('#editor-panel').hidden=true;}
  async function boot(){try{const session=await api('session');challengeRequired=session.challengeRequired;if(session.authenticated){await load();return;}if(!session.ready){message($('#login-status'),'El acceso todavía está en configuración. Las notas publicadas siguen disponibles en el blog.');$('#login-form').querySelector('button').disabled=true;return;}if(challengeRequired&&session.siteKey){const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=()=>{widget=window.turnstile.render('#challenge',{sitekey:session.siteKey,theme:'light'});};script.onerror=()=>message($('#login-status'),'No se pudo cargar la verificación de seguridad. Recargá la página.',true);document.head.append(script);}}catch(error){message($('#login-status'),error.message,true);}}
  $('#login-form').addEventListener('submit',async event=>{event.preventDefault();const login=event.currentTarget,button=login.querySelector('button');button.disabled=true;message($('#login-status'),'Verificando acceso…');try{await api('login',{email:login.elements.email.value,password:login.elements.password.value,challenge:challengeRequired?window.turnstile?.getResponse(widget):''});login.reset();await load();}catch(error){message($('#login-status'),error.message,true);if(widget!==null)window.turnstile.reset(widget);}finally{button.disabled=false;}});
  $('#logout').addEventListener('click',async()=>{try{await api('logout',{});location.reload();}catch(error){message($('#admin-status'),error.message,true);}});
  $('#admin-search').addEventListener('input',drawList);$('#admin-filter').addEventListener('change',drawList);
  function edit(entry){
    current=entry||null;form.reset();delete form.elements.slug.dataset.edited;
    const post=entry?.draft||{title:'',slug:'',excerpt:'',body:'',author:'Bautista Veaute',date:new Date().toISOString().slice(0,10),category:'',tags:[],cover:'',coverAlt:''};
    for(const key of ['title','slug','excerpt','body','author','date','category','cover','coverAlt'])form.elements[key].value=post[key]||'';
    form.elements.tags.value=post.tags.join(', ');form.elements.slug.readOnly=Boolean(entry?.published);
    form.elements.date.max=new Date().toISOString().slice(0,10);
    $('#editor-heading').textContent=entry?'Editar nota':'Nueva nota';$('#publish').textContent=entry?.published?'Publicar cambios':'Publicar';
    $('#archive').hidden=!entry||post.status==='archived';$('#cover-preview').hidden=!post.cover;
    if(post.cover)$('#cover-preview').src=post.cover;else $('#cover-preview').removeAttribute('src');
    $('#slug-preview').textContent=post.slug;$('#workspace').hidden=true;$('#editor-panel').hidden=false;dirty=false;
    message($('#save-status'),entry?.published?'La versión publicada se mantiene hasta que publiques cambios.':'Borrador privado');window.scrollTo(0,0);form.elements.title.focus();
  }
  $('#new-post').addEventListener('click',()=>edit(null));$('#post-list').addEventListener('click',event=>{const id=event.target.closest('[data-edit]')?.dataset.edit;if(id)edit(entries.find(e=>e.id===id));});
  $('#back-list').addEventListener('click',async()=>{if(busy)return;if(dirty&&!confirm('Hay cambios sin guardar. ¿Querés descartarlos y volver a publicaciones?'))return;dirty=false;try{await load();window.scrollTo(0,0);}catch(error){message($('#save-status'),error.message,true);}});
  form.addEventListener('input',markDirty);
  form.elements.title.addEventListener('input',()=>{if(!current&&!form.elements.slug.dataset.edited){form.elements.slug.value=slug(form.elements.title.value);$('#slug-preview').textContent=form.elements.slug.value;}});
  form.elements.slug.addEventListener('input',()=>{form.elements.slug.dataset.edited='1';$('#slug-preview').textContent=form.elements.slug.value;});
  const postData=()=>Object.fromEntries(['title','slug','excerpt','body','author','date','category','cover','coverAlt'].map(k=>[k,form.elements[k].value]));
  async function save(action='draft'){
    if(busy)return null;
    if(action==='publish'?!form.reportValidity():![form.elements.title,form.elements.slug,form.elements.author,form.elements.date].every(input=>input.reportValidity()))return null;
    if(action==='publish'&&!form.elements.cover.value){message($('#save-status'),'Subí una portada antes de publicar.',true);$('#cover-upload').focus();return null;}
    locked(true);message($('#save-status'),action==='publish'?'Publicando…':'Guardando…');
    try{const result=await api('save',{action,etag,post:{...postData(),id:current?.id,tags:form.elements.tags.value.split(',').map(t=>t.trim()).filter(Boolean)}});etag=result.etag;current=result.entry;const at=entries.findIndex(e=>e.id===current.id);if(at<0)entries.push(current);else entries[at]=current;dirty=false;form.elements.slug.readOnly=Boolean(current.published);$('#archive').hidden=current.draft.status==='archived';$('#publish').textContent=current.published?'Publicar cambios':'Publicar';message($('#save-status'),action==='publish'?'Publicado. La nueva versión ya está en el blog.':action==='archive'?'Nota archivada. Ya no es visible para los lectores.':'Borrador guardado. '+(current.published?'La versión pública no cambió.':'Todavía no está publicado.'));return current;}catch(error){message($('#save-status'),error.message,true);return null;}finally{locked(false);}
  }
  form.noValidate=true;form.addEventListener('submit',event=>{event.preventDefault();save('draft');});
  $('#publish').addEventListener('click',()=>{if(form.reportValidity())$('#publish-dialog').showModal();});
  $('#publish-dialog').addEventListener('close',()=>{if($('#publish-dialog').returnValue==='publish')save('publish');});
  $('#archive').addEventListener('click',()=>{if(confirm('La nota dejará de verse en el blog. Se conserva en el administrador y podés volver a publicarla. ¿Archivar?'))save('archive');});
  $('#preview').addEventListener('click',async()=>{const popup=window.open('about:blank','_blank');if(popup){popup.document.title='Preparando vista previa';popup.document.body.textContent='Guardando el borrador para preparar la vista previa…';}const entry=await save('draft');if(entry){if(popup)popup.location='/blog/preview/'+entry.id+'/';else message($('#save-status'),'Borrador guardado. Permití las ventanas emergentes para abrir la vista previa.',true);}else popup?.close();});
  $('#export-all').addEventListener('click',async()=>{try{const backup=await api('export'),blob=new Blob([JSON.stringify(backup.catalog,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bilab-blog-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);message($('#admin-status'),'Respaldo del texto descargado. Las imágenes se conservan en el almacenamiento del blog.');}catch(error){message($('#admin-status'),error.message,true);}});
  function insert(text,wrap=''){const area=form.elements.body,start=area.selectionStart,end=area.selectionEnd,selected=area.value.slice(start,end)||'Texto';area.setRangeText(text+(wrap?selected+wrap:''),start,end,'end');area.focus();markDirty();}
  document.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{const kind=button.dataset.format;if(kind==='bold')insert('**','**');if(kind==='italic')insert('*','*');if(kind==='heading')insert('\n\n## Subtítulo\n\n');if(kind==='quote')insert('\n\n> Cita destacada\n\n');if(kind==='list')insert('\n\n1. Primer punto\n2. Segundo punto\n\n');if(kind==='link')insert('[Texto del enlace](https://)');}));
  async function upload(file){if(!file)throw new Error('Elegí una imagen.');if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3_000_000)throw new Error('Usá JPG, PNG o WebP de menos de 3 MB.');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});return (await api('upload',{base64})).url;}
  $('#cover-upload').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;locked(true);message($('#save-status'),'Subiendo portada…');try{const url=await upload(file);form.elements.cover.value=url;$('#cover-preview').src=url;$('#cover-preview').hidden=false;markDirty();}catch(error){message($('#save-status'),error.message,true);}finally{locked(false);}});
  $('#insert-image').addEventListener('click',()=>{selection=form.elements.body.selectionStart;$('#body-image-upload').click();});
  $('#body-image-upload').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;locked(true);message($('#save-status'),'Subiendo imagen…');try{insertedImage=await upload(file);$('#image-alt').value='';$('#image-dialog').showModal();message($('#save-status'),'Imagen cargada. Agregá su descripción.');}catch(error){message($('#save-status'),error.message,true);}finally{locked(false);event.target.value='';}});
  $('#image-dialog').addEventListener('close',()=>{if($('#image-dialog').returnValue!=='insert')return;const alt=$('#image-alt').value.replace(/[\[\]\n]/g,' ');form.elements.body.setSelectionRange(selection,selection);insert(`\n\n![${alt}](${insertedImage})\n\n`);});
  window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  boot();
})();
