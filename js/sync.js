/* ============================================================
   NEXIONE / NEXI ONE — sync.js (v2 — synchronisation complète)
   -------------------------------------------------------------
   Le Google Sheet (via google-apps-script/Code.gs) est la SOURCE DE
   VÉRITÉ dès que GOOGLE_SHEETS_ENABLED est actif dans config.js :

   - pull()  : récupère l'état complet depuis le Sheet. Appelé au
     démarrage de chaque page (store.js: NexiStore.bootstrap()),
     AVANT que la page ne s'affiche — c'est ce qui garantit qu'un
     compte créé sur un autre téléphone est visible ici aussi.
   - push movements : après CHAQUE écriture locale (nouvel enfant,
     résultat de défi...), store.js déclenche schedulePush(), qui
     envoie l'état complet (debounce ~900ms pour grouper les
     modifications rapprochées) vers le Sheet via saveAll.
   - Si le réseau coupe, la donnée reste en cache local et le push
     est retenté automatiquement (au retour du réseau, à l'intervalle
     périodique, ou via "Forcer une synchronisation" dans Réglages) —
     rien n'est jamais silencieusement perdu.

   Sans Google Sheets connecté (mode démo), ce fichier ne fait rien :
   tout reste en localStorage comme avant.
   ============================================================ */

(function (global) {
  "use strict";

  var STATUS_KEY = "nexione_sync_status_v2";
  var RETRY_MS = 15000;
  var DEBOUNCE_MS = 900;

  function cfg() { return global.NEXI_CONFIG || {}; }
  function isEnabled() { return !!(cfg().GOOGLE_SHEETS_ENABLED && cfg().APPS_SCRIPT_URL); }

  function loadStatus() {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveStatus(patch) {
    var s = Object.assign(loadStatus(), patch);
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
    return s;
  }

  // ---- PULL : récupère l'état complet depuis le Sheet -----------------------
  function pull() {
    if (!isEnabled()) return Promise.resolve({ ok: false, disabled: true });
    return fetch("/api/execute-script", { 
      method: "POST",
      headers:{"Content-type":"application/json" },
      body: JSON.stringify({ action:"getAll"})
         })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json.ok) throw new Error(json.error || "Réponse invalide du serveur.");
        saveStatus({ lastPullAt: new Date().toISOString(), lastError: null, online: true });
        return json; // { ok, empty, data }
      })
      .catch(function (err) {
        saveStatus({ lastError: String(err && err.message || err), online: false });
        throw err;
      });
  }

  // ---- PUSH : envoie l'état complet (instantané) vers le Sheet --------------
  var pushTimer = null;
  var pushInFlight = false;
  var pushAgainAfter = false;
  var getSnapshot = null; // fournie par store.js via NexiSync.setSnapshotProvider()

  function doPushNow() {
    if (!isEnabled() || !getSnapshot) return Promise.resolve();
    if (pushInFlight) { pushAgainAfter = true; return Promise.resolve(); }
    pushInFlight = true;
    saveStatus({ pushing: true });

    var payload = getSnapshot();
    return fetch("/api/execute-script",{
      method:"POST",
      headers:{"Content-Type": "application/json"},
      body:JSON.stringify({
          action: "saveAll",
          payload: payload
          })
        })
      
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json.ok) throw new Error(json.error || "Échec de sauvegarde.");
        saveStatus({ lastPushAt: new Date().toISOString(), lastError: null, dirty: false, pushing: false, online: true });
      })
      .catch(function (err) {
        saveStatus({ lastError: String(err && err.message || err), dirty: true, pushing: false, online: false });
      })
      .then(function () {
        pushInFlight = false;
        if (pushAgainAfter) { pushAgainAfter = false; schedulePush(); }
      });
  }

  function schedulePush() {
    if (!isEnabled()) return;
    saveStatus({ dirty: true });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPushNow, DEBOUNCE_MS);
  }

  // ---- API publique -----------------------------------------------------------
  var NexiSync = {
    setSnapshotProvider: function (fn) { getSnapshot = fn; },
    pull: pull,
    schedulePush: schedulePush,
    pushNow: function () { clearTimeout(pushTimer); return doPushNow(); },

    status: function () {
      return Object.assign({ enabled: isEnabled() }, loadStatus());
    },

    testConnection: function () {
      if (!isEnabled()) return Promise.reject(new Error("Google Sheets n'est pas activé dans config.js."));
      var url = cfg().APPS_SCRIPT_URL + "?action=ping&_=" + Date.now();
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
    }
  };

  global.NexiSync = NexiSync;

  // Retente un push resté en échec, périodiquement, tant que la page est ouverte.
  if (typeof window !== "undefined") {
    setInterval(function () {
      var st = loadStatus();
      if (st.dirty) doPushNow();
    }, RETRY_MS);
    window.addEventListener("online", function () {
      var st = loadStatus();
      if (st.dirty) doPushNow();
    });
  }
})(typeof window !== "undefined" ? window : this);
