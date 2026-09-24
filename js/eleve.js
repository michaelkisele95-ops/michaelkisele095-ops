/**
 * NEXI LAB — eleve.js
 * Logique du panel joueur (Nexian). Un seul écran visible à la fois
 * (voir .screen / .tabbar dans eleve.html) — pas de listes interminables :
 * chaque section charge son propre contenu à la demande.
 */
(function () {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(msg) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function showScreen(name) {
    $$(".screen").forEach((s) => (s.hidden = s.dataset.screen !== name));
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.target === name));
    window.NexiBot && window.NexiBot.onSection(name);
    const loaders = { profil: loadProfile, donjons: loadDungeons, nexify: loadNexify, cartes: loadCartesHome, classement: loadLeaderboard };
    loaders[name] && loaders[name]();
  }

  function setNXPill(nx) {
    const el = $("#nxPill");
    if (el) el.textContent = `${Math.round(nx)} NX`;
  }

  // ---------- Profil ----------
  async function loadProfile() {
    const box = $("#profilContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div><div class="mt8">Chargement du profil…</div></div>`;
    try {
      const p = await window.NexiAPI.getProfile();
      setNXPill(p.nx);
      const lvl = window.NexiLogic.levelFromNX(p.nx);
      box.innerHTML = `
        <div class="card center">
          <img src="icons/avatars/${p.avatarId || 'H'}.svg" alt="Avatar" style="width:84px;height:84px;border-radius:18px;box-shadow:var(--shadow-1);" id="avatarImg">
          <h2 class="mt8 mb0">${p.identifiant}</h2>
          <div class="muted">Niveau ${lvl.level} · ${p.nx} NX</div>
          <div class="progress mt8"><span style="width:${lvl.progressPct}%"></span></div>
          <button class="btn btn-ghost mt16" id="btnChangeAvatar">Changer d'avatar</button>
        </div>
        <div class="card">
          <div class="row between"><strong>Meilleur score</strong><span class="badge badge-gold">${p.bestScore ?? 0} NX</span></div>
          <div class="mt16" id="nxChart"></div>
        </div>
        <div class="card">
          <strong>Le saviez-vous ?</strong>
          <div id="factsCarousel" class="mt8 muted">Chargement…</div>
        </div>`;
      renderChart($("#nxChart"), p.history || []);
      $("#btnChangeAvatar").addEventListener("click", () => openAvatarPicker(p.avatarId));
      loadFacts();
    } catch (e) {
      box.innerHTML = `<div class="state-msg">${e.message}</div>`;
    }
  }

  function renderChart(container, history) {
    if (!history.length) { container.innerHTML = `<div class="muted">Ta progression apparaîtra ici après ton premier défi.</div>`; return; }
    const w = 280, h = 90, pad = 6;
    const max = Math.max(...history.map((p) => p.nx), 10);
    const step = (w - pad * 2) / Math.max(1, history.length - 1);
    const pts = history.map((p, i) => `${pad + i * step},${h - pad - (p.nx / max) * (h - pad * 2)}`).join(" ");
    container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">
      <polyline points="${pts}" fill="none" stroke="var(--cyan)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  async function openAvatarPicker(current) {
    const modal = document.createElement("div");
    modal.className = "card";
    modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    const elements = ["H","O","P","S","Ru","C","N","Fe","Cu","Au","Ag","Zn"];
    modal.innerHTML = `<div class="row between"><strong>Choisis ton élément</strong><button class="btn btn-sm btn-ghost" id="closeAv">Fermer</button></div>
      <div class="mt16" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${elements.map((e) => `<img data-el="${e}" src="icons/avatars/${e}.svg" style="width:100%;border-radius:14px;cursor:pointer;border:2px solid ${e===current?'var(--cyan)':'transparent'}">`).join("")}
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("#closeAv").onclick = () => modal.remove();
    $$('img[data-el]', modal).forEach((img) => img.addEventListener("click", async () => {
      try { await window.NexiAPI.setAvatar(img.dataset.el); modal.remove(); loadProfile(); toast("Avatar mis à jour."); }
      catch (e) { toast(e.message); }
    }));
  }

  // ---------- Le saviez-vous ----------
  let factsCache = [], factIdx = 0, factTimer = null;
  async function loadFacts() {
    const el = $("#factsCarousel");
    if (!el) return;
    try {
      factsCache = await window.NexiAPI.listFacts();
      if (!factsCache.length) { el.textContent = "Reviens bientôt pour un nouveau fait."; return; }
      factIdx = 0;
      renderFact();
      clearInterval(factTimer);
      factTimer = setInterval(() => { factIdx = (factIdx + 1) % factsCache.length; renderFact(); }, 6000);
    } catch (e) { el.textContent = "—"; }
  }
  function renderFact() {
    const el = $("#factsCarousel");
    if (el && factsCache[factIdx]) el.textContent = factsCache[factIdx].texte;
  }

  // ---------- Donjons ----------
  async function loadDungeons() {
    const box = $("#donjonsContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
    try {
      const list = await window.NexiAPI.listDungeons();
      if (!list.length) { box.innerHTML = `<div class="state-msg">Aucun défi disponible pour l'instant. Reviens plus tard !</div>`; return; }
      box.innerHTML = `<div class="list-flat">${list.map(d => `
        <div class="card row between">
          <div>
            <div><strong>${d.titre}</strong></div>
            <div class="muted" style="font-size:.8rem">${d.categorie} · ${d.nbQuestions} question(s)</div>
          </div>
          ${d.dejaFait
            ? `<span class="badge badge-cyan">Fait</span>`
            : `<button class="btn btn-primary btn-sm" data-open="${d.id}">Jouer</button>`}
        </div>`).join("")}</div>`;
      $$('[data-open]', box).forEach((b) => b.addEventListener("click", () => openDungeon(b.dataset.open, list)));
    } catch (e) { box.innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  async function openDungeon(id, list) {
    const d = list.find((x) => x.id === id);
    if (!d) return;
    let qi = 0, answers = [], started = Date.now();
    const modal = document.createElement("div");
    modal.className = "card";
    modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    document.body.appendChild(modal);

    function renderQ() {
      const q = d.questions[qi];
      modal.innerHTML = `
        <div class="row between"><span class="badge badge-magenta">Question ${qi + 1}/${d.questions.length}</span><span class="muted" id="dTimer">${q.tempsLimite}s</span></div>
        <h3 class="mt16">${q.enonce}</h3>
        <div class="list-flat mt16">${q.options.map((o, i) => `<button class="btn btn-ghost" data-opt="${i}">${o}</button>`).join("")}</div>`;
      $$('[data-opt]', modal).forEach((b) => b.addEventListener("click", () => {
        answers.push({ questionId: q.id, optionIndex: Number(b.dataset.opt), tempsMs: Date.now() - qStart });
        qi++;
        if (qi < d.questions.length) { qStart = Date.now(); renderQ(); } else finish();
      }));
      let remaining = q.tempsLimite;
      clearInterval(modal._t);
      modal._t = setInterval(() => {
        remaining--;
        const tEl = $("#dTimer", modal);
        if (tEl) tEl.textContent = remaining + "s";
        if (remaining <= 0) { clearInterval(modal._t); answers.push({ questionId: q.id, optionIndex: -1, tempsMs: q.tempsLimite * 1000 }); qi++; qi < d.questions.length ? (qStart = Date.now(), renderQ()) : finish(); }
      }, 1000);
    }
    let qStart = Date.now();
    async function finish() {
      clearInterval(modal._t);
      modal.innerHTML = `<div class="state-msg"><div class="spinner"></div><div class="mt8">Validation…</div></div>`;
      try {
        const res = await window.NexiAPI.submitDungeonAttempt(d.id, answers, Math.round((Date.now() - started) / 1000));
        modal.innerHTML = `<div class="center card">
          <div style="font-size:2rem">${res.nxGagne > 0 ? "🏆" : "🧪"}</div>
          <h3>${res.nxGagne > 0 ? "Défi réussi !" : "Défi terminé"}</h3>
          <div class="badge badge-gold mt8">+${res.nxGagne} NX</div>
          <button class="btn btn-primary mt16" id="closeD">Continuer</button>
        </div>`;
        $("#closeD", modal).onclick = () => { modal.remove(); loadDungeons(); loadProfile(); };
      } catch (e) { toast(e.message); modal.remove(); }
    }
    renderQ();
  }

  // ---------- Nexify ----------
  async function loadNexify() {
    const box = $("#nexifyContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
    try {
      const cards = await window.NexiAPI.listNexifyCards();
      if (!cards.length) { box.innerHTML = `<div class="state-msg">Aucune carte Nexify disponible pour le moment.</div>`; return; }
      box.innerHTML = `<div class="list-flat">${cards.map(c => `
        <div class="card">
          <div class="row between"><span class="badge badge-magenta">x${c.multiplicateur}</span><span class="muted">${c.categorie}</span></div>
          <button class="btn btn-primary mt16" data-card="${c.id}">Miser & Jouer</button>
        </div>`).join("")}</div>`;
      $$('[data-card]', box).forEach((b) => b.addEventListener("click", () => playCardFlow(b.dataset.card, cards)));
    } catch (e) { box.innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  async function playCardFlow(id, cards) {
    const c = cards.find((x) => x.id === id);
    const profil = await window.NexiAPI.getProfile();
    const modal = document.createElement("div");
    modal.className = "card";
    modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    document.body.appendChild(modal);
    modal.innerHTML = `
      <strong>Combien de NX misez-vous ?</strong>
      <div class="muted mt8">Solde actuel : ${profil.nx} NX · Multiplicateur x${c.multiplicateur}</div>
      <div class="field mt16"><input type="number" id="betInput" min="1" max="${profil.nx}" value="${Math.min(50, profil.nx)}"></div>
      <button class="btn btn-primary" id="btnRevealCard">Miser et révéler la carte</button>`;
    $("#btnRevealCard", modal).addEventListener("click", () => {
      const bet = Number($("#betInput", modal).value);
      if (!bet || bet <= 0 || bet > profil.nx) { toast("Mise invalide."); return; }
      revealQuestion(bet);
    });
    function revealQuestion(bet) {
      modal.innerHTML = `<h3>${c.question}</h3><div class="list-flat mt16">${c.options.map((o, i) => `<button class="btn btn-ghost" data-a="${i}">${o}</button>`).join("")}</div>`;
      $$('[data-a]', modal).forEach((b) => b.addEventListener("click", async () => {
        modal.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
        try {
          const res = await window.NexiAPI.playNexifyCard(c.id, bet, Number(b.dataset.a));
          modal.innerHTML = `<div class="center">
            <div style="font-size:2rem">${res.gagne ? "✨" : "💥"}</div>
            <h3>${res.gagne ? "Carte gagnante !" : "Pas cette fois"}</h3>
            <div class="badge ${res.gagne ? 'badge-gold' : 'badge-magenta'} mt8">${res.delta >= 0 ? "+" : ""}${res.delta} NX</div>
            <button class="btn btn-primary mt16" id="closeN">Continuer</button>
          </div>`;
          $("#closeN", modal).onclick = () => { modal.remove(); loadNexify(); loadProfile(); };
        } catch (e) { toast(e.message); modal.remove(); }
      }));
    }
  }

  // ---------- Cartes de révision ----------
  async function loadCartesHome() {
    const box = $("#cartesContent");
    box.innerHTML = `<div class="list-flat">${window.NEXI_CONFIG.ELEMENT_CATEGORIES.map(cat => `
      <button class="btn btn-ghost" data-cat="${cat}">${cat}</button>`).join("")}</div>`;
    $$('[data-cat]', box).forEach((b) => b.addEventListener("click", () => openRevision(b.dataset.cat)));
  }
  async function openRevision(cat) {
    const box = $("#cartesContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
    try {
      const cards = await window.NexiAPI.listRevisionCards(cat);
      if (!cards.length) { box.innerHTML = `<div class="state-msg">Pas encore de cartes dans ce domaine.</div><button class="btn btn-ghost mt16" id="backCat">Retour</button>`; $("#backCat").onclick = loadCartesHome; return; }
      let i = 0, flipped = false;
      function render() {
        const c = cards[i];
        box.innerHTML = `
          <div class="row between"><span class="badge badge-cyan">${cat}</span><span class="muted">${i + 1}/${cards.length}</span></div>
          <div class="card mt16 center" id="flipCard" style="min-height:160px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
            <div>${flipped ? c.reponse + (c.explication ? `<div class="muted mt8" style="font-size:.8rem">${c.explication}</div>` : "") : c.recto}</div>
          </div>
          <div class="row mt16"><button class="btn btn-ghost" id="prevC">◀</button><button class="btn btn-primary" id="flipBtn">${flipped ? "Question" : "Réponse"}</button><button class="btn btn-ghost" id="nextC">▶</button></div>
          <button class="btn btn-ghost mt16" id="backCat">Retour aux domaines</button>`;
        $("#flipCard").onclick = $("#flipBtn").onclick = () => { flipped = !flipped; render(); };
        $("#prevC").onclick = () => { i = (i - 1 + cards.length) % cards.length; flipped = false; render(); };
        $("#nextC").onclick = () => { i = (i + 1) % cards.length; flipped = false; render(); };
        $("#backCat").onclick = loadCartesHome;
      }
      render();
    } catch (e) { box.innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  // ---------- Classement ----------
  async function loadLeaderboard() {
    const box = $("#classementContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
    try {
      const rows = await window.NexiAPI.getLeaderboard();
      box.innerHTML = `<div class="list-flat">${rows.map((r, i) => `
        <div class="card row between">
          <div class="row"><span class="badge ${i < 3 ? 'badge-gold' : 'badge-cyan'}">#${i + 1}</span><strong>${r.identifiant}</strong></div>
          <span class="muted">${r.nx} NX</span>
        </div>`).join("")}</div>`;
    } catch (e) { box.innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.NexiAuth.isLoggedIn()) { window.location.href = "index.html"; return; }
    $$(".tabbar button").forEach((b) => b.addEventListener("click", () => showScreen(b.dataset.target)));
    $("#btnLogout") && $("#btnLogout").addEventListener("click", () => { window.NexiAuth.clearSession(); window.location.href = "index.html"; });
    showScreen("profil");
  });
})();
