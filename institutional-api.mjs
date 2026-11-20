import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

const companyId = '221ec394-2281-4cc0-9f19-4d833c612088';
const pipelineId = 'eda4478a-4555-4f2b-a702-e5ade92ba9fd';
const ingestUrl = 'https://bitasks.wearebilab.com/api/leads/ingest';
const calendarUrl = 'https://bitasks.wearebilab.com/api/landing-calendar';
const action = 'web_institucional';

function configuration() {
  const hosts = (process.env.TURNSTILE_HOSTNAMES || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  const siteKey = process.env.TURNSTILE_SITE_KEY || '';
  const secretKey = process.env.TURNSTILE_SECRET_KEY || '';
  const ingestSecret = process.env.BITASKS_INGEST_SECRET || '';
  return { hosts, siteKey, secretKey, ingestSecret, ready: Boolean(hosts.length && siteKey && secretKey && ingestSecret) };
}
function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function validOrigin(req, hosts) {
  try {
    const origin = new URL(req.headers.origin || '');
    return ['http:', 'https:'].includes(origin.protocol) && hosts.includes(origin.hostname.toLowerCase()) && (origin.protocol === 'https:' || origin.hostname === 'localhost' || origin.hostname === '127.0.0.1');
  } catch { return false; }
}
async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Formato no válido.'), { status: 415 });
  // Vercel's Node helpers parse JSON bodies before invoking a Function.
  if (req.body !== undefined && req.body !== null) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 16000) throw Object.assign(new Error('La consulta es demasiado extensa.'), { status: 413 });
    try { return JSON.parse(raw); }
    catch { throw Object.assign(new Error('Solicitud no válida.'), { status: 400 }); }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw Object.assign(new Error('La consulta es demasiado extensa.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Solicitud no válida.'), { status: 400 }); }
}
export function validateInstitutionalLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const limits = { firstName: 80, lastName: 80, email: 254, company: 120, message: 2000 };
  const lead = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof body[field] !== 'string') return null;
    const value = body[field].trim();
    if (!value || value.length > limit) return null;
    lead[field] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return null;
  lead.email = lead.email.toLowerCase();
  if (typeof body.wantsCall !== 'boolean') return null;
  lead.wantsCall = body.wantsCall;
  if (typeof body.phone === 'string' && body.phone.trim()) {
    const phone = body.phone.trim();
    const digits = phone.replace(/\D/g, '');
    if (!/^[+\d\s().-]+$/.test(phone) || digits.length < 10 || digits.length > 15 || phone.length > 30) return null;
    lead.phone = phone;
  }
  return lead;
}
function sessionKey(secret) { return createHash('sha256').update(`bilab-institutional:${secret}`).digest(); }
function issueSession(lead, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ lead, id: randomUUID(), expires: Date.now() + 2 * 3600000 })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function readSession(token, secret) {
  if (typeof token !== 'string' || token.length > 20000) throw new Error('invalid_session');
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length < 29) throw new Error('invalid_session');
  const decipher = createDecipheriv('aes-256-gcm', sessionKey(secret), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  if (value.expires < Date.now()) throw new Error('expired_session');
  return value;
}
function payloadForBitasks(lead, stage, event) {
  return {
    company_id: companyId, landing_slug: 'bilab-web-institucional', source: 'institutional_web', fuente: 'Web institucional',
    pipeline: { type: pipelineId, stage },
    contact: { name: `${lead.firstName} ${lead.lastName}`, email: lead.email, phone: lead.phone || '', company_name: lead.company },
    metadata: { consulta_web: lead.message, solicita_llamada: lead.wantsCall, submittedAt: new Date().toISOString(), submissionId: randomUUID(), ...(event ? { booking_start: event.start, calendar_event_id: event.event_id } : {}) },
    skip_capi: true, notify_telegram: false
  };
}
async function bitasksIngest(lead, stage, config, event) {
  const response = await fetch(ingestUrl, {
    method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-ingest-secret': config.ingestSecret },
    body: JSON.stringify(payloadForBitasks(lead, stage, event)), signal: AbortSignal.timeout(8000)
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true || !result.contact_id || !result.pipeline_entry_id) throw new Error('bitasks_ingest_failed');
  return result;
}
async function verifyCaptcha(body, config) {
  if (typeof body.token !== 'string' || !body.token || body.token.length > 2048) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.secretKey, response: body.token }), signal: AbortSignal.timeout(8000)
  });
  const result = await response.json();
  return response.ok && result.success === true && result.action === action && config.hosts.includes(String(result.hostname || '').toLowerCase());
}
async function bookingRequest(actionName, config, values = {}) {
  const response = await fetch(`${calendarUrl}?action=${actionName}`, {
    method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-ingest-secret': config.ingestSecret },
    body: JSON.stringify({ profile: 'diagnostic_web', ...values }), signal: AbortSignal.timeout(25000)
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    const error = new Error('calendar_failed');
    error.status = response.status === 409 || result.error === 'slot_ocupado' ? 409 : 503;
    throw error;
  }
  return result;
}
export async function handleInstitutionalApi(req, res, pathname) {
  const config = configuration();
  if (pathname === '/api/institutional-config') {
    if (req.method !== 'GET') { json(res, 405, { error: 'Método no permitido.' }); return; }
    json(res, 200, { ready: config.ready, siteKey: config.ready ? config.siteKey : '' }); return;
  }
  if (req.method !== 'POST') { json(res, 405, { error: 'Método no permitido.' }); return; }
  if (!config.ready) { json(res, 503, { error: 'El formulario y la agenda todavía no están habilitados. Escribinos a info@wearebilab.com.' }); return; }
  if (!validOrigin(req, config.hosts)) { json(res, 403, { error: 'Solicitud no permitida.' }); return; }
  let body;
  try { body = await readBody(req); }
  catch (error) { json(res, error.status || 400, { error: error.message }); return; }
  if (pathname === '/api/institutional-contact') {
    const lead = validateInstitutionalLead(body);
    if (!lead || body.website || !lead.phone) { json(res, 400, { error: 'Revisá tus datos y completá la verificación de seguridad.' }); return; }
    try {
      if (!await verifyCaptcha(body, config)) { json(res, 400, { error: 'La verificación venció o no es válida. Completala nuevamente.' }); return; }
      await bitasksIngest(lead, 'Consulta recibida', config);
      json(res, 200, { ok: true, session: issueSession(lead, config.ingestSecret) });
    } catch { json(res, 502, { error: 'No pudimos guardar tu consulta en bitasks. Intentá nuevamente o escribinos por mail.' }); }
    return;
  }
  if (pathname === '/api/institutional-booking') {
    if (body.action === 'slots') {
      try {
        const result = await bookingRequest('slots', config);
        if (result.fuente !== 'google' || !Array.isArray(result.dias)) throw new Error('invalid_availability');
        json(res, 200, { ok: true, days: result.dias });
      } catch { json(res, 503, { error: 'No pudimos consultar los horarios. Tocá Actualizar horarios para reintentar.' }); }
      return;
    }
    if (body.action !== 'book') { json(res, 400, { error: 'Solicitud no válida.' }); return; }
    let session;
    try { session = readSession(body.session, config.ingestSecret); }
    catch { json(res, 401, { error: 'Tu sesión venció. Conservamos los datos visibles; completá la verificación para continuar.' }); return; }
    if (!session.lead.wantsCall || typeof body.start !== 'string' || !Number.isFinite(Date.parse(body.start))) { json(res, 400, { error: 'Elegí un horario válido.' }); return; }
    try {
      const lead = session.lead;
      const result = await bookingRequest('book', config, {
        start: body.start, nombre: lead.firstName, apellido: lead.lastName, email: lead.email,
        telefono: lead.phone || '', empresa: lead.company, notas: lead.message, bookingId: session.id
      });
      if (!result.event_id || !result.start) throw new Error('invalid_booking');
      let crmSynced = false;
      try { await bitasksIngest(lead, 'Llamada agendada', config, result); crmSynced = true; } catch { /* The calendar booking remains confirmed. */ }
      json(res, 200, { ok: true, start: result.start, end: result.end, meetUrl: result.meet_url, crmSynced });
    } catch (error) {
      json(res, error.status === 409 ? 409 : 503, { error: error.status === 409 ? 'Ese horario acaba de ocuparse. Elegí otro.' : 'No pudimos verificar la reserva. Intentá nuevamente con el mismo horario para no duplicarla.' });
    }
    return;
  }
  json(res, 404, { error: 'No encontrado.' });
}
