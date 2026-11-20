let lastScrollY = window.scrollY;
document.documentElement.classList.add('js');

// The full page remains readable without JavaScript. Reveal only when observed.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
  reveals.forEach(element => observer.observe(element));
} else { reveals.forEach(element => element.classList.add('is-visible')); }

const header = document.getElementById('site-header');
let framePending = false;
function updateHeader() {
  header.classList.toggle('is-scrolled', lastScrollY > 120);
  framePending = false;
}
window.addEventListener('scroll', () => {
  lastScrollY = window.scrollY;
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(updateHeader);
}, { passive: true });
updateHeader();

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) reveals.forEach(element => element.classList.add('is-visible'));
});

const menuButton = document.querySelector('.menu-toggle');
const menu = document.getElementById('mobile-nav');
const main = document.querySelector('main');
function setMenu(open, focusBack = false) {
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  document.body.classList.toggle('menu-open', open);
  main.inert = open;
  if (focusBack) menuButton.focus();
}
menuButton.addEventListener('click', () => setMenu(menu.hidden));
header.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  if (!menu.hidden) setMenu(false);
}));
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  setMenu(false);
  const destination = document.querySelector(link.hash);
  if (destination) { destination.tabIndex = -1; destination.focus({ preventScroll: true }); }
}));
document.addEventListener('keydown', event => {
  if (menu.hidden) return;
  if (event.key === 'Escape') { setMenu(false, true); return; }
  if (event.key === 'Tab') {
    const focusables = [document.querySelector('.brand'), document.querySelector('.header-contact'), menuButton, ...menu.querySelectorAll('a')].filter(el => el.getClientRects().length);
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
window.matchMedia('(min-width: 681px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

// Keep the shortcut visible from the desktop opening without covering its
// controls; the narrower opening and the contact section have their own actions.
const floatingWhatsApp = document.querySelector('.floating-whatsapp');
if (floatingWhatsApp && 'IntersectionObserver' in window) {
  const protectedSections = [document.getElementById('inicio'), document.getElementById('contacto')];
  const mobileShortcut = window.matchMedia('(max-width: 680px)');
  let heroInView = false;
  let contactInView = false;
  const updateShortcut = () => {
    floatingWhatsApp.classList.toggle('on-hero', heroInView);
    floatingWhatsApp.classList.toggle('is-hidden', contactInView || (heroInView && mobileShortcut.matches));
  };
  const guard = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target.id === 'inicio') heroInView = entry.intersectionRatio >= 0.2;
      else contactInView = entry.isIntersecting;
    });
    updateShortcut();
  }, { threshold: [0, 0.2] });
  floatingWhatsApp.classList.add('is-hidden');
  protectedSections.forEach(section => guard.observe(section));
  mobileShortcut.addEventListener('change', updateShortcut);
}


// Keep the accordion predictable in browsers without native details groups.
document.querySelectorAll('.capability').forEach(detail => detail.addEventListener('toggle', () => {
  if (detail.open) document.querySelectorAll('.capability').forEach(other => { if (other !== detail) other.open = false; });
}));

// Reflect the currently visible institutional chapter in the desktop navigation.
if ('IntersectionObserver' in window) {
  const navLinks = [...document.querySelectorAll('.desktop-nav a')];
  const chapters = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-15% 0px -65% 0px' });
  document.querySelectorAll('main>section[id]').forEach(section => chapters.observe(section));
}
