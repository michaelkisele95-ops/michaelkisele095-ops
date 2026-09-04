/* ============================================================
   NEXIONE / NEXI ONE — nav.js
   -------------------------------------------------------------
   "Pages empilées" : cliquer une tuile ouvre UNE page dédiée en plein
   écran (avec un bouton retour), au lieu d'empiler tout le contenu
   sous une grille de tuiles toujours visible. Utilisé par les 3
   dashboards (admin.html, child.html, supervisor.html) pour éviter
   la surcharge d'écran.
   ============================================================ */
(function (global) {
  "use strict";

  function initPageStack(navId, onOpen) {
    var nav = document.getElementById(navId);
    if (!nav) return null;

    function activatePanel(panelId) {
      nav.querySelectorAll(".tile").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      var tile = nav.querySelector('.tile[data-panel="' + panelId + '"]');
      if (tile) tile.classList.add("active");
      var panel = document.getElementById(panelId);
      if (panel) panel.classList.add("active");
      document.body.classList.add("nexi-page-open");
      window.scrollTo(0, 0);
      if (typeof onOpen === "function") onOpen(panelId);
    }

    function goHome() {
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      nav.querySelectorAll(".tile").forEach(function (t) { t.classList.remove("active"); });
      document.body.classList.remove("nexi-page-open");
      window.scrollTo(0, 0);
    }

    nav.querySelectorAll(".tile").forEach(function (tile) {
      tile.addEventListener("click", function () { activatePanel(tile.getAttribute("data-panel")); });
    });

    // Injecte un bouton retour dans chaque page (une seule fois) — inutile
    // de le mettre à la main dans chaque section du HTML.
    document.querySelectorAll(".panel").forEach(function (panel) {
      var head = panel.querySelector(".panel-head");
      if (head && !head.querySelector(".panel-back-btn")) {
        var backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "panel-back-btn";
        backBtn.setAttribute("aria-label", "Retour à l'accueil");
        backBtn.innerHTML = "←";
        backBtn.addEventListener("click", goHome);
        head.insertBefore(backBtn, head.firstChild);
      }
    });

    return { showPanel: activatePanel, goHome: goHome };
  }

  global.NexiNav = { initPageStack: initPageStack };
})(typeof window !== "undefined" ? window : this);
