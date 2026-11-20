(() => {
  const hero = document.querySelector('.hero-cinematic');
  if (!hero) return;

  const mediaPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const video = hero.querySelector('#hero-reel');
  const motionControl = hero.querySelector('#motion-toggle');
  const chapters = [...hero.querySelectorAll('[data-story-chapter]')];
  const selectors = [...hero.querySelectorAll('[data-story-select]')];
  const progress = selectors.map(button => button.querySelector('.story-progress'));
  const announcement = hero.querySelector('#story-announcement');
  const instagramCTA = hero.querySelector('#instagram-cta');
  const messages = [...hero.querySelectorAll('[data-chat-at]')];
  const handoff = hero.querySelector('.app-handoff');
  const durations = [6500, 13000, 8000];
  const labels = ['Publicidad: High Park Núñez en una publicación de Instagram.', 'Consulta: dos preguntas de calificación por WhatsApp, sobre destino y presupuesto.', 'Seguimiento: calificación y seguimiento de la consulta en bitasks.'];
  let scene = 0;
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let inView = false;
  let userPaused = mediaPreference.matches;
  let focusedInside = false;
  let pageHidden = false;
  let videoAllowed = false;
  let videoFailed = false;
  let manualPreview = false;
  let lastVisualKey = '';

  const canRun = () => inView && !userPaused && !mediaPreference.matches && !document.hidden && !pageHidden && !focusedInside && !document.body.classList.contains('menu-open') && !document.body.classList.contains('dialog-open');

  function setScene(next, manual = false) {
    scene = next;
    elapsed = 0;
    manualPreview = manual;
    hero.dataset.scene = String(scene);
    chapters.forEach((chapter, index) => {
      chapter.setAttribute('aria-hidden', String(index !== scene));
      chapter.inert = index !== scene;
    });
    selectors.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === scene));
      progress[index].style.transform = 'scaleX(0)';
    });
    if (manual) announcement.textContent = labels[scene];
    if (scene === 0 && video.hasAttribute('src')) video.currentTime = 0;
    updateStory();
    syncVideo();
  }

  function updateStory() {
    // Manual/reduced-motion views show the full conversation for reading.
    const staticChat = manualPreview || mediaPreference.matches;
    const chatTime = scene === 1 ? staticChat ? Infinity : elapsed : -1;
    const shown = messages.filter(message => chatTime >= Number(message.dataset.chatAt)).length;
    const typing = scene === 1 && !staticChat && ((elapsed >= 1600 && elapsed < 3000) || (elapsed >= 6100 && elapsed < 7500));
    const tap = scene === 0 && !staticChat && elapsed >= 5550;
    const key = `${scene}:${shown}:${typing}:${tap}:${staticChat}`;
    if (key !== lastVisualKey) {
      lastVisualKey = key;
      hero.dataset.handoff = tap ? 'tap' : 'idle';
      hero.dataset.chatTyping = String(typing);
      hero.dataset.chatStatic = String(staticChat);
      messages.forEach((message, index) => {
        const visible = index < shown;
        message.hidden = !visible;
        message.setAttribute('aria-hidden', String(!visible));
        message.classList[visible ? 'add' : 'remove']('is-shown');
      });
    }
    const transition = scene === 1 && !staticChat ? Math.min(elapsed / 1050, 1) : 1;
    handoff.style.opacity = String(transition === 1 ? 0 : Math.sin(transition * Math.PI));
    handoff.style.transform = `translateY(${(1 - transition) * 56}px) scale(${.78 + transition * .22})`;
  }

  function syncVideo() {
    const allowed = canRun() && scene === 0 && !navigator.connection?.saveData && !videoFailed;
    if (!allowed) {
      videoAllowed = false;
      video.pause();
      return;
    }
    if (videoAllowed) return;
    videoAllowed = true;
    if (!video.hasAttribute('src')) {
      video.src = video.dataset.src;
      video.load();
    }
    video.play().catch(() => {
      // Autoplay restrictions leave the real property photograph in place.
      videoAllowed = false;
    });
  }

  function tick(now) {
    frame = null;
    if (!canRun()) { previousTime = null; return; }
    if (previousTime !== null) elapsed += Math.min(now - previousTime, 100);
    previousTime = now;
    if (elapsed >= durations[scene]) setScene((scene + 1) % chapters.length);
    updateStory();
    progress[scene].style.transform = `scaleX(${Math.min(elapsed / durations[scene], 1)})`;
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    const playing = canRun();
    hero.dataset.motion = mediaPreference.matches ? 'reduced' : playing ? 'running' : 'paused';
    motionControl.setAttribute('aria-pressed', String(userPaused));
    const label = userPaused ? 'Reanudar animación' : 'Pausar animación';
    motionControl.setAttribute('aria-label', label);
    motionControl.querySelector('span').textContent = label;
    motionControl.querySelector('use').setAttribute('href', userPaused ? '#play' : '#pause');
    motionControl.hidden = mediaPreference.matches;
    updateStory();
    if (playing && frame === null) {
      previousTime = null;
      frame = requestAnimationFrame(tick);
    } else if (!playing && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
    }
    syncVideo();
  }

  selectors.forEach((button, index) => button.addEventListener('click', () => {
    userPaused = true;
    setScene(index, true);
    syncPlayback();
  }));
  motionControl.addEventListener('click', () => {
    userPaused = !userPaused;
    if (!userPaused && manualPreview) setScene(scene);
    syncPlayback();
  });
  instagramCTA.addEventListener('click', () => {
    // This button only runs the local demo; it never opens or sends a message.
    userPaused = false;
    focusedInside = false;
    setScene(1);
    selectors[1].focus({ preventScroll: true });
    syncPlayback();
  });
  video.addEventListener('playing', () => {
    if (!canRun() || scene !== 0) { video.pause(); return; }
    hero.classList.add('has-video');
  });
  video.addEventListener('error', () => {
    videoFailed = true;
    videoAllowed = false;
    hero.classList.remove('has-video');
  });

  hero.querySelector('.hero-story').addEventListener('focusin', () => { focusedInside = true; syncPlayback(); });
  hero.querySelector('.hero-story').addEventListener('focusout', () => {
    queueMicrotask(() => {
      focusedInside = hero.querySelector('.hero-story').contains(document.activeElement);
      syncPlayback();
    });
  });
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('pagehide', () => { pageHidden = true; syncPlayback(); });
  window.addEventListener('pageshow', () => { pageHidden = false; syncPlayback(); });
  mediaPreference.addEventListener('change', () => {
    userPaused = mediaPreference.matches;
    syncPlayback();
  });
  new MutationObserver(syncPlayback).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0 }).observe(hero.querySelector('.hero-story'));
  } else {
    inView = true;
  }
  hero.querySelector('.story-controls').hidden = false;
  instagramCTA.hidden = false;
  hero.classList.add('is-ready');
  setScene(0);
  syncPlayback();
})();
