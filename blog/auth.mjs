import {createHmac,timingSafeEqual,scryptSync,createHash} from 'node:crypto';
import {readRecord,writeRecord,configured} from './store.mjs';
import {BlogError} from './model.mjs';
const cookieName='bilab_blog_session';
const secure=()=>Boolean(process.env.VERCEL);
export function authReady(){return configured()&&Boolean(process.env.BLOG_ADMIN_EMAIL&&process.env.BLOG_PASSWORD_HASH&&process.env.BLOG_SESSION_SECRET?.length>=32);}
function equal(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export function verifyPassword(password,stored=process.env.BLOG_PASSWORD_HASH||''){
  const [salt,hash]=stored.split(':');
  if(!salt||!hash||typeof password!=='string'||password.length>256)return false;
  return equal(scryptSync(password,salt,64).toString('hex'),hash);
}
const sign=s=>createHmac('sha256',process.env.BLOG_SESSION_SECRET||'disabled').update(s+process.env.BLOG_PASSWORD_HASH).digest('base64url');
export function sessionCookie(){const payload=Buffer.from(JSON.stringify({email:process.env.BLOG_ADMIN_EMAIL,exp:Date.now()+8*3600e3})).toString('base64url');return `${cookieName}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure()?'; Secure':''}`;}
export function clearCookie(){return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure()?'; Secure':''}`;}
export function isAdmin(req){
  if(!authReady())return false;
  try {const value=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';const [payload,sig]=value.split('.');if(!payload||!sig||!equal(sign(payload),sig))return false;const session=JSON.parse(Buffer.from(payload,'base64url'));return session.email===process.env.BLOG_ADMIN_EMAIL&&session.exp>Date.now();}catch{return false;}
}
export function sameOrigin(req){
  const allowed=process.env.VERCEL?['https://wearebilab.com',...(process.env.VERCEL_URL?[`https://${process.env.VERCEL_URL}`]:[])]:['http://localhost:'+ (process.env.PORT||4328),'http://127.0.0.1:'+(process.env.PORT||4328)];
  if(!allowed.includes(req.headers.origin)||req.headers['x-blog-admin']!=='1'||!String(req.headers['content-type']).startsWith('application/json'))throw new BlogError('Solicitud no autorizada. Recargá el administrador.',403);
}
export async function limitLogin(req){
  const ip=process.env.VERCEL?req.headers['x-vercel-forwarded-for']||'unknown':req.socket?.remoteAddress||'local';
  const key=createHash('sha256').update(String(ip)+process.env.BLOG_SESSION_SECRET).digest('hex');
  const path=`limits/${key}.json`;
  for(let attempt=0;attempt<4;attempt++){
    const r=await readRecord(path),old=r?JSON.parse(r.text):null;
    const record=old&&old.until>Date.now()?old:{count:0,until:Date.now()+15*60e3};
    if(record.count>=8)throw new BlogError('Demasiados intentos. Esperá 15 minutos antes de volver a entrar.',429);
    record.count++;
    try {await writeRecord(path,record,r?.etag);return;}catch(e){if(e.status!==409)throw e;}
  }
  throw new BlogError('Esperá unos minutos antes de volver a entrar.',429);
}
export async function verifyChallenge(token){
  if(!process.env.VERCEL)return;
  if(!process.env.TURNSTILE_SECRET_KEY)throw new BlogError('Falta configurar la protección del acceso.',503);
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY,response:String(token||'')}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!result.success||!['wearebilab.com',process.env.VERCEL_URL].includes(result.hostname))throw new BlogError('Completá la verificación de seguridad e intentá de nuevo.',400);
}
