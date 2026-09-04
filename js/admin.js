/* ============================================================
   NEXIONE — admin.js
   ============================================================ */

(function () {
  "use strict";

  var U = NexiUtils;
  var editingChildId = null;
  var editingChallengeId = null;
  var editingAffinityId = null;
  var pendingImportChal = null;
  var pendingImportAff = null;
  var resolvingRequestId = null;

  document.addEventListener("DOMContentLoaded", function () {
    NexiStore.bootstrap().then(function (boot) {
      U.hideLoadingOverlay();
      U.showOfflineBannerIfNeeded(boot);

      var user = requireRole("admin");
      if (!user) return;

      NexiStore.applyScheduledPublications();

      document.getElementById("whoName").textContent = user.displayName;
      document.getElementById("whoBadge").textContent = U.initials(user.displayName);
      document.getElementById("logoutBtn").addEventListener("click", function () {
        NexiStore.logout(); window.location.href = "index.html";
      });

      initTileNav("adminTiles");
      bindModals();
      bindChildren();
      bindChallenges();
      bindAffinities();
      bindEstablishments();
      bindSettings();

      renderAll();
    });
  });

  function requireRole(role) {
    var u = NexiStore.currentUser();
    if (!u || u.role !== role || u.blocked) {
      NexiStore.logout();
      window.location.href = "index.html";
      return null;
    }
    return u;
  }

  // Navigation "pages empilées" partagée (js/nav.js) : une tuile ouvre une
  // page dédiée plein écran avec bouton retour, au lieu d'empiler le contenu.
  function initTileNav(navId) {
    return NexiNav.initPageStack(navId);
  }

  function openModal(id) { document.getElementById(id).classList.add("show"); }
  function closeModal(id) { document.getElementById(id).classList.remove("show"); }

  function bindModals() {
    document.querySelectorAll(".modal-backdrop").forEach(function (backdrop) {
      backdrop.addEventListener("click", function (e) { if (e.target === backdrop) backdrop.classList.remove("show"); });
      backdrop.querySelectorAll("[data-close]").forEach(function (btn) {
        btn.addEventListener("click", function () { backdrop.classList.remove("show"); });
      });
    });
  }

  function renderAll() {
    renderStats();
    renderChildren();
    renderChallenges();
    renderAffinities();
    renderEstablishments();
    renderPendingRequests();
    renderSettings();
  }

  function renderStats() {
    var db = NexiStore.getDB();
    document.getElementById("statChildren").textContent = db.users.filter(function (u) { return u.role === "child"; }).length + " inscrits";
    document.getElementById("statChallenges").textContent = db.challenges.length + " créés";
    document.getElementById("statAffinities").textContent = db.affinities.length + " créés";
    document.getElementById("statEstablishments").textContent = db.establishments.length + " établissement(s)";
  }

  /* ===================== ENFANTS ===================== */

  function bindChildren() {
    document.getElementById("btnAddChild").addEventListener("click", function () {
      editingChildId = null;
      document.getElementById("modalChildTitle").textContent = "Ajouter un enfant";
      document.getElementById("childDisplayName").value = "";
      document.getElementById("childIdentifiant").value = "";
      document.getElementById("childPassword").value = "";
      document.getElementById("childClasse").innerHTML = U.classOptionsHTML(null, true);
      document.getElementById("childClasse").value = "";
      document.getElementById("childEstablishment").value = "";
      document.getElementById("btnDeleteChild").style.display = "none";
      document.getElementById("btnToggleBlockChild").style.display = "none";
      populateEstablishmentSelect();
      openModal("modalChild");
    });

    document.getElementById("btnSaveChild").addEventListener("click", function () {
      var displayName = document.getElementById("childDisplayName").value.trim();
      var identifiant = document.getElementById("childIdentifiant").value.trim();
      var password = document.getElementById("childPassword").value.trim();
      var establishmentId = document.getElementById("childEstablishment").value || null;
      var classe = document.getElementById("childClasse").value.trim();

      if (!displayName || !identifiant || !password) { U.toast("Nom, identifiant et mot de passe sont requis."); return; }

      if (editingChildId) {
        NexiStore.updateUser(editingChildId, { displayName: displayName, identifiant: identifiant, establishmentId: establishmentId, classe: classe });
        U.toast("Profil de l'enfant mis à jour.");
      } else {
        var res = NexiStore.addChild({ displayName: displayName, identifiant: identifiant, password: password, establishmentId: establishmentId, classe: classe });
        if (!res.ok) { U.toast(res.error); return; }
        U.toast("Enfant créé avec succès.");
      }
      closeModal("modalChild");
      renderAll();
    });

    document.getElementById("btnDeleteChild").addEventListener("click", function () {
      if (!editingChildId) return;
      if (!confirm("Supprimer définitivement cet enfant ?")) return;
      NexiStore.removeUser(editingChildId);
      closeModal("modalChild");
      renderAll();
      U.toast("Enfant supprimé.");
    });

    document.getElementById("btnToggleBlockChild").addEventListener("click", function () {
      if (!editingChildId) return;
      var db = NexiStore.getDB();
      var child = db.users.find(function (u) { return u.id === editingChildId; });
      NexiStore.updateUser(editingChildId, { blocked: !child.blocked });
      closeModal("modalChild");
      renderAll();
      U.toast(child.blocked ? "Enfant débloqué." : "Enfant bloqué.");
    });
  }

  function populateEstablishmentSelect() {
    var sel = document.getElementById("childEstablishment");
    var db = NexiStore.getDB();
    sel.innerHTML = '<option value="">— Aucun —</option>' + db.establishments.map(function (e) {
      return '<option value="' + e.id + '">' + U.escapeHTML(e.name) + '</option>';
    }).join("");
  }

  function renderChildren() {
    var grid = document.getElementById("childrenGrid");
    var children = NexiStore.listChildren();
    if (children.length === 0) { grid.innerHTML = '<div class="empty-state">Aucun enfant pour le moment.</div>'; return; }
    var db = NexiStore.getDB();
    grid.innerHTML = children.map(function (c) {
      var est = db.establishments.find(function (e) { return e.id === c.establishmentId; });
      var avatarSrc = NexiStore.avatarUrl(c.avatar);
      return (
        '<div class="card card-clickable" data-child="' + c.id + '">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
            '<div class="avatar-badge">' + (avatarSrc ? '<img src="' + avatarSrc + '" alt="">' : (c.avatar || U.initials(c.displayName))) + '</div>' +
            '<div><div style="font-weight:800;">' + U.escapeHTML(c.displayName) + '</div>' +
            '<div style="font-size:.76rem;color:var(--nexi-ink-soft);">@' + U.escapeHTML(c.identifiant) + '</div></div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<span class="badge ' + (c.blocked ? "badge-red" : "badge-green") + '">' + (c.blocked ? "Bloqué" : "Actif") + '</span>' +
            (est ? '<span class="badge badge-blue">' + U.escapeHTML(est.name) + '</span>' : '<span class="badge badge-grey">Aucun établissement</span>') +
            (c.classe ? '<span class="badge badge-amber">' + U.escapeHTML(c.classe) + '</span>' : "") +
          '</div>' +
        '</div>'
      );
    }).join("");

    grid.querySelectorAll("[data-child]").forEach(function (card) {
      card.addEventListener("click", function () { openChildEdit(card.getAttribute("data-child")); });
    });
  }

  function openChildEdit(id) {
    var db = NexiStore.getDB();
    var c = db.users.find(function (u) { return u.id === id; });
    if (!c) return;
    editingChildId = id;
    document.getElementById("modalChildTitle").textContent = "Profil de " + c.displayName;
    document.getElementById("childDisplayName").value = c.displayName;
    document.getElementById("childIdentifiant").value = c.identifiant;
    document.getElementById("childPassword").value = c.password;
    document.getElementById("childPassword").setAttribute("disabled", "disabled");
    document.getElementById("childClasse").innerHTML = U.classOptionsHTML(c.classe, true);
    document.getElementById("childClasse").value = c.classe || "";
    populateEstablishmentSelect();
    document.getElementById("childEstablishment").value = c.establishmentId || "";

    var extra = document.getElementById("childProfileExtra");
    var chalCount = db.challenges.filter(function (ch) { return ch.attempts[id]; }).length;
    var affCount = db.affinities.filter(function (a) { return a.attempts[id]; }).length;
    var lastAffinity = null;
    db.affinities.forEach(function (a) { if (a.attempts[id]) lastAffinity = a.attempts[id]; });
    var cumulative = NexiStore.cumulativeLearningProfile(id);
    var monthly = NexiStore.monthlyLearningProfile(id, NexiStore.currentYearMonth());

    extra.innerHTML =
      '<div class="card" style="background:#F7F9FF;margin-bottom:14px;">' +
        '<div style="font-size:.78rem;color:var(--nexi-ink-soft);">Activité</div>' +
        '<div style="font-weight:700;">' + chalCount + ' défi(s) réalisé(s) · ' + affCount + ' test(s) d\'affinité complété(s)</div>' +
        (lastAffinity ? '<div style="font-size:.8rem;margin-top:6px;color:var(--nexi-blue-dark);font-weight:700;">Dernier profil d\'affinité : ' + U.escapeHTML(lastAffinity.profileLabel) + '</div>' : "") +
      '</div>' +
      '<div class="card" style="background:#F7F9FF;margin-bottom:14px;">' +
        '<div style="font-size:.78rem;color:var(--nexi-ink-soft);margin-bottom:8px;">Profil d\'apprentissage cumulé (tous les défis)</div>' +
        (cumulative.length === 0
          ? '<div class="empty-state" style="padding:12px;">Aucun défi réalisé pour l\'instant.</div>'
          : cumulative.map(function (r) {
              return '<div class="axis-bar-row"><div class="axis-label">' + U.escapeHTML(r.category) + '</div>' +
                '<div class="axis-bar-track"><div class="axis-bar-fill" style="width:' + r.percent + '%"></div></div>' +
                '<div class="axis-val">' + r.percent + '%</div></div>';
            }).join("")) +
        '<div style="font-size:.74rem;color:var(--nexi-ink-soft);margin-top:8px;">Profil du mois en cours (' + U.escapeHTML(NexiStore.monthLabelFR(NexiStore.currentYearMonth())) + ') : ' +
          (monthly.length === 0 ? "pas encore de défi ce mois-ci." : monthly.map(function (r) { return U.escapeHTML(r.category) + " " + r.percent + "%"; }).join(" · ")) +
        '</div>' +
      '</div>';

    var blockBtn = document.getElementById("btnToggleBlockChild");
    blockBtn.style.display = "inline-flex";
    blockBtn.textContent = c.blocked ? "Débloquer" : "Bloquer";
    document.getElementById("btnDeleteChild").style.display = "inline-flex";

    openModal("modalChild");
    document.getElementById("childPassword").removeAttribute("disabled");
  }

  /* ===================== DÉFIS ===================== */

  function bindChallenges() {
    document.getElementById("btnAddChallenge").addEventListener("click", function () { openChallengeEditor(null); });
    document.getElementById("btnSaveChallenge").addEventListener("click", saveChallengeFromModal);
    document.getElementById("btnAddQuestionChal").addEventListener("click", function () { addQuestionRow("chalQuestions", null); });
    document.getElementById("btnDeleteChallenge").addEventListener("click", function () {
      if (!editingChallengeId) return;
      if (!confirm("Supprimer ce défi ?")) return;
      NexiStore.deleteChallenge(editingChallengeId);
      closeModal("modalChallenge");
      renderAll();
      U.toast("Défi supprimé.");
    });

    document.getElementById("btnImportChallenge").addEventListener("click", function () {
      document.getElementById("importChalTitle").value = "";
      document.getElementById("importChalFile").value = "";
      document.getElementById("importChalPreview").innerHTML = "";
      document.getElementById("btnConfirmImportChal").disabled = true;
      pendingImportChal = null;
      openModal("modalImportChallenge");
    });

    document.getElementById("importChalFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var result = U.parseCSV(reader.result);
        var preview = document.getElementById("importChalPreview");
        if (!result.ok) {
          preview.innerHTML = '<p style="color:var(--nexi-red);">Aucune question valide trouvée.' +
            (result.errors.length ? "<br>" + result.errors.slice(0, 5).join("<br>") : "") + "</p>";
          document.getElementById("btnConfirmImportChal").disabled = true;
          return;
        }
        pendingImportChal = result.questions;
        preview.innerHTML = '<p><b>' + result.questions.length + ' question(s)</b> détectée(s).</p>' +
          (result.errors.length ? '<p style="color:var(--nexi-amber-dark);">' + result.errors.length + ' ligne(s) ignorée(s).</p>' : "");
        document.getElementById("btnConfirmImportChal").disabled = false;
      };
      reader.readAsText(file, "UTF-8");
    });

    document.getElementById("btnConfirmImportChal").addEventListener("click", function () {
      var title = document.getElementById("importChalTitle").value.trim() || "Défi importé";
      if (!pendingImportChal) return;
      var questions = pendingImportChal.map(function (q) {
        return {
          id: NexiStore.uid("q"),
          text: q.text,
          category: "Culture générale",
          options: q.options,
          correct: q.correct,
          multi: q.multi,
          time: q.time
        };
      });
      NexiStore.upsertChallenge({ title: title, description: "", visible: true, published: false, publishAt: null, questions: questions });
      closeModal("modalImportChallenge");
      renderAll();
      U.toast("Défi importé avec " + questions.length + " question(s).");
    });
  }

  function openChallengeEditor(id) {
    editingChallengeId = id;
    var container = document.getElementById("chalQuestions");
    container.innerHTML = "";

    if (id) {
      var chal = NexiStore.getChallenge(id);
      document.getElementById("modalChallengeTitle").textContent = "Modifier le défi";
      document.getElementById("chalTitleInput").value = chal.title;
      document.getElementById("chalDescInput").value = chal.description || "";
      document.getElementById("chalWeekInput").value = chal.week || NexiStore.currentWeekLabel();
      document.getElementById("chalVisible").checked = !!chal.visible;
      document.getElementById("chalPublished").checked = !!chal.published;
      document.getElementById("chalPublishAt").value = chal.publishAt ? chal.publishAt.slice(0, 16) : "";
      chal.questions.forEach(function (q) { addQuestionRow("chalQuestions", q); });
      document.getElementById("btnDeleteChallenge").style.display = "inline-flex";
      renderClassCheckboxes("chalClasses", chal.targetClasses || []);
    } else {
      document.getElementById("modalChallengeTitle").textContent = "Créer un défi";
      document.getElementById("chalTitleInput").value = "";
      document.getElementById("chalDescInput").value = "";
      document.getElementById("chalWeekInput").value = NexiStore.currentWeekLabel();
      document.getElementById("chalVisible").checked = true;
      document.getElementById("chalPublished").checked = false;
      document.getElementById("chalPublishAt").value = "";
      addQuestionRow("chalQuestions", null);
      document.getElementById("btnDeleteChallenge").style.display = "none";
      renderClassCheckboxes("chalClasses", []);
    }
    openModal("modalChallenge");
  }

  function addQuestionRow(containerId, q) {
    var container = document.getElementById(containerId);
    var row = document.createElement("div");
    row.className = "question-row";
    var qid = (q && q.id) || NexiStore.uid("q");
    var options = (q && q.options) || ["", "", "", ""];
    var correct = (q && q.correct) || [];
    var category = (q && q.category) || "Mathématiques";
    var isCustomCategory = NexiStore.CATEGORIES.indexOf(category) === -1;
    var time = (q && q.time) || 20;

    row.dataset.qid = qid;
    row.innerHTML =
      '<div class="qrow-top">' +
        '<input type="text" class="q-text" placeholder="Intitulé de la question" value="' + U.escapeHTML((q && q.text) || "") + '" style="flex:1;border:1.5px solid #DCE4FA;border-radius:10px;padding:10px 12px;font-weight:700;">' +
        '<button type="button" class="btn btn-danger btn-sm remove-question">✕</button>' +
      '</div>' +
      '<div class="options-holder"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm add-option" style="margin-top:6px;">+ Option</button>' +
      '<div class="field-row" style="margin-top:10px;">' +
        '<div class="field"><label>Domaine (Éducation Nationale RDC)</label><select class="q-category">' +
          NexiUtils_categoryOptions(isCustomCategory ? "__custom__" : category) +
        '</select></div>' +
        '<div class="field q-category-custom-wrap" style="' + (isCustomCategory ? "" : "display:none;") + '"><label>Précise le domaine</label><input type="text" class="q-category-custom" placeholder="ex : Musique, Informatique..." value="' + U.escapeHTML(isCustomCategory ? category : "") + '"></div>' +
        '<div class="field"><label>Temps (secondes)</label><input type="number" class="q-time" min="5" value="' + time + '"></div>' +
      '</div>';

    container.appendChild(row);
    var optionsHolder = row.querySelector(".options-holder");
    var categorySelect = row.querySelector(".q-category");
    var customWrap = row.querySelector(".q-category-custom-wrap");
    categorySelect.addEventListener("change", function () {
      customWrap.style.display = categorySelect.value === "__custom__" ? "" : "none";
    });

    function renderOptions() {
      optionsHolder.innerHTML = "";
      options.forEach(function (optText, i) {
        var optRow = document.createElement("div");
        optRow.className = "option-row";
        optRow.innerHTML =
          '<input type="checkbox" class="opt-correct" ' + (correct.indexOf(i) > -1 ? "checked" : "") + '>' +
          '<input type="text" class="opt-text" value="' + U.escapeHTML(optText) + '" placeholder="Option ' + String.fromCharCode(65 + i) + '">' +
          '<button type="button" class="btn btn-ghost btn-sm remove-option">✕</button>';
        optionsHolder.appendChild(optRow);

        optRow.querySelector(".opt-text").addEventListener("input", function (e) { options[i] = e.target.value; });
        optRow.querySelector(".opt-correct").addEventListener("change", function (e) {
          if (e.target.checked) { if (correct.indexOf(i) === -1) correct.push(i); }
          else { correct = correct.filter(function (x) { return x !== i; }); }
        });
        optRow.querySelector(".remove-option").addEventListener("click", function () {
          options.splice(i, 1);
          correct = correct.filter(function (x) { return x !== i; }).map(function (x) { return x > i ? x - 1 : x; });
          renderOptions();
        });
      });
    }
    renderOptions();

    row.querySelector(".add-option").addEventListener("click", function () { options.push(""); renderOptions(); });
    row.querySelector(".remove-question").addEventListener("click", function () { row.remove(); });

    row._getData = function () {
      var catValue = row.querySelector(".q-category").value;
      if (catValue === "__custom__") {
        catValue = row.querySelector(".q-category-custom").value.trim() || "Culture générale";
      }
      return {
        id: qid,
        text: row.querySelector(".q-text").value.trim(),
        category: catValue,
        time: Math.max(5, parseInt(row.querySelector(".q-time").value, 10) || 20),
        options: options.filter(function (o) { return o.trim() !== ""; }),
        correct: correct,
        multi: correct.length > 1
      };
    };
  }

  function NexiUtils_categoryOptions(selected) {
    return NexiStore.CATEGORIES.map(function (c) {
      return '<option value="' + c + '"' + (c === selected ? " selected" : "") + '>' + c + '</option>';
    }).join("") + '<option value="__custom__"' + (selected === "__custom__" ? " selected" : "") + '>Autre (préciser)…</option>';
  }

  function saveChallengeFromModal() {
    var title = document.getElementById("chalTitleInput").value.trim();
    if (!title) { U.toast("Le titre du défi est requis."); return; }

    var rows = document.querySelectorAll("#chalQuestions .question-row");
    var questions = [];
    var invalid = false;
    rows.forEach(function (row) {
      var data = row._getData();
      if (!data.text || data.options.length < 2 || data.correct.length === 0) { invalid = true; return; }
      questions.push(data);
    });
    if (invalid || questions.length === 0) { U.toast("Chaque question doit avoir un intitulé, 2 options minimum et au moins une bonne réponse cochée."); return; }

    var publishAtVal = document.getElementById("chalPublishAt").value;
    var payload = {
      id: editingChallengeId,
      title: title,
      description: document.getElementById("chalDescInput").value.trim(),
      week: document.getElementById("chalWeekInput").value.trim() || NexiStore.currentWeekLabel(),
      visible: document.getElementById("chalVisible").checked,
      published: document.getElementById("chalPublished").checked,
      publishAt: publishAtVal ? new Date(publishAtVal).toISOString() : null,
      targetClasses: getSelectedClasses("chalClasses"),
      questions: questions
    };
    NexiStore.upsertChallenge(payload);
    closeModal("modalChallenge");
    renderAll();
    U.toast("Défi enregistré.");
  }

  function renderChallenges() {
    var grid = document.getElementById("challengesGrid");
    var list = NexiStore.listChallenges();
    if (list.length === 0) { grid.innerHTML = '<div class="empty-state">Aucun défi créé pour le moment.</div>'; return; }
    grid.innerHTML = list.map(function (c) {
      var attemptsCount = Object.keys(c.attempts || {}).length;
      return (
        '<div class="card">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
            '<div style="font-weight:800;">' + U.escapeHTML(c.title) + '</div>' +
            '<button class="btn btn-ghost btn-sm" data-edit-chal="' + c.id + '">Éditer</button>' +
          '</div>' +
          '<p style="font-size:.8rem;color:var(--nexi-ink-soft);margin:6px 0 10px;">' + U.escapeHTML(c.description || "—") + '</p>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
            '<span class="badge ' + (c.visible ? "badge-blue" : "badge-grey") + '">' + (c.visible ? "Visible" : "Invisible") + '</span>' +
            '<span class="badge ' + (c.published ? "badge-green" : "badge-amber") + '">' + (c.published ? "Publié" : "Non publié") + '</span>' +
            '<span class="badge badge-grey">' + c.questions.length + ' question(s)</span>' +
            (c.week ? '<span class="badge badge-blue">' + U.escapeHTML(c.week) + '</span>' : "") +
          '</div>' +
          '<div style="font-size:.76rem;color:var(--nexi-ink-soft);margin-bottom:4px;">Domaines : ' +
            U.escapeHTML(Array.from(new Set(c.questions.map(function (q) { return q.category || "Culture générale"; }))).join(", ")) +
          '</div>' +
          '<div style="font-size:.76rem;color:var(--nexi-ink-soft);">' + attemptsCount + ' élève(s) ont participé' +
            (c.publishAt ? ' · programmé le ' + U.fmtDateTime(c.publishAt) : "") + '</div>' +
        '</div>'
      );
    }).join("");
    grid.querySelectorAll("[data-edit-chal]").forEach(function (btn) {
      btn.addEventListener("click", function () { openChallengeEditor(btn.getAttribute("data-edit-chal")); });
    });
  }

  /* ===================== AFFINITÉS ===================== */

  function bindAffinities() {
    document.getElementById("btnAddAffinity").addEventListener("click", function () { openAffinityEditor(null); });
    document.getElementById("btnSaveAffinity").addEventListener("click", saveAffinityFromModal);
    document.getElementById("btnAddQuestionAff").addEventListener("click", function () { addAffinityRow(null); });
    document.getElementById("btnDeleteAffinity").addEventListener("click", function () {
      if (!editingAffinityId) return;
      if (!confirm("Supprimer ce test d'affinité ?")) return;
      NexiStore.deleteAffinity(editingAffinityId);
      closeModal("modalAffinity");
      renderAll();
      U.toast("Test supprimé.");
    });

    document.getElementById("btnImportAffinity").addEventListener("click", function () {
      document.getElementById("importAffTitle").value = "";
      document.getElementById("importAffFile").value = "";
      document.getElementById("importAffPreview").innerHTML = "";
      document.getElementById("btnConfirmImportAff").disabled = true;
      renderClassCheckboxes("importAffClasses", []);
      pendingImportAff = null;
      openModal("modalImportAffinity");
    });

    document.getElementById("importAffFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var raw = reader.result.replace(/\r\n/g, "\n");
        var lines = raw.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
        var validAxes = NexiStore.AXES.map(function (a) { return a.id; });
        var sep = lines[0] && lines[0].indexOf(";") > -1 && lines[0].split(";").length >= lines[0].split(",").length ? ";" : ",";
        var items = [];
        var startIdx = lines[0] && lines[0].toLowerCase().indexOf("item") > -1 ? 1 : 0;
        for (var i = startIdx; i < lines.length; i++) {
          var cols = U.splitCSVLine(lines[i], sep);
          if (cols.length < 2) continue;
          var axis = validAxes.indexOf(cols[1]) > -1 ? cols[1] : validAxes[0];
          var dir = cols[2] === "neg" ? "neg" : "pos";
          var time = parseInt(cols[3], 10) || 15;
          items.push({ text: cols[0], axis: axis, direction: dir, time: time });
        }
        pendingImportAff = items;
        document.getElementById("importAffPreview").innerHTML = "<p><b>" + items.length + " item(s)</b> détecté(s).</p>";
        document.getElementById("btnConfirmImportAff").disabled = items.length === 0;
      };
      reader.readAsText(file, "UTF-8");
    });

    document.getElementById("btnConfirmImportAff").addEventListener("click", function () {
      var title = document.getElementById("importAffTitle").value.trim() || "Test d'affinité importé";
      if (!pendingImportAff) return;
      var questions = pendingImportAff.map(function (it) {
        return { id: NexiStore.uid("q"), text: it.text, axis: it.axis, direction: it.direction, time: it.time };
      });
      var targetClasses = getSelectedClasses("importAffClasses");
      NexiStore.upsertAffinity({ title: title, description: "", visible: true, published: false, publishAt: null, targetClasses: targetClasses, questions: questions });
      closeModal("modalImportAffinity");
      renderAll();
      U.toast("Test d'affinité importé avec " + questions.length + " item(s)." + (targetClasses.length ? " Ciblé sur " + targetClasses.length + " classe(s)." : ""));
    });
  }

  // Construit une liste de checkboxes de classes (groupées Primaire/CO/Humanités)
  // dans le conteneur donné, et renvoie un getter pour lire la sélection courante.
  function renderClassCheckboxes(containerId, preselected) {
    var container = document.getElementById(containerId);
    if (!container) return;
    preselected = preselected || [];
    container.innerHTML = NexiStore.CLASS_LEVELS_GROUPED.map(function (grp) {
      return (
        '<div class="class-group"><div class="class-group-title">' + grp.group + '</div>' +
        '<div class="class-group-items">' +
          grp.classes.map(function (c) {
            var checked = preselected.indexOf(c) > -1 ? " checked" : "";
            return '<label class="class-check"><input type="checkbox" value="' + c + '"' + checked + '> ' + c + '</label>';
          }).join("") +
        '</div></div>'
      );
    }).join("");
  }

  function getSelectedClasses(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return [];
    return Array.prototype.slice.call(container.querySelectorAll('input[type="checkbox"]:checked')).map(function (el) { return el.value; });
  }

  function openAffinityEditor(id) {
    editingAffinityId = id;
    var container = document.getElementById("affQuestions");
    container.innerHTML = "";

    if (id) {
      var aff = NexiStore.getAffinity(id);
      document.getElementById("modalAffinityTitle").textContent = "Modifier le test";
      document.getElementById("affTitleInput").value = aff.title;
      document.getElementById("affDescInput").value = aff.description || "";
      document.getElementById("affVisible").checked = !!aff.visible;
      document.getElementById("affPublished").checked = !!aff.published;
      document.getElementById("affPublishAt").value = aff.publishAt ? aff.publishAt.slice(0, 16) : "";
      aff.questions.forEach(function (q) { addAffinityRow(q); });
      document.getElementById("btnDeleteAffinity").style.display = "inline-flex";
      renderClassCheckboxes("affClasses", aff.targetClasses || []);
    } else {
      document.getElementById("modalAffinityTitle").textContent = "Créer un test d'affinité";
      document.getElementById("affTitleInput").value = "";
      document.getElementById("affDescInput").value = "";
      document.getElementById("affVisible").checked = true;
      document.getElementById("affPublished").checked = false;
      document.getElementById("affPublishAt").value = "";
      addAffinityRow(null);
      document.getElementById("btnDeleteAffinity").style.display = "none";
      renderClassCheckboxes("affClasses", []);
    }
    openModal("modalAffinity");
  }

  function addAffinityRow(q) {
    var container = document.getElementById("affQuestions");
    var row = document.createElement("div");
    row.className = "question-row";
    var qid = (q && q.id) || NexiStore.uid("q");
    row.dataset.qid = qid;
    row.innerHTML =
      '<div class="qrow-top">' +
        '<input type="text" class="q-text" placeholder="Intitulé de l\'item" value="' + U.escapeHTML((q && q.text) || "") + '" style="flex:1;border:1.5px solid #DCE4FA;border-radius:10px;padding:10px 12px;font-weight:700;">' +
        '<button type="button" class="btn btn-danger btn-sm remove-question">✕</button>' +
      '</div>' +
      '<div class="field-row" style="margin-top:10px;">' +
        '<div class="field"><label>Axe bipolaire</label><select class="q-axis">' +
          NexiStore.AXES.map(function (ax) {
            return '<option value="' + ax.id + '"' + ((q && q.axis === ax.id) ? " selected" : "") + '>' + ax.pos + ' ↔ ' + ax.neg + '</option>';
          }).join("") +
        '</select></div>' +
        '<div class="field"><label>Pôle mesuré</label><select class="q-direction">' +
          '<option value="pos"' + ((!q || q.direction === "pos") ? " selected" : "") + '>Pôle positif</option>' +
          '<option value="neg"' + ((q && q.direction === "neg") ? " selected" : "") + '>Pôle négatif</option>' +
        '</select></div>' +
        '<div class="field"><label>Temps (s)</label><input type="number" class="q-time" min="5" value="' + ((q && q.time) || 15) + '"></div>' +
      '</div>';
    container.appendChild(row);
    row.querySelector(".remove-question").addEventListener("click", function () { row.remove(); });
    row._getData = function () {
      return {
        id: qid,
        text: row.querySelector(".q-text").value.trim(),
        axis: row.querySelector(".q-axis").value,
        direction: row.querySelector(".q-direction").value,
        time: Math.max(5, parseInt(row.querySelector(".q-time").value, 10) || 15)
      };
    };
  }

  function saveAffinityFromModal() {
    var title = document.getElementById("affTitleInput").value.trim();
    if (!title) { U.toast("Le titre est requis."); return; }
    var rows = document.querySelectorAll("#affQuestions .question-row");
    var questions = [];
    rows.forEach(function (row) {
      var data = row._getData();
      if (data.text) questions.push(data);
    });
    if (questions.length === 0) { U.toast("Ajoute au moins un item."); return; }

    var publishAtVal = document.getElementById("affPublishAt").value;
    NexiStore.upsertAffinity({
      id: editingAffinityId,
      title: title,
      description: document.getElementById("affDescInput").value.trim(),
      visible: document.getElementById("affVisible").checked,
      published: document.getElementById("affPublished").checked,
      publishAt: publishAtVal ? new Date(publishAtVal).toISOString() : null,
      targetClasses: getSelectedClasses("affClasses"),
      questions: questions
    });
    closeModal("modalAffinity");
    renderAll();
    U.toast("Test d'affinité enregistré.");
  }

  function renderAffinities() {
    var grid = document.getElementById("affinitiesGrid");
    var list = NexiStore.listAffinities();
    if (list.length === 0) { grid.innerHTML = '<div class="empty-state">Aucun test d\'affinité créé.</div>'; return; }
    grid.innerHTML = list.map(function (a) {
      var attemptsCount = Object.keys(a.attempts || {}).length;
      return (
        '<div class="card">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
            '<div style="font-weight:800;">' + U.escapeHTML(a.title) + '</div>' +
            '<button class="btn btn-ghost btn-sm" data-edit-aff="' + a.id + '">Éditer</button>' +
          '</div>' +
          '<p style="font-size:.8rem;color:var(--nexi-ink-soft);margin:6px 0 10px;">' + U.escapeHTML(a.description || "—") + '</p>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' +
            '<span class="badge ' + (a.visible ? "badge-blue" : "badge-grey") + '">' + (a.visible ? "Visible" : "Invisible") + '</span>' +
            '<span class="badge ' + (a.published ? "badge-green" : "badge-amber") + '">' + (a.published ? "Publié" : "Non publié") + '</span>' +
            '<span class="badge badge-grey">' + a.questions.length + ' item(s)</span>' +
          '</div>' +
          '<div style="font-size:.76rem;color:var(--nexi-ink-soft);">' + attemptsCount + ' élève(s) ont répondu</div>' +
        '</div>'
      );
    }).join("");
    grid.querySelectorAll("[data-edit-aff]").forEach(function (btn) {
      btn.addEventListener("click", function () { openAffinityEditor(btn.getAttribute("data-edit-aff")); });
    });
  }

  /* ===================== ÉTABLISSEMENTS ===================== */

  function bindEstablishments() {
    document.getElementById("btnAddEstablishment").addEventListener("click", function () {
      document.getElementById("estName").value = "";
      document.getElementById("estSupName").value = "";
      document.getElementById("estSupId").value = "";
      document.getElementById("estSupPwd").value = "";
      document.getElementById("estMax").value = 50;
      openModal("modalEstablishment");
    });
    document.getElementById("btnSaveEstablishment").addEventListener("click", function () {
      var data = {
        name: document.getElementById("estName").value.trim(),
        supName: document.getElementById("estSupName").value.trim(),
        supIdentifiant: document.getElementById("estSupId").value.trim(),
        supPassword: document.getElementById("estSupPwd").value.trim(),
        maxStudents: document.getElementById("estMax").value
      };
      if (!data.name || !data.supName || !data.supIdentifiant || !data.supPassword) { U.toast("Tous les champs sont requis."); return; }
      var res = NexiStore.addEstablishment(data);
      if (!res.ok) { U.toast(res.error); return; }
      closeModal("modalEstablishment");
      renderAll();
      U.toast("Établissement et superviseur créés.");
    });

    document.getElementById("btnConfirmResolve").addEventListener("click", function () {
      var overrides = {
        name: document.getElementById("reqName").value.trim(),
        classe: document.getElementById("reqClasse").value.trim(),
        identifiant: document.getElementById("reqIdentifiant").value.trim()
      };
      var res = NexiStore.resolveRequest(resolvingRequestId, "validate", overrides);
      if (!res.ok) { U.toast(res.error); return; }
      closeModal("modalResolveRequest");
      renderAll();
      alert("Élève créé !\nIdentifiant : " + res.user.identifiant + "\nMot de passe généré : " + res.generatedPassword);
    });
  }

  function renderEstablishments() {
    var grid = document.getElementById("establishmentsGrid");
    var list = NexiStore.listEstablishments();
    if (list.length === 0) { grid.innerHTML = '<div class="empty-state">Aucun établissement créé.</div>'; return; }
    var db = NexiStore.getDB();
    grid.innerHTML = list.map(function (e) {
      var sup = db.users.find(function (u) { return u.id === e.supervisorId; });
      var count = NexiStore.studentsOf(e.id).length;
      return (
        '<div class="card">' +
          '<div style="font-weight:800;">' + U.escapeHTML(e.name) + '</div>' +
          '<div style="font-size:.8rem;color:var(--nexi-ink-soft);margin:6px 0;">Superviseur : ' + (sup ? U.escapeHTML(sup.displayName) : "—") + '</div>' +
          '<span class="badge badge-blue">' + count + ' / ' + e.maxStudents + ' élèves</span>' +
        '</div>'
      );
    }).join("");
  }

  function renderPendingRequests() {
    var wrap = document.getElementById("pendingRequestsList");
    var list = NexiStore.listPendingRequests();
    if (list.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucune suggestion en attente.</div>'; return; }
    var db = NexiStore.getDB();
    wrap.innerHTML = '<div class="table-scroll"><table class="data-table"><thead><tr><th>Élève</th><th>Classe</th><th>Identifiant souhaité</th><th>Établissement</th><th></th></tr></thead><tbody>' +
      list.map(function (r) {
        var est = db.establishments.find(function (e) { return e.id === r.establishmentId; });
        return '<tr>' +
          '<td>' + U.escapeHTML(r.name) + '</td>' +
          '<td>' + U.escapeHTML(r.classe || "—") + '</td>' +
          '<td>@' + U.escapeHTML(r.desiredIdentifiant) + '</td>' +
          '<td>' + (est ? U.escapeHTML(est.name) : "—") + '</td>' +
          '<td style="white-space:nowrap;">' +
            '<button class="btn btn-primary btn-sm" data-validate="' + r.id + '">Valider</button> ' +
            '<button class="btn btn-ghost btn-sm" data-modify="' + r.id + '">Modifier</button> ' +
            '<button class="btn btn-danger btn-sm" data-refuse="' + r.id + '">Refuser</button>' +
          '</td>' +
        '</tr>';
      }).join("") + '</tbody></table></div>';

    wrap.querySelectorAll("[data-validate]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-validate");
        var res = NexiStore.resolveRequest(id, "validate");
        if (!res.ok) { U.toast(res.error); return; }
        renderAll();
        alert("Élève créé !\nIdentifiant : " + res.user.identifiant + "\nMot de passe généré : " + res.generatedPassword);
      });
    });
    wrap.querySelectorAll("[data-refuse]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        NexiStore.resolveRequest(btn.getAttribute("data-refuse"), "refuse");
        renderAll();
        U.toast("Suggestion refusée.");
      });
    });
    wrap.querySelectorAll("[data-modify]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-modify");
        var req = NexiStore.listPendingRequests().find(function (r) { return r.id === id; });
        if (!req) return;
        resolvingRequestId = id;
        document.getElementById("reqId").value = id;
        document.getElementById("reqName").value = req.name;
        document.getElementById("reqClasse").innerHTML = U.classOptionsHTML(req.classe, true);
        document.getElementById("reqClasse").value = req.classe;
        document.getElementById("reqIdentifiant").value = req.desiredIdentifiant;
        openModal("modalResolveRequest");
      });
    });
  }

  /* ===================== RÉGLAGES ===================== */

  function bindSettings() {
    document.getElementById("btnSaveSettings").addEventListener("click", function () {
      NexiStore.updateSettings({
        appName: document.getElementById("settingAppName").value.trim() || "NEXIONE",
        soundEnabled: document.getElementById("settingSound").checked
      });
      U.toast("Réglages enregistrés.");
    });
    document.getElementById("btnResetDemo").addEventListener("click", function () {
      if (!confirm("Réinitialiser toutes les données de démonstration ?")) return;
      NexiStore.resetDB();
      renderAll();
      U.toast("Données réinitialisées.");
    });

    document.getElementById("btnTestSync").addEventListener("click", function () {
      if (!(window.NEXI_CONFIG && window.NEXI_CONFIG.GOOGLE_SHEETS_ENABLED)) {
        U.toast("Active GOOGLE_SHEETS_ENABLED dans config.js d'abord.");
        return;
      }
      NexiSync.testConnection()
        .then(function () { U.toast("Connexion Google Sheets OK !"); renderSyncStatus(); })
        .catch(function (err) { U.toast("Échec de connexion : " + err.message); });
    });

    document.getElementById("btnForceSync").addEventListener("click", function () {
      NexiSync.flush().then(function () { renderSyncStatus(); U.toast("Synchronisation lancée."); });
    });
  }

  function renderSettings() {
    var s = NexiStore.settings();
    document.getElementById("settingAppName").value = s.appName;
    document.getElementById("settingSound").checked = !!s.soundEnabled;
    renderSyncStatus();
  }

  function renderSyncStatus() {
    var box = document.getElementById("syncStatusBox");
    var hint = document.getElementById("resetDemoHint");
    var enabled = !!(window.NEXI_CONFIG && window.NEXI_CONFIG.GOOGLE_SHEETS_ENABLED);
    if (!enabled) {
      box.innerHTML = '<span class="badge badge-grey">Mode démo — données locales uniquement</span>';
      hint.textContent = "Réinitialise toutes les données de démonstration (localStorage) à leur état d'origine.";
      return;
    }
    var st = NexiSync.status();
    box.innerHTML =
      '<span class="badge badge-green">Connecté — ' + U.escapeHTML(window.NEXI_CONFIG.SHEET_LABEL || "Google Sheet") + '</span>' +
      (st.queued > 0 ? '<span class="badge badge-amber">' + st.queued + ' en attente d\'envoi</span>' : '<span class="badge badge-blue">À jour</span>') +
      (st.lastFlushAt ? '<span style="font-size:.76rem;color:var(--nexi-ink-soft);">Dernière synchro : ' + U.fmtDateTime(st.lastFlushAt) + '</span>' : "");
    hint.textContent = "Ce bouton ne réinitialise que le cache local de démonstration — les données déjà envoyées à ton Google Sheet ne sont pas supprimées.";
  }
})();
