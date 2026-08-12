// =========================================================
// NEXI ACADEMY — script.js
// Three small, independent behaviors: mobile nav, scroll
// reveal animation, and the footer year. Nothing here talks
// to a server — this site has no backend.
// =========================================================

document.addEventListener('DOMContentLoaded', () => {

  /* ---- 1. Mobile navigation toggle ---- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close the mobile menu after tapping a link
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- 2. Scroll-reveal for elements marked .reveal ---- */
  const revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && revealItems.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealItems.forEach((item) => observer.observe(item));

    // Safety net: if something prevents the observer from ever firing
    // (an old browser quirk, a page that loads already scrolled, etc.),
    // don't let content stay invisible forever.
    window.setTimeout(() => {
      revealItems.forEach((item) => item.classList.add('is-visible'));
    }, 2000);
  } else {
    // Fallback: if IntersectionObserver isn't supported, just show everything
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  /* ---- 3. Footer year ---- */
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

});
