const institutionalForm = document.getElementById('institutional-form');
const institutionalCalendar = document.getElementById('institutional-calendar');
const institutionalDays = document.getElementById('institutional-days');
const institutionalCalendarStatus = document.getElementById('institutional-calendar-status');
const institutionalFormStatus = document.getElementById('institutional-form-status');
const institutionalCaptchaStatus = document.getElementById('institutional-captcha-status');
const institutionalSelected = document.getElementById('institutional-selected');
const institutionalSubmit = institutionalForm.querySelector('[type="submit"]');
const institutionalBookingChoice = institutionalForm.querySelectorAll('[name="wantsCall"]');
const institutionalSaved = document.getElementById('institutional-saved');
const institutionalEdit = document.getElementById('institutional-edit');
const institutionalContactFields = ['firstName', 'lastName', 'email', 'phone', 'company', 'message'];

let institutionalConfig = { ready: false, siteKey: '' };
let institutionalCaptcha = '';
let institutionalWidget;
let institutionalSession = '';
let institutionalSlots = [];
let institutionalPage = 0;
let institutionalDayIndex = 0;
let institutionalStart = '';
let institutionalBusy = false;
let institutionalComplete = false;

function institutionalLockSaved(locked, showSaved = locked) {
  institutionalSaved.hidden = !showSaved;
  institutionalContactFields.forEach(name => { institutionalForm.elements[name].readOnly = locked; });
}
institutionalEdit.addEventListener('click', () => {
  if (institutionalBusy || institutionalComplete) return;
  institutionalSession = '';
  institutionalCaptcha = '';
  institutionalLockSaved(false);
  if (window.turnstile && institutionalWidget !== undefined) window.turnstile.reset(institutionalWidget);
  institutionalStatus(institutionalFormStatus, 'Corregí tus datos y completá la verificación otra vez para confirmar la llamada.');
  institutionalForm.elements.firstName.focus();
});

function institutionalStatus(node, message, type = '') {
  node.textContent = message;
  node.classList.toggle('is-error', type === 'error');
  node.classList.toggle('is-success', type === 'success');
}
function institutionalDate(date, options) {
  return new Date(date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', ...options });
}
function institutionalTime(date) {
  return new Date(date).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false });
}
function institutionalElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
function renderInstitutionalSlots(focusDay = false) {
  institutionalDays.replaceChildren();
  if (!institutionalSlots.length) return;
  const nav = institutionalElement('div', 'institutional-day-nav');
  for (const [label, delta] of [['Días anteriores', -4], ['Más días', 4]]) {
    const button = institutionalElement('button', '', label);
    button.type = 'button';
    button.disabled = delta < 0 ? institutionalPage === 0 : institutionalPage + 4 >= institutionalSlots.length;
    button.addEventListener('click', () => { institutionalPage += delta; institutionalDayIndex = institutionalPage; renderInstitutionalSlots(true); });
    nav.append(button);
  }
  institutionalDays.append(nav);
  const days = institutionalElement('div', 'institutional-day-picker');
  days.setAttribute('role', 'group');
  days.setAttribute('aria-label', 'Días disponibles');
  institutionalSlots.slice(institutionalPage, institutionalPage + 4).forEach((day, offset) => {
    const index = institutionalPage + offset;
    const date = `${day.fecha}T12:00:00-03:00`;
    const button = institutionalElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(index === institutionalDayIndex));
    button.setAttribute('aria-label', institutionalDate(date, { weekday: 'long', day: 'numeric', month: 'long' }));
    button.append(
      institutionalElement('span', '', institutionalDate(date, { weekday: 'short' }).replace('.', '')),
      institutionalElement('strong', '', institutionalDate(date, { day: 'numeric' })),
      institutionalElement('span', '', institutionalDate(date, { month: 'short' }).replace('.', ''))
    );
    button.addEventListener('click', () => { institutionalDayIndex = index; renderInstitutionalSlots(true); });
    days.append(button);
  });
  institutionalDays.append(days);
  const day = institutionalSlots[institutionalDayIndex];
  const title = institutionalElement('p', 'institutional-day-title', institutionalDate(`${day.fecha}T12:00:00-03:00`, { weekday: 'long', day: 'numeric', month: 'long' }));
  institutionalDays.append(title);
  const grid = institutionalElement('div', 'institutional-slot-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `Horarios para ${title.textContent}`);
  day.slots.forEach(slot => {
    const button = institutionalElement('button', '', slot.hora);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(institutionalStart === slot.start));
    button.setAttribute('aria-label', `${title.textContent} a las ${slot.hora}`);
    button.addEventListener('click', () => {
      institutionalStart = slot.start;
      institutionalSelected.hidden = false;
      institutionalSelected.textContent = `Elegiste ${institutionalDate(slot.start, { weekday: 'long', day: 'numeric', month: 'long' })}, ${institutionalTime(slot.start)} h (Argentina).`;
      renderInstitutionalSlots();
      institutionalDays.querySelector('.institutional-slot-grid [aria-pressed="true"]')?.focus({ preventScroll: true });
      institutionalStatus(institutionalFormStatus, '');
    });
    grid.append(button);
  });
  institutionalDays.append(grid);
  if (focusDay) days.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}
async function institutionalJson(url, body, timeoutMs) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'No pudimos completar la conexión.'); error.status = response.status; throw error; }
  return data;
}
async function loadInstitutionalSlots() {
  const reload = document.getElementById('institutional-reload');
  reload.disabled = true;
  institutionalDays.replaceChildren();
  institutionalStatus(institutionalCalendarStatus, 'Consultando horarios disponibles…');
  try {
    await initInstitutionalContact();
    if (!institutionalConfig.ready) throw new Error('La agenda de Bautista todavía no está conectada en este sitio. Escribinos a info@wearebilab.com para coordinar.');
    const data = await institutionalJson('/api/institutional-booking', { action: 'slots' }, 30000);
    institutionalSlots = (data.days || []).filter(day => Array.isArray(day.slots) && day.slots.length);
    institutionalPage = 0; institutionalDayIndex = 0;
    renderInstitutionalSlots();
    institutionalStatus(institutionalCalendarStatus, institutionalSlots.length ? 'Elegí un día y un horario. Conservaremos los datos que escribiste arriba.' : 'No hay horarios disponibles en las próximas tres semanas. Escribinos para coordinar.');
  } catch (error) {
    institutionalStatus(institutionalCalendarStatus, error.name === 'TimeoutError' ? 'La agenda tardó demasiado. Tocá Actualizar horarios para reintentar.' : error.message, 'error');
  } finally { reload.disabled = !institutionalConfig.ready; }
}
document.getElementById('institutional-reload').addEventListener('click', loadInstitutionalSlots);
institutionalBookingChoice.forEach(radio => radio.addEventListener('change', () => {
  const wantsCall = institutionalForm.elements.wantsCall.value === 'yes';
  institutionalCalendar.hidden = !wantsCall;
  institutionalSubmit.firstChild.textContent = wantsCall ? 'Enviar consulta y confirmar llamada ' : 'Enviar consulta ';
  if (wantsCall && !institutionalSlots.length) loadInstitutionalSlots();
  institutionalStatus(institutionalFormStatus, '');
}));
institutionalForm.querySelectorAll('input:not([name="website"]),textarea').forEach(field => {
  field.addEventListener('input', () => { field.removeAttribute('aria-invalid'); if (!institutionalSession) institutionalStatus(institutionalFormStatus, ''); });
});

function setupInstitutionalCaptcha() {
  if (!institutionalConfig.ready) return;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = () => {
    institutionalWidget = window.turnstile.render('#institutional-captcha', {
      sitekey: institutionalConfig.siteKey, action: 'web_institucional', theme: 'dark', size: 'flexible', language: 'es',
      callback: token => { institutionalCaptcha = token; institutionalStatus(institutionalCaptchaStatus, ''); },
      'expired-callback': () => { institutionalCaptcha = ''; institutionalStatus(institutionalCaptchaStatus, 'La verificación venció. Volvé a completarla.', 'error'); },
      'error-callback': () => { institutionalCaptcha = ''; institutionalStatus(institutionalCaptchaStatus, 'No se pudo cargar la verificación. Recargá la página o escribinos por mail.', 'error'); }
    });
  };
  script.onerror = () => institutionalStatus(institutionalCaptchaStatus, 'No se pudo cargar la verificación. Recargá la página o escribinos por mail.', 'error');
  document.head.append(script);
}
let institutionalInitStarted = false;
let institutionalInitPromise;
function initInstitutionalContact() {
  if (institutionalInitStarted) return institutionalInitPromise;
  institutionalInitStarted = true;
  institutionalInitPromise = fetch('/api/institutional-config', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => {
  if (data?.ready) { institutionalConfig = data; institutionalSubmit.disabled = false; document.getElementById('institutional-reload').disabled = false; setupInstitutionalCaptcha(); }
  else institutionalStatus(institutionalCaptchaStatus, 'Estamos habilitando este formulario. Mientras tanto, escribinos a info@wearebilab.com.');
  }).catch(() => institutionalStatus(institutionalCaptchaStatus, 'No pudimos cargar el formulario. Escribinos a info@wearebilab.com.', 'error'));
  return institutionalInitPromise;
}
// Do not load third-party CAPTCHA on the opening screen, far from the form.
// The observer also handles direct links to #contacto; focus is a keyboard fallback.
if ('IntersectionObserver' in window) {
  const contactObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      initInstitutionalContact();
      contactObserver.disconnect();
    }
  }, {rootMargin:'600px 0px'});
  contactObserver.observe(document.getElementById('institutional-contact'));
} else initInstitutionalContact();
institutionalForm.addEventListener('focusin', initInstitutionalContact, {once:true});

institutionalForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (institutionalBusy || institutionalComplete) return;
  const wantsCall = institutionalForm.elements.wantsCall.value === 'yes';
  const fields = institutionalContactFields;
  for (const name of fields) {
    const field = institutionalForm.elements[name];
    if (!field.value.trim() || !field.checkValidity()) { field.setAttribute('aria-invalid', 'true'); field.focus(); field.reportValidity(); institutionalStatus(institutionalFormStatus, 'Revisá los campos marcados antes de enviar.', 'error'); return; }
  }
  const phone = institutionalForm.elements.phone;
  const digits = phone.value.replace(/\D/g, '');
  if (!/^[+\d\s().-]+$/.test(phone.value.trim()) || digits.length < 10 || digits.length > 15) {
    phone.setAttribute('aria-invalid', 'true'); phone.focus();
    institutionalStatus(institutionalFormStatus, 'Ingresá un teléfono válido, con código de país y de área.', 'error'); return;
  }
  if (wantsCall && !institutionalStart) { institutionalStatus(institutionalFormStatus, 'Elegí un horario para continuar con la llamada.', 'error'); institutionalCalendar.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (!institutionalConfig.ready) { institutionalStatus(institutionalFormStatus, 'El formulario todavía no está habilitado. Escribinos a info@wearebilab.com.', 'error'); return; }
  if (!institutionalSession && !institutionalCaptcha) { institutionalStatus(institutionalFormStatus, 'Completá la verificación de seguridad para enviar tu consulta.', 'error'); return; }
  institutionalBusy = true; institutionalSubmit.disabled = true;
  institutionalLockSaved(true, Boolean(institutionalSession));
  institutionalEdit.disabled = true;
  institutionalBookingChoice.forEach(radio => { radio.disabled = true; });
  institutionalStatus(institutionalFormStatus, wantsCall ? 'Guardando tu consulta y confirmando el horario…' : 'Enviando tu consulta…');
  try {
    if (!institutionalSession) {
      const payload = Object.fromEntries(fields.map(name => [name, institutionalForm.elements[name].value.trim()]));
      payload.wantsCall = wantsCall;
      payload.website = institutionalForm.elements.website.value;
      payload.token = institutionalCaptcha;
      const saved = await institutionalJson('/api/institutional-contact', payload, 20000);
      institutionalSession = saved.session || '';
      if (window.gtag) gtag('event', 'generate_lead', { method: 'formulario', page_path: location.pathname });
      if (wantsCall && institutionalSession) institutionalLockSaved(true);
    }
    if (wantsCall) {
      const result = await institutionalJson('/api/institutional-booking', { action: 'book', session: institutionalSession, start: institutionalStart }, 45000);
      if (window.gtag) gtag('event', 'booking_confirmed', { page_path: location.pathname });
      institutionalStatus(institutionalFormStatus, `Tu consulta y llamada quedaron confirmadas para el ${institutionalDate(result.start, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${institutionalTime(result.start)} h. Te llegará la invitación por mail.`, 'success');
    } else institutionalStatus(institutionalFormStatus, 'Recibimos tu consulta. El equipo de bi.lab se pondrá en contacto por mail.', 'success');
    institutionalComplete = true;
    institutionalSaved.hidden = true;
    institutionalBookingChoice.forEach(radio => { radio.disabled = true; });
  } catch (error) {
    if (error.status === 409) { institutionalStart = ''; institutionalSelected.hidden = true; renderInstitutionalSlots(); institutionalStatus(institutionalFormStatus, 'Ese horario acaba de ocuparse. Elegí otro; conservamos tus datos.', 'error'); }
    else if (error.status === 401) { institutionalSession = ''; institutionalLockSaved(false); institutionalStatus(institutionalFormStatus, 'Tu sesión venció. Conservamos los datos escritos; completá la verificación otra vez para confirmar.', 'error'); }
    else institutionalStatus(institutionalFormStatus, error.name === 'TimeoutError' ? 'La conexión tardó demasiado. Podés reintentar sin volver a completar los campos.' : error.message, 'error');
  } finally {
    institutionalBusy = false; institutionalSubmit.disabled = institutionalComplete || !institutionalConfig.ready;
    if (!institutionalSession && !institutionalComplete) institutionalLockSaved(false);
    institutionalEdit.disabled = institutionalComplete || !institutionalSession;
    if (!institutionalComplete) institutionalBookingChoice.forEach(radio => { radio.disabled = false; });
    institutionalCaptcha = '';
    if (!institutionalSession && window.turnstile && institutionalWidget !== undefined) window.turnstile.reset(institutionalWidget);
  }
});
