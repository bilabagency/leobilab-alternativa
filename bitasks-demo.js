// Isolated owner-view presentation: synthetic data, no network or storage writes.
(() => {
  const demo = document.querySelector('[data-owner-demo]');
  if (!demo) return;
  const tabs = [...demo.querySelectorAll('[data-owner-tab]')];
  const panels = [...demo.querySelectorAll('[role="tabpanel"]')];
  const motion = demo.querySelector('[data-owner-motion]');
  const announcement = demo.querySelector('[data-owner-announcement]');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const captions = ['Una mirada sobre todo el equipo.', 'El detalle de cada agente.', 'Todo el stock, en perspectiva.'];
  const crumbs = ['Métricas del equipo', 'Agentes / Florencia Acuña', 'Stock de propiedades'];
  const durations = [10000, 9500, 10000];
  let scene = 0, elapsed = 0, previousTime = null, frame = null;
  let userPaused = reduceMotion.matches, visible = false, focused = false, pageHidden = false;

  function canPlay() {
    return !userPaused && !reduceMotion.matches && visible && !focused && !document.hidden && !pageHidden
      && !document.body.classList.contains('menu-open')
      && !document.querySelector('dialog[open]');
  }
  function paintControl() {
    motion.setAttribute('aria-label', (userPaused ? 'Reproducir' : 'Pausar') + ' recorrido de bitasks');
    motion.querySelector('span').textContent = userPaused ? 'Reproducir' : 'Pausar';
    motion.querySelector('use').setAttribute('href', userPaused ? '#play' : '#pause');
    motion.disabled = reduceMotion.matches;
    if (reduceMotion.matches) {
      motion.setAttribute('aria-label', 'Recorrido automático desactivado por movimiento reducido');
      motion.querySelector('span').textContent = 'Sin animación';
    }
  }
  function show(index, manual = false, focusTab = false) {
    if (!Number.isInteger(index) || index < 0 || index >= tabs.length) return;
    scene = index; elapsed = 0; previousTime = null;
    demo.dataset.view = String(index);
    demo.style.setProperty('--owner-progress', '0');
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
      panels[i].inert = i !== index;
      panels[i].setAttribute('aria-hidden', String(i !== index));
    });
    demo.querySelector('[data-owner-crumb]').textContent = crumbs[index];
    demo.querySelector('[data-owner-caption]').textContent = captions[index];
    demo.querySelector('[data-owner-step]').textContent = '0' + (index + 1) + ' / 03';
    if (manual) {
      userPaused = true;
      announcement.textContent = captions[index] + ' Recorrido pausado.';
      // Complete entry motion immediately while exploring manually.
      demo.dataset.manual = 'true';
    } else {
      delete demo.dataset.manual;
    }
    if (focusTab) tabs[index].focus();
    sync();
  }
  function tick(time) {
    frame = null;
    if (!canPlay()) { sync(); return; }
    if (previousTime !== null) elapsed += Math.max(0, Math.min(time - previousTime, 250));
    previousTime = time;
    if (elapsed >= durations[scene]) show((scene + 1) % tabs.length);
    demo.style.setProperty('--owner-progress', String(Math.min(1, elapsed / durations[scene])));
    if (frame === null && canPlay()) frame = requestAnimationFrame(tick);
  }
  function sync() {
    const playing = canPlay();
    demo.dataset.paused = String(!playing);
    paintControl();
    if (!playing) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; previousTime = null;
    } else if (frame === null) {
      previousTime = null;
      frame = requestAnimationFrame(tick);
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => show(index, true));
    tab.addEventListener('keydown', event => {
      let next;
      if (['ArrowRight','ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
      if (['ArrowLeft','ArrowUp'].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); show(next, true, true);
    });
  });
  demo.querySelectorAll('[data-owner-go]').forEach(button => {
    button.addEventListener('click', () => show(Number(button.dataset.ownerGo), true, true));
  });
  motion.addEventListener('click', () => {
    userPaused = !userPaused;
    if (!userPaused) { focused = false; delete demo.dataset.manual; }
    sync();
  });
  const alertButton = demo.querySelector('[data-owner-alerts]');
  alertButton.addEventListener('click', () => {
    userPaused = true;
    const expanded = alertButton.getAttribute('aria-expanded') !== 'true';
    alertButton.setAttribute('aria-expanded', String(expanded));
    demo.querySelector('#owner-alerts').hidden = !expanded;
    demo.dataset.manual = 'true'; sync();
  });
  demo.querySelector('[data-owner-filter]').addEventListener('change', event => {
    userPaused = true;
    const value = event.target.value;
    let count = 0;
    demo.querySelectorAll('[data-property-state]').forEach(card => {
      card.hidden = value !== 'all' && card.dataset.propertyState !== value;
      if (!card.hidden) count++;
    });
    const message = value === 'all'
      ? 'Mostrando 4 de las 8 propiedades del ejemplo.'
      : count + (count === 1 ? ' propiedad coincide' : ' propiedades coinciden') + ' en esta muestra de 4.';
    demo.querySelector('[data-stock-note]').textContent = message;
    announcement.textContent = message;
    demo.dataset.manual = 'true'; sync();
  });
  demo.addEventListener('focusin', event => {
    if (event.target.closest('[data-owner-motion]')) return;
    focused = true; sync();
  });
  demo.addEventListener('focusout', event => {
    if (!demo.contains(event.relatedTarget)) { focused = false; sync(); }
  });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { pageHidden = true; sync(); });
  window.addEventListener('pageshow', () => { pageHidden = false; sync(); });
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) userPaused = true; sync(); });
  new MutationObserver(sync).observe(document.body, {attributes:true, attributeFilter:['class']});
  const dialog = document.querySelector('dialog');
  if (dialog) new MutationObserver(sync).observe(dialog, {attributes:true, attributeFilter:['open']});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting; sync();
    }, {threshold:0}).observe(demo);
  } else { visible = true; }
  show(0);
})();
