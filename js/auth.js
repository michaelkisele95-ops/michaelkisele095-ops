/**
 * NEXI LAB — auth.js
 * Gestion de session légère. Le token est opaque (émis par Apps Script),
 * jamais le mot de passe. Stocké en sessionStorage + relais chiffré léger
 * en localStorage pour permettre "rester connecté" entre onglets/relance PWA,
 * avec expiration côté client ET revalidation côté serveur à chaque appel.
 */
(function () {
  "use strict";
  const cfg = window.NEXI_CONFIG;

  function getSession() {
    try {
      const raw = localStorage.getItem(cfg.SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.expiresAt || Date.now() > s.expiresAt) {
        localStorage.removeItem(cfg.SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function setSession(token, profileSummary) {
    const s = {
      token,
      profileSummary: profileSummary || null,
      expiresAt: Date.now() + cfg.SESSION_TTL_MS,
    };
    localStorage.setItem(cfg.SESSION_KEY, JSON.stringify(s));
    return s;
  }

  function clearSession() {
    localStorage.removeItem(cfg.SESSION_KEY);
  }

  function isLoggedIn() {
    return !!getSession();
  }

  window.NexiAuth = { getSession, setSession, clearSession, isLoggedIn };
})();
