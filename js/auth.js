/* ============================================================
   NEXIONE / NEXI ONE — auth.js (page de connexion)
   Portail unique : détecte le rôle après connexion et redirige.
   Charge toujours l'état le plus récent depuis Google Sheets (si
   connecté) avant de vérifier les identifiants — un compte créé sur
   un autre téléphone doit fonctionner ici dès que le réseau est là.
   ============================================================ */

(function () {
  "use strict";
  var U = NexiUtils;

  document.addEventListener("DOMContentLoaded", function () {
    NexiStore.bootstrap().then(function (boot) {
      U.hideLoadingOverlay();
      U.showOfflineBannerIfNeeded(boot);

      // Si déjà connecté, redirection directe
      var current = NexiStore.currentUser();
      if (current) { redirectFor(current); return; }

      var form = document.getElementById("loginForm");
      var errorBox = document.getElementById("loginError");
      var submitBtn = form.querySelector("button[type=submit]");

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var identifiant = document.getElementById("identifiant").value;
        var password = document.getElementById("password").value;

        errorBox.classList.remove("show");
        submitBtn.disabled = true;
        var originalLabel = submitBtn.textContent;
        submitBtn.textContent = "Connexion...";

        // Re-synchronise juste avant de vérifier les identifiants, pour être
        // certain·e de voir un compte tout juste créé sur un autre appareil.
        var refresh = (window.NEXI_CONFIG && window.NEXI_CONFIG.GOOGLE_SHEETS_ENABLED)
          ? NexiStore.bootstrap()
          : Promise.resolve();

        refresh.then(function () {
          var res = NexiStore.login(identifiant, password);
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          if (!res.ok) {
            errorBox.textContent = res.error;
            errorBox.classList.add("show");
            return;
          }
          redirectFor(res.user);
        });
      });

      document.querySelectorAll("[data-demo]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.getElementById("identifiant").value = btn.getAttribute("data-id");
          document.getElementById("password").value = btn.getAttribute("data-pwd");
        });
      });

      // Une fois le Google Sheet réellement branché (config.js), on considère
      // qu'on n'est plus en démo : on cache les raccourcis de comptes de test.
      if (window.NEXI_CONFIG && window.NEXI_CONFIG.GOOGLE_SHEETS_ENABLED) {
        var demoBox = document.getElementById("loginDemoBox");
        if (demoBox) demoBox.style.display = "none";
      }
    });
  });

  function redirectFor(user) {
    if (user.role === "admin") window.location.href = "admin.html";
    else if (user.role === "supervisor") window.location.href = "supervisor.html";
    else window.location.href = "child.html";
  }
})();
