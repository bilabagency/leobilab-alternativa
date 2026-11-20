import { marked } from 'marked';
import sanitizeHtml from './sanitize-bundle.mjs';

export const SITE = 'https://wearebilab.com';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const slugify = text => String(text).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const plain = text => sanitizeHtml(marked.parse(String(text)), {allowedTags:[],allowedAttributes:{}}).replace(/\s+/g,' ').trim();
export const readTime = text => Math.max(1,Math.ceil(plain(text).split(/\s+/).length/210));
export function safeImage(url) {
  return /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url) || /^\/blog\/media\/[a-f0-9-]+\.(webp|png|jpg)$/.test(url);
}
export function renderMarkdown(md) {
  let count = 0;
  const html=sanitizeHtml(marked.parse(md,{gfm:true}), {
    allowedTags:['p','br','strong','em','h2','h3','h4','ul','ol','li','blockquote','a','img','hr','code','pre','table','thead','tbody','tr','th','td'],
    allowedAttributes:{a:['href','rel'],img:['src','alt','loading','decoding'],h2:['id'],h3:['id'],h4:['id'],ol:['start']},
    allowedSchemes:['https','http','mailto'],allowProtocolRelative:false,
    transformTags:{
      a:(tag,a)=>({tagName:'a',attribs:{href:a.href||'',rel:'noopener noreferrer'}}),
      img:(tag,a)=>({tagName:'img',attribs:{src:safeImage(a.src||'')?a.src:'',alt:a.alt||'',loading:'lazy',decoding:'async'}}),
      h2:()=>({tagName:'h2',attribs:{id:`seccion-${++count}`}}),
    },
    exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src,
  });
  return html.replace(/<img\b[^>]*src="([^"]+)"[^>]*>/g,(tag,src)=>`<a class="image-zoom" href="${src}" target="_blank" rel="noopener noreferrer">${tag}<span>Ver imagen en tamaño completo</span></a>`);
}
export function toc(md) {
  let n=0;
  return [...renderMarkdown(md).matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(m=>({id:m[1],text:sanitizeHtml(m[2],{allowedTags:[],allowedAttributes:{}}),n:++n}));
}
export class BlogError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const field=(data,key,min,max)=>{const s=String(data[key]??'').trim();if(s.length<min||s.length>max)throw new BlogError(`Revisá el campo ${key}: debe tener entre ${min} y ${max} caracteres.`);return s;};
export function validatePost(data,existing,publish=true) {
  const post={
    id:existing?.id||crypto.randomUUID(),
    title:field(data,'title',8,180),slug:field(data,'slug',3,150),excerpt:field(data,'excerpt',publish?30:0,350),
    category:field(data,'category',publish?2:0,60),author:field(data,'author',2,100),
    cover:field(data,'cover',publish?1:0,250),coverAlt:field(data,'coverAlt',publish?5:0,250),body:field(data,'body',publish?50:0,120000),
    status:['draft','published','archived'].includes(data.status)?data.status:'draft',
    tags:[...new Set((Array.isArray(data.tags)?data.tags:[]).map(t=>String(t).trim()).filter(Boolean))],
    date:field(data,'date',10,10),updatedAt:new Date().toISOString(),revision:(existing?.draft?.revision||existing?.revision||0)+1,
  };
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)||['admin','media','feed','sitemap','categoria','etiqueta','preview'].includes(post.slug))throw new BlogError('La dirección debe usar letras minúsculas, números y guiones.');
  if(existing?.published&&post.slug!==existing.published.slug)throw new BlogError('La dirección de una nota publicada no se cambia para conservar sus enlaces.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(post.date)||!Number.isFinite(Date.parse(post.date))||post.date>new Date().toISOString().slice(0,10))throw new BlogError('Elegí una fecha válida, no futura. La publicación programada no está habilitada.');
  if(post.cover&&!safeImage(post.cover))throw new BlogError('Subí una portada desde el administrador.');
  if(post.tags.length>8||post.tags.some(t=>t.length>40))throw new BlogError('Usá hasta 8 etiquetas, de hasta 40 caracteres cada una.');
  return post;
}
export function publishedPosts(catalog){return catalog.entries.map(e=>e.published).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));}
export function filterPosts(posts,{q='',category='',tag='',sort='newest',page=1,limit=9}={}) {
  const norm=s=>String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const terms=norm(q).trim().split(/\s+/).filter(Boolean);
  let found=posts.filter(p=>(!category||slugify(p.category)===category)&&(!tag||p.tags.some(t=>slugify(t)===tag))&&terms.every(t=>norm([p.title,p.excerpt,p.category,...p.tags,plain(p.body)].join(' ')).includes(t)));
  if(sort==='oldest')found=[...found].reverse();
  const total=found.length,pages=Math.max(1,Math.ceil(total/limit));
  page=Math.max(1,Math.min(pages,Number.parseInt(page)||1));
  return {items:found.slice((page-1)*limit,page*limit),total,pages,page};
}
