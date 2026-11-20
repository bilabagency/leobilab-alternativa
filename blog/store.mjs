import {get,put} from '@vercel/blob';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {BlogError} from './model.mjs';
const local=()=>!process.env.VERCEL&&process.env.BLOG_LOCAL_DIR;
export const configured=()=>Boolean(local()||process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);
export async function readRecord(path) {
  if(local()){
    try {const text=await readFile(join(local(),path));return {text,etag:createHash('sha256').update(text).digest('hex')};}catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  const result=await get(`blog/${path}`,{access:'private',useCache:false});
  if(!result)return null;
  return {text:Buffer.from(await new Response(result.stream).arrayBuffer()),etag:result.blob.etag,contentType:result.blob.contentType};
}
export async function writeRecord(path,value,etag,contentType='application/json') {
  const text=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value));
  if(local()){
    const old=await readRecord(path);
    if((etag&&old?.etag!==etag)||(!etag&&old))throw new BlogError('Otra sesión guardó cambios. Recargá antes de continuar.',409);
    const dest=join(local(),path);await mkdir(join(dest,'..'),{recursive:true});
    const temp=`${dest}.${randomUUID()}.tmp`;await writeFile(temp,text,{mode:0o600});await rename(temp,dest);
    return createHash('sha256').update(text).digest('hex');
  }
  try {const result=await put(`blog/${path}`,text,{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{}),contentType,cacheControlMaxAge:60});return result.etag;}
  catch(e){if(/precondition|already exists/i.test(e.message))throw new BlogError('Otra sesión guardó cambios. Recargá antes de continuar.',409);throw e;}
}
export async function readCatalog(){
  if(configured()){
    const r=await readRecord('catalog.json');
    if(r)return {catalog:JSON.parse(r.text),etag:r.etag};
  }
  return {catalog:JSON.parse(await readFile(new URL('./seed.json',import.meta.url),'utf8')),etag:null};
}
export async function saveCatalog(catalog,etag){
  if(!configured())throw new BlogError('El almacenamiento del blog todavía no está conectado.',503);
  await writeRecord(`revisions/${Date.now()}-${randomUUID()}.json`,catalog,null);
  return await writeRecord('catalog.json',catalog,etag);
}
