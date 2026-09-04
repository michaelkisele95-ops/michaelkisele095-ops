/* ============================================================
   NEXIONE — supervisor.js
   ============================================================ */

(function () {
  "use strict";

  var U = NexiUtils;
  var currentUser, establishment;

  document.addEventListener("DOMContentLoaded", function () {
    NexiStore.bootstrap().then(function (boot) {
      U.hideLoadingOverlay();
      U.showOfflineBannerIfNeeded(boot);

      currentUser = requireRole("supervisor");
      if (!currentUser) return;

      establishment = NexiStore.establishmentFor(currentUser.id);

      document.getElementById("whoName").textContent = currentUser.displayName;
      document.getElementById("whoBadge").textContent = U.initials(currentUser.displayName);
      document.getElementById("logoutBtn").addEventListener("click", function () {
        NexiStore.logout(); window.location.href = "index.html";
      });

      initTileNav("supTiles");
      bindSuggestion();
      bindExports();

      document.querySelectorAll(".modal-backdrop").forEach(function (b) {
        b.addEventListener("click", function (e) { if (e.target === b) b.classList.remove("show"); });
        b.querySelectorAll("[data-close]").forEach(function (btn) { btn.addEventListener("click", function () { b.classList.remove("show"); }); });
      });

      render();
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

  // Navigation "pages empilées" partagée (js/nav.js).
  function initTileNav(navId) {
    return NexiNav.initPageStack(navId);
  }

  function render() {
    if (!establishment) {
      document.getElementById("estHeadline").textContent = "Aucun établissement rattaché.";
      return;
    }
    var students = NexiStore.studentsOf(establishment.id);
    document.getElementById("estHeadline").textContent =
      currentUser.displayName + " — " + establishment.name + " [" + students.length + " élèves / " + establishment.maxStudents + "]";
    document.getElementById("statStudents").textContent = students.length + " / " + establishment.maxStudents;

    renderStudentsTable(students);
    renderStats(students);
  }

  function avgScoreFor(userId) {
    var db = NexiStore.getDB();
    var scores = [];
    db.challenges.forEach(function (c) {
      var a = c.attempts && c.attempts[userId];
      if (a) scores.push(a.percent);
    });
    if (scores.length === 0) return null;
    return Math.round(scores.reduce(function (s, v) { return s + v; }, 0) / scores.length);
  }

  function lastActivityFor(userId) {
    var db = NexiStore.getDB();
    var dates = [];
    db.challenges.forEach(function (c) { var a = c.attempts && c.attempts[userId]; if (a) dates.push(a.date); });
    db.affinities.forEach(function (a2) { var a = a2.attempts && a2.attempts[userId]; if (a) dates.push(a.date); });
    if (dates.length === 0) return null;
    return dates.sort().slice(-1)[0];
  }

  function renderStudentsTable(students) {
    var tbody = document.getElementById("studentsTableBody");
    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Aucun élève rattaché pour l\'instant.</div></td></tr>';
      return;
    }
    tbody.innerHTML = students.map(function (s) {
      var avg = avgScoreFor(s.id);
      var last = lastActivityFor(s.id);
      var avatarSrc = NexiStore.avatarUrl(s.avatar);
      return '<tr class="clickable" data-student="' + s.id + '">' +
        '<td><div class="avatar-badge" style="width:30px;height:30px;font-size:.85rem;">' + (avatarSrc ? '<img src="' + avatarSrc + '" alt="">' : (s.avatar || U.initials(s.displayName))) + '</div></td>' +
        '<td style="font-weight:700;">' + U.escapeHTML(s.displayName) + '</td>' +
        '<td>@' + U.escapeHTML(s.identifiant) + '</td>' +
        '<td>' + U.escapeHTML(s.classe || "—") + '</td>' +
        '<td><span class="badge ' + (s.blocked ? "badge-red" : "badge-green") + '">' + (s.blocked ? "Inactif" : "Actif") + '</span></td>' +
        '<td>' + (avg == null ? "—" : avg + "%") + '</td>' +
        '<td>' + (last ? U.fmtDateTime(last) : "—") + '</td>' +
      '</tr>';
    }).join("");
    tbody.querySelectorAll("[data-student]").forEach(function (row) {
      row.addEventListener("click", function () { openStudentProfile(row.getAttribute("data-student")); });
    });
  }

  function openStudentProfile(studentId) {
    var db = NexiStore.getDB();
    var s = db.users.find(function (u) { return u.id === studentId; });
    if (!s) return;

    document.getElementById("studentModalTitle").textContent = "Profil de " + s.displayName;

    var chalRows = db.challenges.map(function (c) {
      var a = c.attempts && c.attempts[studentId];
      if (!a) return null;
      return { title: c.title, score: a.score, total: a.total, percent: a.percent, date: a.date };
    }).filter(Boolean);

    var affRows = db.affinities.map(function (a2) {
      var a = a2.attempts && a2.attempts[studentId];
      if (!a) return null;
      return { title: a2.title, label: a.profileLabel, date: a.date, axesScores: a.axesScores };
    }).filter(Boolean);

    var strengths = NexiStore.cumulativeLearningProfile(studentId);
    var monthlyProfile = NexiStore.monthlyLearningProfile(studentId, NexiStore.currentYearMonth());
    var classmates = NexiStore.studentsOf(s.establishmentId).filter(function (c) { return c.id !== studentId; });
    var myAvg = avgScoreFor(studentId);
    var classAvgs = classmates.map(function (c) { return avgScoreFor(c.id); }).filter(function (v) { return v != null; });
    var classAvg = classAvgs.length ? Math.round(classAvgs.reduce(function (a, b) { return a + b; }, 0) / classAvgs.length) : null;
    var lastAffinityLabel = affRows.length ? affRows[affRows.length - 1].label : null;

    var body = document.getElementById("studentModalBody");
    body.innerHTML =
      '<div class="card-grid" style="margin-bottom:18px;">' +
        '<div class="card"><div class="field-hint">Défis réalisés</div><div style="font-size:1.4rem;font-weight:800;">' + chalRows.length + '</div></div>' +
        '<div class="card"><div class="field-hint">Affinités complétées</div><div style="font-size:1.4rem;font-weight:800;">' + affRows.length + '</div></div>' +
        '<div class="card"><div class="field-hint">Score moyen</div><div style="font-size:1.4rem;font-weight:800;">' + (myAvg == null ? "—" : myAvg + "%") + '</div></div>' +
      '</div>' +
      (lastAffinityLabel ? '<div class="badge badge-blue" style="margin-bottom:14px;">Dernier profil d\'affinité : ' + U.escapeHTML(lastAffinityLabel) + '</div>' : "") +

      '<h4 style="font-size:.9rem;margin-bottom:2px;">Profil d\'apprentissage mensuel — ' + U.escapeHTML(NexiStore.monthLabelFR(NexiStore.currentYearMonth())) + '</h4>' +
      '<p style="font-size:.74rem;color:var(--nexi-ink-soft);margin:0 0 8px;">Agrégation des défis hebdomadaires réalisés ce mois-ci, par domaine (Éducation Nationale RDC).</p>' +
      (monthlyProfile.filter(function (r) { return r.total > 0; }).length === 0 ? '<div class="empty-state">Pas encore de défi ce mois-ci.</div>' :
        monthlyProfile.filter(function (r) { return r.total > 0; }).map(function (r) {
          return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
            '<div style="width:150px;font-size:.8rem;color:var(--nexi-ink-soft);">' + r.category + '</div>' +
            '<div style="flex:1;height:8px;border-radius:99px;background:#EEF0F8;overflow:hidden;"><div style="height:100%;width:' + r.percent + '%;background:' + (r.percent >= 60 ? "var(--nexi-green)" : "var(--nexi-amber)") + ';"></div></div>' +
            '<div style="width:40px;text-align:right;font-size:.8rem;font-weight:700;">' + r.percent + '%</div>' +
          '</div>';
        }).join("")) +

      '<h4 style="font-size:.9rem;margin:20px 0 2px;">Profil d\'apprentissage cumulé (forces & faiblesses, tous domaines)</h4>' +
      '<p style="font-size:.74rem;color:var(--nexi-ink-soft);margin:0 0 8px;">Visible par l\'élève, son superviseur et l\'administration. Ne remplace pas une évaluation pédagogique spécifique.</p>' +
      (strengths.filter(function(r){return r.total>0;}).length === 0 ? '<div class="empty-state">Pas encore de données.</div>' :
        strengths.filter(function (r) { return r.total > 0; }).map(function (r) {
          return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
            '<div style="width:150px;font-size:.8rem;color:var(--nexi-ink-soft);">' + r.category + '</div>' +
            '<div style="flex:1;height:8px;border-radius:99px;background:#EEF0F8;overflow:hidden;"><div style="height:100%;width:' + r.percent + '%;background:' + (r.percent >= 60 ? "var(--nexi-green)" : "var(--nexi-amber)") + ';"></div></div>' +
            '<div style="width:40px;text-align:right;font-size:.8rem;font-weight:700;">' + r.percent + '%</div>' +
          '</div>';
        }).join("")) +

      '<h4 style="font-size:.9rem;margin:18px 0 8px;">Détail des défis passés</h4>' +
      (chalRows.length === 0 ? '<div class="empty-state">Aucun défi réalisé.</div>' :
        '<div class="table-scroll"><table class="data-table"><thead><tr><th>Défi</th><th>Score</th><th>Date</th></tr></thead><tbody>' +
        chalRows.map(function (r) { return '<tr><td>' + U.escapeHTML(r.title) + '</td><td>' + r.score + '/' + r.total + ' (' + r.percent + '%)</td><td>' + U.fmtDate(r.date) + '</td></tr>'; }).join("") +
        '</tbody></table></div>') +

      '<h4 style="font-size:.9rem;margin:18px 0 8px;">Détail des affinités</h4>' +
      (affRows.length === 0 ? '<div class="empty-state">Aucun test complété.</div>' :
        affRows.map(function (r) {
          return '<div class="card" style="margin-bottom:10px;"><b>' + U.escapeHTML(r.label) + '</b><div class="field-hint">' + U.escapeHTML(r.title) + ' · ' + U.fmtDate(r.date) + '</div></div>';
        }).join("")) +

      '<h4 style="font-size:.9rem;margin:18px 0 8px;">Comparatif classe</h4>' +
      '<div class="field-hint">Score moyen élève : <b>' + (myAvg == null ? "—" : myAvg + "%") + '</b> · Moyenne de la classe : <b>' + (classAvg == null ? "—" : classAvg + "%") + '</b></div>';

    document.getElementById("modalStudent").classList.add("show");
  }

  function bindSuggestion() {
    document.getElementById("sugClasse").innerHTML = U.classOptionsHTML(null, true);
    document.getElementById("btnSendSuggestion").addEventListener("click", function () {
      if (!establishment) { U.toast("Aucun établissement rattaché."); return; }
      var name = document.getElementById("sugName").value.trim();
      var classe = document.getElementById("sugClasse").value.trim();
      var identifiant = document.getElementById("sugIdentifiant").value.trim();
      if (!name || !identifiant) { U.toast("Nom et identifiant souhaité sont requis."); return; }
      NexiStore.suggestStudent(establishment.id, { name: name, classe: classe, desiredIdentifiant: identifiant });
      document.getElementById("sugName").value = "";
      document.getElementById("sugClasse").value = "";
      document.getElementById("sugIdentifiant").value = "";
      U.toast("Suggestion envoyée à l'administrateur.");
    });
  }

  function renderStats(students) {
    var avgs = students.map(function (s) { return avgScoreFor(s.id); }).filter(function (v) { return v != null; });
    var schoolAvg = avgs.length ? Math.round(avgs.reduce(function (a, b) { return a + b; }, 0) / avgs.length) : null;
    document.getElementById("statAvg").textContent = schoolAvg == null ? "—" : schoolAvg + "%";

    var db = NexiStore.getDB();
    var totalPossible = students.length * db.challenges.length;
    var totalDone = 0;
    students.forEach(function (s) { db.challenges.forEach(function (c) { if (c.attempts[s.id]) totalDone++; }); });
    document.getElementById("statParticipation").textContent = totalPossible ? Math.round((totalDone / totalPossible) * 100) + "%" : "—";
    document.getElementById("statActive").textContent = students.filter(function (s) { return !s.blocked; }).length;

    var ranking = students.map(function (s) { return { s: s, avg: avgScoreFor(s.id) }; })
      .filter(function (r) { return r.avg != null; })
      .sort(function (a, b) { return b.avg - a.avg; });

    var rankEl = document.getElementById("internalRanking");
    rankEl.innerHTML = ranking.length === 0 ? '<div class="empty-state">Pas encore de résultats.</div>' :
      ranking.map(function (r, i) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F0F3FC;">' +
          '<div style="width:24px;font-weight:800;color:var(--nexi-ink-soft);">' + (i + 1) + '</div>' +
          '<div style="flex:1;">' + U.escapeHTML(r.s.displayName) + '</div>' +
          '<div style="font-weight:800;">' + r.avg + '%</div>' +
        '</div>';
      }).join("");

    var allStrengths = {};
    NexiStore.CATEGORIES.forEach(function (c) { allStrengths[c] = []; });
    students.forEach(function (s) {
      U.computeStrengths(db.challenges, s.id, NexiStore.CATEGORIES).forEach(function (row) {
        if (row.percent != null) {
          if (!allStrengths[row.category]) allStrengths[row.category] = []; // domaine personnalisé (saisi question par question)
          allStrengths[row.category].push(row.percent);
        }
      });
    });
    var catAverages = Object.keys(allStrengths).map(function (cat) {
      var arr = allStrengths[cat];
      var avg = arr.length ? Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) : null;
      return { cat: cat, avg: avg };
    }).filter(function (r) { return r.avg != null; }).sort(function (a, b) { return b.avg - a.avg; });

    var strengthsEl = document.getElementById("schoolStrengths");
    if (catAverages.length === 0) {
      strengthsEl.innerHTML = '<div class="empty-state">Pas encore de données.</div>';
    } else {
      var top3 = catAverages.slice(0, 3);
      var bottom3 = catAverages.slice(-3).reverse();
      strengthsEl.innerHTML =
        '<div class="field-hint" style="margin-bottom:6px;">Forces</div>' +
        top3.map(function (r) { return '<div class="badge badge-green" style="margin:2px 4px 2px 0;">' + r.cat + ' · ' + r.avg + '%</div>'; }).join("") +
        '<div class="field-hint" style="margin:12px 0 6px;">À renforcer</div>' +
        bottom3.map(function (r) { return '<div class="badge badge-amber" style="margin:2px 4px 2px 0;">' + r.cat + ' · ' + r.avg + '%</div>'; }).join("");
    }
  }

  function bindExports() {
    document.getElementById("btnExportCSV").addEventListener("click", function () {
      if (!establishment) return;
      var students = NexiStore.studentsOf(establishment.id);
      var rows = [["Nom", "Identifiant", "Classe", "Score moyen (%)", "Dernière activité"]];
      students.forEach(function (s) {
        rows.push([s.displayName, s.identifiant, s.classe || "", avgScoreFor(s.id) == null ? "" : avgScoreFor(s.id), lastActivityFor(s.id) ? U.fmtDateTime(lastActivityFor(s.id)) : ""]);
      });
      U.downloadCSV("bulletin_nexione_" + establishment.name.replace(/\s+/g, "_") + ".csv", rows);
    });
    document.getElementById("btnExportPDF").addEventListener("click", function () {
      window.print();
    });
  }
})();
