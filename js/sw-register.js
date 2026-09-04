/* ============================================================
   NEXIONE — sw-register.js
   Enregistre le service worker (mode PWA / hors-ligne) sur chaque page.
   Chemin relatif : fonctionne aussi si l'app est servie depuis un
   sous-dossier (ex : https://votre-site.com/nexione/).
   ============================================================ */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    var swUrl = new URL("service-worker.js", document.baseURI).href;
    navigator.serviceWorker.register(swUrl).catch(function (err) {
      console.warn("NEXIONE: service worker non enregistré (probablement en local sans http-server).", err);
    });
  });
})();
