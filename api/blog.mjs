import {randomUUID} from 'node:crypto';
import {BlogError,validatePost,publishedPosts,escape as e,SITE,safeImage,slugify} from '../blog/model.mjs';
import {readCatalog,saveCatalog,readRecord,writeRecord} from '../blog/store.mjs';
import {authReady,isAdmin,sameOrigin,sessionCookie,clearCookie,verifyPassword,limitLogin,verifyChallenge} from '../blog/auth.mjs';
import {listing,article,adminPage,notFound} from '../blog/views.mjs';

export const config={maxDuration:30};
const send=(res,status,value,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(value):value);};
async function jsonBody(req){
  let value;
  if(req.body!==undefined){value=typeof req.body==='string'?req.body:JSON.stringify(req.body);}
  else {let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4_200_000)throw new BlogError('El archivo es demasiado grande. El límite es 3 MB.',413);chunks.push(chunk);}value=Buffer.concat(chunks).toString();}
  if(value.length>4_200_000)throw new BlogError('La solicitud es demasiado grande.',413);
  try{return JSON.parse(value);}catch{throw new BlogError('No se pudo leer la solicitud. Volvé a intentarlo.');}
}
function assetType(bytes){if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'png',type:'image/png'};if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {ext:'jpg',type:'image/jpeg'};if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {ext:'webp',type:'image/webp'};throw new BlogError('Usá una imagen JPG, PNG o WebP válida. No se aceptan SVG.');}
function publicMetadata(req,res,privateResponse=false){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Cache-Control',privateResponse?'private, no-store':'public, max-age=0, must-revalidate');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Robots-Tag',privateResponse?'noindex, nofollow':'index, follow');
}
export default async function handler(req,res){
  const url=new URL(req.url,'https://wearebilab.com'),op=url.searchParams.get('op');
  // Vercel passes the original path in a rewrite query; local server supplies it directly.
  const routed=url.searchParams.get('route');if(routed!==null)url.pathname='/blog/'+routed;
  url.searchParams.delete('route');
  const privateRoute=url.pathname.startsWith('/blog/admin')||url.pathname.startsWith('/blog/preview')||url.pathname==='/api/blog';
  publicMetadata(req,res,privateRoute);
  try {
    if(!['GET','HEAD','POST'].includes(req.method)){res.setHeader('Allow','GET, HEAD, POST');throw new BlogError('Método no permitido.',405);}
    if(req.method==='POST'){
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
      sameOrigin(req);
      if(!authReady())throw new BlogError('El administrador todavía no está habilitado.',503);
      if(op==='login'){
        const data=await jsonBody(req);await verifyChallenge(data.challenge);await limitLogin(req);
        const valid=verifyPassword(data.password);
        if(String(data.email||'').trim().toLowerCase()!==process.env.BLOG_ADMIN_EMAIL.toLowerCase()||!valid)throw new BlogError('El correo o la contraseña no coinciden.',401);
        res.setHeader('Set-Cookie',sessionCookie());return send(res,200,{ok:true});
      }
      if(!isAdmin(req))throw new BlogError('Tu sesión terminó. Volvé a entrar para continuar.',401);
      if(op==='logout'){res.setHeader('Set-Cookie',clearCookie());return send(res,200,{ok:true});}
      const data=await jsonBody(req);
      if(op==='upload'){
        const bytes=Buffer.from(String(data.base64||''),'base64');
        if(bytes.length>3_000_000||bytes.length<20)throw new BlogError('La imagen debe pesar menos de 3 MB.',413);
        const kind=assetType(bytes),name=`${randomUUID()}.${kind.ext}`;
        await writeRecord(`media/${name}`,bytes,null,kind.type);return send(res,201,{url:`/blog/media/${name}`});
      }
      if(op==='save'){
        const {catalog,etag}=await readCatalog();
        if(data.etag!==etag)throw new BlogError('Otra sesión guardó cambios. Copiá tu texto antes de recargar para no perderlo.',409);
        const existing=catalog.entries.find(x=>x.id===data.post.id),post=validatePost(data.post,existing,data.action==='publish');
        if(catalog.entries.some(x=>x.id!==post.id&&(x.draft.slug===post.slug||x.published?.slug===post.slug)))throw new BlogError('Ya existe una nota con esa dirección. Elegí otra.',409);
        let entry={id:post.id,draft:post,published:existing?.published||null};
        if(data.action==='publish'){post.status='published';entry.published={...post};}
        else if(data.action==='archive'){post.status='archived';entry.published=null;}
        else {post.status='draft';}
        if(existing)catalog.entries=catalog.entries.map(x=>x.id===post.id?entry:x);else catalog.entries.push(entry);
        const savedEtag=await saveCatalog(catalog,etag);
        return send(res,200,{entry,etag:savedEtag});
      }
      throw new BlogError('Acción no disponible.',404);
    }
    if(url.pathname==='/api/blog'){
      if(op==='session')return send(res,200,{authenticated:isAdmin(req),ready:authReady(),siteKey:process.env.TURNSTILE_SITE_KEY||'',challengeRequired:Boolean(process.env.VERCEL)});
      if(!isAdmin(req))throw new BlogError('Ingresá al administrador para continuar.',401);
      if(op==='posts'||op==='export'){
        const result=await readCatalog();
        if(op==='export')res.setHeader('Content-Disposition',`attachment; filename="bilab-blog-${new Date().toISOString().slice(0,10)}.json"`);
        return send(res,200,result);
      }
      throw new BlogError('Acción no disponible.',404);
    }
    if(url.pathname==='/blog/admin'||url.pathname==='/blog/admin/')return send(res,200,adminPage(),'text/html; charset=utf-8');
    const {catalog}=await readCatalog(),posts=publishedPosts(catalog);
    if(url.pathname.startsWith('/blog/preview/')){
      if(!isAdmin(req))throw new BlogError('Ingresá al administrador para ver este borrador.',401);
      const id=url.pathname.split('/')[3],p=catalog.entries.find(x=>x.id===id)?.draft;
      if(!p)return send(res,404,notFound(),'text/html; charset=utf-8');
      return send(res,200,article(p,[],true),'text/html; charset=utf-8');
    }
    if(url.pathname.startsWith('/blog/media/')){
      if(!safeImage(url.pathname))throw new BlogError('Imagen no encontrada.',404);
      if(!posts.some(p=>p.cover===url.pathname||p.body.includes(']('+url.pathname+')'))&&!isAdmin(req))throw new BlogError('Imagen no encontrada.',404);
      const result=await readRecord('media/'+url.pathname.split('/').pop());if(!result)throw new BlogError('Imagen no encontrada.',404);
      res.setHeader('Cache-Control','private, no-store');return send(res,200,result.text,assetType(result.text).type);
    }
    if(url.pathname==='/blog/feed.xml')return send(res,200,`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog de bi.lab</title><link>${SITE}/blog/</link><description>Publicidad, inteligencia artificial y gestión desde la práctica.</description><language>es-ar</language>${posts.slice(0,50).map(p=>`<item><title>${e(p.title)}</title><link>${SITE}/blog/${p.slug}/</link><guid>${SITE}/blog/${p.slug}/</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><description>${e(p.excerpt)}</description><category>${e(p.category)}</category></item>`).join('')}</channel></rss>`,'application/rss+xml; charset=utf-8');
    if(url.pathname==='/blog/sitemap.xml')return send(res,200,`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/blog/</loc>${posts[0]?`<lastmod>${posts[0].updatedAt}</lastmod>`:''}</url>${posts.map(p=>`<url><loc>${SITE}/blog/${p.slug}/</loc><lastmod>${p.updatedAt}</lastmod></url>`).join('')}</urlset>`,'application/xml; charset=utf-8');
    if(url.pathname==='/blog'||url.pathname==='/blog/'||/^\/blog\/(categoria|etiqueta)\/[^/]+\/?$/.test(url.pathname))return send(res,200,listing(posts,url),'text/html; charset=utf-8');
    const slug=url.pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/)?.[1],p=posts.find(p=>p.slug===slug);
    if(p)return send(res,200,article(p,posts),'text/html; charset=utf-8');
    return send(res,404,notFound(),'text/html; charset=utf-8');
  }catch(error){
    const status=error instanceof BlogError?error.status:503;
    if(status>=500)console.error('blog_request_failed',error.name,error.status||'');
    const message=error instanceof BlogError?error.message:'No pudimos cargar el blog. Esperá unos segundos y volvé a intentar.';
    if(req.method==='POST'||url.pathname==='/api/blog')return send(res,status,{error:message});
    return send(res,status,`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="stylesheet" href="/blog/blog.css"><title>Blog de bi.lab</title></head><body><main class="blog-main empty-state"><h1>Un momento.</h1><p>${e(message)}</p><a href="/blog/">Volver al blog</a></main></body></html>`,'text/html; charset=utf-8');
  }
}
