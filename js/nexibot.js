/**
 * NEXI LAB — nexibot.js
 * Petite bulle d'orientation "façon chimie" : discrète, jamais bloquante,
 * apparaît près d'un clic pour indiquer la prochaine action utile, puis
 * s'efface seule. Ne jamais l'utiliser pour des erreurs (voir toast()).
 */
(function () {
  "use strict";

  const TIPS = {
    login: "Entre ton identifiant et ton mot de passe fournis par l'administrateur.",
    profil: "Clique sur l'avatar pour choisir ton élément.",
    donjons: "Un défi publié ne se tente qu'une seule fois : prends ton temps avant de valider.",
    nexify: "Mise prudemment : une mauvaise réponse fait perdre les NX engagés.",
    cartes: "Choisis un domaine, puis retourne les cartes pour réviser.",
    classement: "Seul ton identifiant apparaît ici, jamais ton vrai nom.",
    savais: "De nouveaux faits apparaissent régulièrement, glisse pour les parcourir.",
  };

  let botEl, msgEl, hideTimer;

  function ensureEl() {
    if (botEl) return;
    botEl = document.createElement("div");
    botEl.id = "nexibot";
    botEl.innerHTML = `
      <div class="bot-msg" id="nexibotMsg"></div>
      <div class="bot-avatar" title="Nexi bot" aria-label="Assistant Nexi">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" fill="#04211d"/>
          <circle cx="12" cy="12" r="9" stroke="#04211d" stroke-width="1.4" stroke-dasharray="2 3"/>
          <circle cx="4" cy="12" r="1.6" fill="#04211d"/>
          <circle cx="20" cy="12" r="1.6" fill="#04211d"/>
        </svg>
      </div>`;
    document.body.appendChild(botEl);
    msgEl = botEl.querySelector("#nexibotMsg");
    botEl.querySelector(".bot-avatar").addEventListener("click", () => {
      const key = document.body.getAttribute("data-section") || "login";
      show(TIPS[key] || "Clique sur un élément pour continuer.");
    });
  }

  function show(text, duration = 4200) {
    ensureEl();
    msgEl.textContent = text;
    msgEl.classList.add("show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => msgEl.classList.remove("show"), duration);
  }

  /** À appeler quand on change de section (donjons, nexify, cartes...) */
  function onSection(sectionKey, silent) {
    document.body.setAttribute("data-section", sectionKey);
    if (!silent && TIPS[sectionKey]) show(TIPS[sectionKey]);
  }

  window.NexiBot = { show, onSection };
})();
