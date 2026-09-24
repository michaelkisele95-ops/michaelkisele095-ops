/**
 * NEXI LAB — admin.js
 * Panel administrateur : pleins pouvoirs sur les Nexians, donjons, Nexify,
 * cartes de révision, "le saviez-vous", classement et réglages.
 */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3000);
  }

  function showScreen(name) {
    $$(".screen").forEach((s) => (s.hidden = s.dataset.screen !== name));
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.target === name));
    const loaders = { nexians: loadNexians, donjons: loadDonjons, nexify: loadNexifyAdmin, cartes: loadCartesAdmin, savais: loadFactsAdmin, classement: loadClassementAdmin, shards: loadShards, stats: loadStats, reglages: () => {} };
    loaders[name] && loaders[name]();
  }

  // ---------- Nexians ----------
  async function loadNexians() {
    const box = $("#nexiansContent");
    box.innerHTML = `<button class="btn btn-primary" id="addNexian">+ Ajouter un Nexian</button><div class="list-flat mt16" id="nexiansList"><div class="state-msg"><div class="spinner"></div></div></div>`;
    $("#addNexian").onclick = () => nexianForm();
    try {
      const list = await window.NexiAPI.adminListNexians();
      $("#nexiansList").innerHTML = list.length ? list.map(n => `
        <div class="card row between">
          <div><strong>${n.identifiant}</strong><div class="muted" style="font-size:.8rem">${n.nx} NX · ${n.abonnement} · <span class="badge badge-cyan">${n.shardLabel || n.shardId}</span></div></div>
          <div class="row">
            <button class="btn btn-sm btn-ghost" data-edit="${n.id}">Modifier</button>
            <button class="btn btn-sm ${n.abonnement === 'actif' ? 'btn-danger' : 'btn-primary'}" data-sub="${n.id}" data-shard="${n.shardId}" data-cur="${n.abonnement}">${n.abonnement === 'actif' ? 'Suspendre' : 'Activer'}</button>
          </div>
        </div>`).join("") : `<div class="state-msg">Aucun Nexian enregistré pour l'instant.</div>`;
      $$('[data-edit]').forEach((b) => b.onclick = () => nexianForm(list.find(n => n.id === b.dataset.edit)));
      $$('[data-sub]').forEach((b) => b.onclick = async () => {
        const next = b.dataset.cur === "actif" ? "suspendu" : "actif";
        try { await window.NexiAPI.adminSetSubscription(b.dataset.sub, next, b.dataset.shard); toast("Abonnement mis à jour."); loadNexians(); } catch (e) { toast(e.message); }
      });
    } catch (e) { $("#nexiansList").innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  async function nexianForm(n) {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    let shardOptions = `<option value="">Automatique (shard le moins chargé)</option>`;
    if (!n) {
      try {
        const shards = await window.NexiAPI.adminListShards();
        shardOptions += shards.map(s => `<option value="${s.shardId}" ${s.nbJoueurs >= s.capacite ? 'disabled' : ''}>${s.label} (${s.nbJoueurs}/${s.capacite})</option>`).join("");
      } catch (e) {}
    }
    modal.innerHTML = `
      <strong>${n ? "Modifier" : "Nouveau"} Nexian</strong>
      <div class="field mt16"><label>Nom complet (confidentiel)</label><input id="fNom" value="${n?.nomComplet || ''}"></div>
      <div class="field"><label>Identifiant (affiché au classement)</label><input id="fId" value="${n?.identifiant || ''}"></div>
      <div class="field"><label>Mot de passe ${n ? "(laisser vide pour ne pas changer)" : ""}</label><input id="fPw" type="text"></div>
      <div class="field"><label>NX de départ</label><input id="fNx" type="number" value="${n?.nx ?? 100}"></div>
      ${!n ? `<div class="field"><label>Feuille-joueurs (shard)</label><select id="fShard">${shardOptions}</select></div>` : ""}
      <div class="card" style="background:var(--bg-1);">
        <strong style="font-size:.85rem">Abonnement — suivi manuel du paiement</strong>
        <div class="field mt8"><label>Moyen de paiement</label><input id="fMoyen" placeholder="Ex: Orange Money, Airtel Money, espèces" value="${n?.moyenPaiement || ''}"></div>
        <div class="field"><label>Référence / n° de transaction</label><input id="fRef" value="${n?.referencePaiement || ''}"></div>
        <div class="field mb0"><label>Abonnement valable jusqu'au</label><input id="fFin" type="date" value="${n?.dateFinAbonnement || ''}"></div>
      </div>
      <div class="row mt16"><button class="btn btn-primary" id="saveNexian">Enregistrer</button><button class="btn btn-ghost" id="cancelNexian">Annuler</button></div>`;
    document.body.appendChild(modal);
    $("#cancelNexian", modal).onclick = () => modal.remove();
    $("#saveNexian", modal).onclick = async () => {
      try {
        const data = {
          id: n?.id, shardId: n?.shardId || $("#fShard", modal)?.value || undefined,
          nomComplet: $("#fNom", modal).value.trim(), identifiant: $("#fId", modal).value.trim(), motDePasse: $("#fPw", modal).value,
          nx: Number($("#fNx", modal).value), moyenPaiement: $("#fMoyen", modal).value.trim(),
          referencePaiement: $("#fRef", modal).value.trim(), dateFinAbonnement: $("#fFin", modal).value,
        };
        if (!data.nomComplet || !data.identifiant) { toast("Nom et identifiant requis."); return; }
        n ? await window.NexiAPI.adminUpdateNexian(data) : await window.NexiAPI.adminCreateNexian(data);
        modal.remove(); toast("Nexian enregistré."); loadNexians();
      } catch (e) { toast(e.message); }
    };
  }

  // ---------- Shards (feuilles-joueurs) ----------
  async function loadShards() {
    const box = $("#shardsContent");
    box.innerHTML = `
      <div class="card">
        <strong>Ajouter une feuille-joueurs</strong>
        <p class="muted" style="font-size:.8rem">Crée une Google Sheet vide, partage-la en modification avec le compte Google qui exécute le script, puis colle son identifiant ici (dans son URL : .../d/<b>IDENTIFIANT</b>/edit).</p>
        <div class="field mt8"><label>Identifiant de la feuille</label><input id="shSheetId"></div>
        <div class="field"><label>Libellé</label><input id="shLabel" placeholder="Ex: Shard 2"></div>
        <button class="btn btn-primary" id="shAdd">Enregistrer ce shard</button>
      </div>
      <div class="list-flat mt16" id="shardsList"><div class="state-msg"><div class="spinner"></div></div></div>`;
    $("#shAdd").onclick = async () => {
      try {
        await window.NexiAPI.adminProvisionShard($("#shSheetId").value.trim(), $("#shLabel").value.trim());
        toast("Shard enregistré."); loadShards();
      } catch (e) { toast(e.message); }
    };
    try {
      const shards = await window.NexiAPI.adminListShards();
      $("#shardsList").innerHTML = shards.map(s => `
        <div class="card">
          <div class="row between"><strong>${s.label}</strong><span class="badge ${s.nbJoueurs >= s.capacite ? 'badge-magenta' : 'badge-cyan'}">${s.nbJoueurs}/${s.capacite}</span></div>
          <div class="progress mt8"><span style="width:${Math.min(100, (s.nbJoueurs / s.capacite) * 100)}%"></span></div>
        </div>`).join("") || `<div class="state-msg">Aucun shard pour l'instant (le shard principal apparaît ici après installation).</div>`;
    } catch (e) { $("#shardsList").innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  // ---------- Statistiques ----------
  async function loadStats() {
    const box = $("#statsContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
    try {
      const s = await window.NexiAPI.adminGetStats();
      box.innerHTML = `
        <div class="card"><div class="row between"><span>Joueurs enregistrés</span><strong>${s.totalJoueurs}</strong></div></div>
        <div class="card"><div class="row between"><span>Abonnements actifs</span><strong>${s.joueursActifs}</strong></div></div>
        <div class="card"><div class="row between"><span>Connexions (7 derniers jours)</span><strong>${s.connexions7j}</strong></div></div>
        <div class="card"><div class="row between"><span>Défis complétés (total)</span><strong>${s.defisCompletes}</strong></div></div>
        <div class="card"><div class="row between"><span>NX en circulation</span><strong>${s.totalNx}</strong></div></div>
        <div class="card"><div class="row between"><span>Shards actifs</span><strong>${s.nbShards} (capacité ${s.capaciteShard}/shard)</strong></div></div>`;
    } catch (e) { box.innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  // ---------- Donjons ----------
  async function loadDonjons() {
    const box = $("#donjonsAdminContent");
    box.innerHTML = `<button class="btn btn-primary" id="addDonjon">+ Nouveau donjon</button><div class="list-flat mt16" id="donjonsList"><div class="state-msg"><div class="spinner"></div></div></div>`;
    $("#addDonjon").onclick = () => donjonForm();
    try {
      const list = await window.NexiAPI.adminListDungeons();
      $("#donjonsList").innerHTML = list.length ? list.map(d => `
        <div class="card row between">
          <div><strong>${d.titre}</strong><div class="muted" style="font-size:.8rem">${d.categorie} · ${d.questions.length} question(s)</div></div>
          <div class="row">
            <button class="btn btn-sm btn-ghost" data-edit="${d.id}">Modifier</button>
            <button class="btn btn-sm ${d.publie ? 'btn-danger' : 'btn-primary'}" data-pub="${d.id}" data-cur="${d.publie}">${d.publie ? 'Dépublier' : 'Publier'}</button>
          </div>
        </div>`).join("") : `<div class="state-msg">Aucun donjon créé pour l'instant.</div>`;
      $$('[data-edit]').forEach((b) => b.onclick = () => donjonForm(list.find(d => d.id === b.dataset.edit)));
      $$('[data-pub]').forEach((b) => b.onclick = async () => { try { await window.NexiAPI.adminPublishDungeon(b.dataset.pub, b.dataset.cur !== "true"); toast("Donjon mis à jour."); loadDonjons(); } catch (e) { toast(e.message); } });
    } catch (e) { $("#donjonsList").innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  function donjonForm(d) {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    let questions = d ? JSON.parse(JSON.stringify(d.questions)) : [];
    function renderQuestions() {
      return questions.map((q, i) => `
        <div class="card" style="margin-top:8px;">
          <div class="row between"><strong>Q${i + 1}</strong><button class="btn btn-sm btn-danger" data-rmq="${i}">Suppr.</button></div>
          <div class="field mt8"><input placeholder="Énoncé" data-qf="enonce" data-qi="${i}" value="${q.enonce || ''}"></div>
          <div class="field"><input placeholder="Options séparées par ;" data-qf="options" data-qi="${i}" value="${(q.options || []).join(';')}"></div>
          <div class="field"><input type="number" placeholder="Index bonne réponse (0,1,2...)" data-qf="bonne" data-qi="${i}" value="${q.bonneReponseIndex ?? 0}"></div>
          <div class="row">
            <div class="field mb0"><input type="number" placeholder="NX" data-qf="nx" data-qi="${i}" value="${q.nx ?? 10}"></div>
            <div class="field mb0"><input type="number" placeholder="Temps (s)" data-qf="tempsLimite" data-qi="${i}" value="${q.tempsLimite ?? 30}"></div>
            <div class="field mb0"><input type="number" placeholder="Bonus vitesse" data-qf="bonusVitesse" data-qi="${i}" value="${q.bonusVitesse ?? 0}"></div>
          </div>
        </div>`).join("");
    }
    modal.innerHTML = `
      <strong>${d ? "Modifier" : "Nouveau"} donjon</strong>
      <div class="field mt16"><label>Titre</label><input id="dTitre" value="${d?.titre || ''}"></div>
      <div class="field"><label>Catégorie</label>
        <select id="dCat">${window.NEXI_CONFIG.ELEMENT_CATEGORIES.map(c => `<option ${d?.categorie===c?'selected':''}>${c}</option>`).join("")}</select>
      </div>
      <div id="qWrap">${renderQuestions()}</div>
      <button class="btn btn-ghost mt8" id="addQ">+ Ajouter une question</button>
      <div class="row mt16"><button class="btn btn-primary" id="saveD">Enregistrer</button><button class="btn btn-ghost" id="cancelD">Annuler</button></div>`;
    document.body.appendChild(modal);
    function bindFieldEvents() {
      $$('[data-qf]', modal).forEach((inp) => inp.addEventListener("change", () => {
        const i = Number(inp.dataset.qi), f = inp.dataset.qf;
        questions[i] = questions[i] || {};
        questions[i][f] = f === "options" ? inp.value.split(";").map(s => s.trim()).filter(Boolean)
          : (["nx","tempsLimite","bonusVitesse","bonne"].includes(f) ? Number(inp.value) : inp.value);
        if (f === "bonne") questions[i].bonneReponseIndex = Number(inp.value);
      }));
      $$('[data-rmq]', modal).forEach((b) => b.onclick = () => { questions.splice(Number(b.dataset.rmq), 1); $("#qWrap", modal).innerHTML = renderQuestions(); bindFieldEvents(); });
    }
    bindFieldEvents();
    $("#addQ", modal).onclick = () => { questions.push({ enonce: "", options: [], bonneReponseIndex: 0, nx: 10, tempsLimite: 30, bonusVitesse: 0 }); $("#qWrap", modal).innerHTML = renderQuestions(); bindFieldEvents(); };
    $("#cancelD", modal).onclick = () => modal.remove();
    $("#saveD", modal).onclick = async () => {
      try {
        const titre = $("#dTitre", modal).value.trim();
        if (!titre || !questions.length) { toast("Titre et au moins une question requis."); return; }
        await window.NexiAPI.adminSaveDungeon({ id: d?.id, titre, categorie: $("#dCat", modal).value, questions });
        modal.remove(); toast("Donjon enregistré."); loadDonjons();
      } catch (e) { toast(e.message); }
    };
  }

  // ---------- Nexify ----------
  async function loadNexifyAdmin() {
    const box = $("#nexifyAdminContent");
    box.innerHTML = `<button class="btn btn-primary" id="addCard">+ Nouvelle carte</button><div class="list-flat mt16" id="cardsList"><div class="state-msg"><div class="spinner"></div></div></div>`;
    $("#addCard").onclick = () => cardForm();
    try {
      const list = await window.NexiAPI.adminListNexifyCards();
      $("#cardsList").innerHTML = list.length ? list.map(c => `<div class="card row between"><div><strong>${c.categorie}</strong><div class="muted" style="font-size:.8rem">x${c.multiplicateur}</div></div><button class="btn btn-sm btn-ghost" data-edit="${c.id}">Modifier</button></div>`).join("") : `<div class="state-msg">Aucune carte pour l'instant.</div>`;
      $$('[data-edit]').forEach((b) => b.onclick = () => cardForm(list.find(c => c.id === b.dataset.edit)));
    } catch (e) { $("#cardsList").innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }
  function cardForm(c) {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    modal.innerHTML = `
      <strong>${c ? "Modifier" : "Nouvelle"} carte Nexify</strong>
      <div class="field mt16"><label>Catégorie</label><select id="cCat">${window.NEXI_CONFIG.ELEMENT_CATEGORIES.map(x => `<option ${c?.categorie===x?'selected':''}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Question</label><textarea id="cQ">${c?.question || ''}</textarea></div>
      <div class="field"><label>Options séparées par ;</label><input id="cOpts" value="${(c?.options || []).join(';')}"></div>
      <div class="field"><label>Index bonne réponse</label><input id="cBonne" type="number" value="${c?.bonneReponseIndex ?? 0}"></div>
      <div class="field"><label>Multiplicateur</label><input id="cMult" type="number" step="0.1" value="${c?.multiplicateur ?? 2}"></div>
      <div class="row"><button class="btn btn-primary" id="saveCard">Enregistrer</button><button class="btn btn-ghost" id="cancelCard">Annuler</button></div>`;
    document.body.appendChild(modal);
    $("#cancelCard", modal).onclick = () => modal.remove();
    $("#saveCard", modal).onclick = async () => {
      try {
        await window.NexiAPI.adminSaveNexifyCard({
          id: c?.id, categorie: $("#cCat", modal).value, question: $("#cQ", modal).value.trim(),
          options: $("#cOpts", modal).value.split(";").map(s => s.trim()).filter(Boolean),
          bonneReponseIndex: Number($("#cBonne", modal).value), multiplicateur: Number($("#cMult", modal).value),
        });
        modal.remove(); toast("Carte enregistrée."); loadNexifyAdmin();
      } catch (e) { toast(e.message); }
    };
  }

  // ---------- Cartes de révision ----------
  async function loadCartesAdmin() {
    const box = $("#cartesAdminContent");
    box.innerHTML = `<div class="row"><button class="btn btn-primary" id="addRC">+ Nouvelle carte</button><button class="btn btn-ghost" id="importRC">Importer en masse</button></div><div class="list-flat mt16" id="rcList"><div class="state-msg"><div class="spinner"></div></div></div>`;
    $("#addRC").onclick = () => rcForm();
    $("#importRC").onclick = () => rcImportForm();
    try {
      const list = await window.NexiAPI.adminListRevisionCards();
      $("#rcList").innerHTML = list.length ? list.map(r => `<div class="card row between"><div><strong>${r.recto.slice(0,40)}</strong><div class="muted" style="font-size:.8rem">${r.categorie}</div></div><div class="row"><button class="btn btn-sm btn-ghost" data-edit="${r.id}">Modifier</button><button class="btn btn-sm btn-danger" data-del="${r.id}">Suppr.</button></div></div>`).join("") : `<div class="state-msg">Aucune carte pour l'instant.</div>`;
      $$('[data-edit]').forEach((b) => b.onclick = () => rcForm(list.find(r => r.id === b.dataset.edit)));
      $$('[data-del]').forEach((b) => b.onclick = async () => { try { await window.NexiAPI.adminDeleteRevisionCard(b.dataset.del); toast("Carte supprimée."); loadCartesAdmin(); } catch (e) { toast(e.message); } });
    } catch (e) { $("#rcList").innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }
  function rcForm(r) {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    modal.innerHTML = `
      <strong>${r ? "Modifier" : "Nouvelle"} carte de révision</strong>
      <div class="field mt16"><label>Catégorie</label><select id="rCat">${window.NEXI_CONFIG.ELEMENT_CATEGORIES.map(x => `<option ${r?.categorie===x?'selected':''}>${x}</option>`).join("")}</select></div>
      <div class="field"><label>Recto (question)</label><textarea id="rRecto">${r?.recto || ''}</textarea></div>
      <div class="field"><label>Verso (réponse)</label><textarea id="rVerso">${r?.reponse || ''}</textarea></div>
      <div class="field"><label>Explication (optionnel)</label><textarea id="rExpl">${r?.explication || ''}</textarea></div>
      <div class="row"><button class="btn btn-primary" id="saveRC">Enregistrer</button><button class="btn btn-ghost" id="cancelRC">Annuler</button></div>`;
    document.body.appendChild(modal);
    $("#cancelRC", modal).onclick = () => modal.remove();
    $("#saveRC", modal).onclick = async () => {
      try {
        await window.NexiAPI.adminSaveRevisionCard({ id: r?.id, categorie: $("#rCat", modal).value, recto: $("#rRecto", modal).value.trim(), reponse: $("#rVerso", modal).value.trim(), explication: $("#rExpl", modal).value.trim() });
        modal.remove(); toast("Carte enregistrée."); loadCartesAdmin();
      } catch (e) { toast(e.message); }
    };
  }

  function rcImportForm() {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    modal.innerHTML = `
      <strong>Importer des cartes en masse</strong>
      <p class="muted" style="font-size:.8rem">Une carte par ligne, au format <code>recto;réponse;explication</code> (explication facultative). Colle depuis un tableur en remplaçant les tabulations par des points-virgules.</p>
      <div class="field mt16"><label>Catégorie (appliquée à toutes les lignes)</label><select id="iCat">${window.NEXI_CONFIG.ELEMENT_CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select></div>
      <div class="field"><label>Contenu</label><textarea id="iText" rows="8" placeholder="Qu'est-ce qu'un acide ?;Un donneur de protons;Selon Brønsted-Lowry"></textarea></div>
      <div class="row"><button class="btn btn-primary" id="doImport">Importer</button><button class="btn btn-ghost" id="cancelImport">Annuler</button></div>`;
    document.body.appendChild(modal);
    $("#cancelImport", modal).onclick = () => modal.remove();
    $("#doImport", modal).onclick = async () => {
      try {
        const res = await window.NexiAPI.adminImportRevisionCards($("#iCat", modal).value, $("#iText", modal).value);
        modal.remove(); toast(`${res.added} carte(s) importée(s), ${res.skipped} ignorée(s).`); loadCartesAdmin();
      } catch (e) { toast(e.message); }
    };
  }

  // ---------- Le saviez-vous ----------
  async function loadFactsAdmin() {
    const box = $("#savaisAdminContent");
    box.innerHTML = `<div class="row"><button class="btn btn-primary" id="addFact">+ Nouveau fait</button><button class="btn btn-ghost" id="importFact">Importer en masse</button></div><div class="list-flat mt16" id="factsList"><div class="state-msg"><div class="spinner"></div></div></div>`;
    $("#addFact").onclick = () => factForm();
    $("#importFact").onclick = () => factImportForm();
    try {
      const list = await window.NexiAPI.adminListFacts();
      $("#factsList").innerHTML = list.length ? list.map(f => `<div class="card row between"><div>${f.texte.slice(0,60)}</div><button class="btn btn-sm btn-ghost" data-edit="${f.id}">Modifier</button></div>`).join("") : `<div class="state-msg">Aucun fait enregistré.</div>`;
      $$('[data-edit]').forEach((b) => b.onclick = () => factForm(list.find(f => f.id === b.dataset.edit)));
    } catch (e) { $("#factsList").innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }
  function factForm(f) {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    modal.innerHTML = `<strong>${f ? "Modifier" : "Nouveau"} fait</strong><div class="field mt16"><textarea id="fText">${f?.texte || ''}</textarea></div><div class="row"><button class="btn btn-primary" id="saveFact">Enregistrer</button><button class="btn btn-ghost" id="cancelFact">Annuler</button></div>`;
    document.body.appendChild(modal);
    $("#cancelFact", modal).onclick = () => modal.remove();
    $("#saveFact", modal).onclick = async () => { try { await window.NexiAPI.adminSaveFact({ id: f?.id, texte: $("#fText", modal).value.trim() }); modal.remove(); toast("Enregistré."); loadFactsAdmin(); } catch (e) { toast(e.message); } };
  }

  function factImportForm() {
    const modal = document.createElement("div");
    modal.className = "card"; modal.style.cssText = "position:fixed;inset:16px;z-index:70;overflow-y:auto;";
    modal.innerHTML = `
      <strong>Importer des faits en masse</strong>
      <p class="muted" style="font-size:.8rem">Un fait par ligne.</p>
      <div class="field mt16"><textarea id="ifText" rows="8"></textarea></div>
      <div class="row"><button class="btn btn-primary" id="doImportFact">Importer</button><button class="btn btn-ghost" id="cancelImportFact">Annuler</button></div>`;
    document.body.appendChild(modal);
    $("#cancelImportFact", modal).onclick = () => modal.remove();
    $("#doImportFact", modal).onclick = async () => {
      try {
        const res = await window.NexiAPI.adminImportFacts($("#ifText", modal).value);
        modal.remove(); toast(`${res.added} fait(s) importé(s).`); loadFactsAdmin();
      } catch (e) { toast(e.message); }
    };
  }

  // ---------- Classement (lecture seule côté admin) ----------
  async function loadClassementAdmin() {
    const box = $("#classementAdminContent");
    box.innerHTML = `<div class="state-msg"><div class="spinner"></div></div>`;
    try {
      const rows = await window.NexiAPI.getLeaderboard();
      box.innerHTML = `<div class="list-flat">${rows.map((r, i) => `<div class="card row between"><span>#${i + 1} ${r.identifiant}</span><span class="muted">${r.nx} NX</span></div>`).join("")}</div>`;
    } catch (e) { box.innerHTML = `<div class="state-msg">${e.message}</div>`; }
  }

  // ---------- Réglages ----------
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.NexiAuth.isLoggedIn()) { window.location.href = "index.html?admin=1"; return; }
    $$(".tabbar button").forEach((b) => b.addEventListener("click", () => showScreen(b.dataset.target)));
    $("#btnLogoutAdmin") && $("#btnLogoutAdmin").addEventListener("click", () => { window.NexiAuth.clearSession(); window.location.href = "index.html?admin=1"; });
    $("#savePwd") && $("#savePwd").addEventListener("click", async () => {
      try {
        await window.NexiAPI.adminChangePassword($("#oldPwd").value, $("#newPwd").value);
        toast("Mot de passe changé."); $("#oldPwd").value = ""; $("#newPwd").value = "";
      } catch (e) { toast(e.message); }
    });
    showScreen("nexians");
  });
})();
