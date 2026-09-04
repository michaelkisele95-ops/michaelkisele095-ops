/* ============================================================
   NEXIONE — child.js (Dashboard Enfant)
   Accueil gamifié + flux Défi (mode examen chronométré) +
   flux Affinités (Likert) + Profil + Progression + Classement.
   ============================================================ */

(function () {
  "use strict";

  var U = NexiUtils;
  var user = null;
  var bot = null;

  var THEMES = [
    { id: "blue", label: "Nuit bleue", color: "linear-gradient(135deg,#2F6BFF,#0B1B5C)" },
    { id: "amber", label: "Ambre", color: "linear-gradient(135deg,#FFB020,#C97A00)" },
    { id: "green", label: "Émeraude", color: "linear-gradient(135deg,#1FB67A,#0B6B47)" },
    { id: "red", label: "Corail", color: "linear-gradient(135deg,#E5484D,#8C1F23)" }
  ];

  // Messages du Nexi Bot selon la section visitée (réactivité demandée : le bot
  // commente chaque navigation, pas seulement les réponses de quiz).
  var PANEL_BOT_LINES = {
    "panel-defis": "Voici les défis de la semaine, prêt(e) à te lancer ?",
    "panel-affinites": "Explorons ensemble tes centres d'intérêt !",
    "panel-profil": "Ton profil, tes couleurs, ton style.",
    "panel-progression": "Regarde le chemin parcouru !",
    "panel-classement": "Voyons qui est en tête cette semaine !"
  };

  // état de l'examen en cours (défi ou test d'affinité)
  var exam = null;

  document.addEventListener("DOMContentLoaded", function () {
    NexiStore.bootstrap().then(function (boot) {
      U.hideLoadingOverlay();
      U.showOfflineBannerIfNeeded(boot);

      user = requireRole("child");
      if (!user) return;

      NexiStore.applyScheduledPublications();

      document.getElementById("whoName").textContent = user.identifiant;
      document.getElementById("whoRole").textContent = "Élève";
      renderWhoBadge();
      document.getElementById("logoutBtn").addEventListener("click", function () {
        NexiStore.logout();
        window.location.href = "index.html";
      });

      bot = NexiBot.mount(document.getElementById("botHero"));

      document.getElementById("tileIconDefis").innerHTML = NexiIcons.trophy();
      document.getElementById("tileIconAff").innerHTML = NexiIcons.compass();
      document.getElementById("tileIconProgress").innerHTML = NexiIcons.star();
      document.getElementById("tileIconRank").innerHTML = NexiIcons.medal();

      pageStack = NexiNav.initPageStack("childTiles", reactBot);
      bindProfile();
      bindSaveProfile();

      renderAll();
    });
  });

  function renderWhoBadge() {
    var el = document.getElementById("whoBadge");
    var src = NexiStore.avatarUrl(user.avatar);
    el.innerHTML = src ? '<img src="' + src + '" alt="">' : (user.avatar || "🙂");
  }

  function requireRole(role) {
    var u = NexiStore.currentUser();
    if (!u || u.role !== role || u.blocked) {
      NexiStore.logout();
      window.location.href = "index.html";
      return null;
    }
    return u;
  }

  var pageStack = null;

  function reactBot(panelId) {
    if (!bot) return;
    // Réaction discrète (pulse), jamais une bulle qui s'ouvre toute seule —
    // seul un clic volontaire sur le bot révèle le message.
    var line = PANEL_BOT_LINES[panelId];
    if (line) bot.hint(line);
  }

  function showPanel(id) {
    if (pageStack) pageStack.showPanel(id);
  }

  function refreshUser() {
    user = NexiStore.currentUser();
  }

  function renderAll() {
    refreshUser();
    renderChallenges();
    renderAffinities();
    renderProfile();
    renderProgression();
    renderLeaderboard();
  }

  /* ===================== DÉFIS ===================== */

  function renderChallenges() {
    var list = NexiStore.listChallenges().filter(function (c) {
      return c.visible && c.published && NexiStore.isVisibleForClass(c, user.classe);
    });
    var grid = document.getElementById("challengesList");
    document.getElementById("tileDefisSub").textContent =
      list.filter(function (c) { return !NexiStore.hasAttempted(c, user.id); }).length + " à faire";

    if (list.length === 0) {
      grid.innerHTML = '<div class="empty-state">Aucun défi disponible pour l\'instant. Reviens bientôt !</div>';
      return;
    }
    grid.innerHTML = list.map(function (c) {
      var done = NexiStore.hasAttempted(c, user.id);
      var attempt = done ? c.attempts[user.id] : null;
      var domains = Array.from(new Set(c.questions.map(function (q) { return q.category || "Culture générale"; })));
      return (
        '<div class="card">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
            '<h3 style="font-size:1rem;">' + U.escapeHTML(c.title) + '</h3>' +
            (done ? '<span class="badge badge-green">Terminé</span>' : '<span class="badge badge-amber">' + c.questions.length + ' Q</span>') +
          '</div>' +
          (c.week ? '<div class="badge badge-blue" style="margin-top:6px;">' + U.escapeHTML(c.week) + '</div>' : "") +
          '<p style="font-size:.82rem;color:#9AA6E0;margin:8px 0 4px;">' + U.escapeHTML(c.description || "") + '</p>' +
          '<p style="font-size:.74rem;color:#7C8AC9;margin:0 0 14px;">Domaines : ' + U.escapeHTML(domains.join(", ")) + '</p>' +
          (done
            ? '<div class="badge badge-blue">Score : ' + attempt.score + '/' + attempt.total + ' (' + attempt.percent + '%)</div>'
            : '<button class="btn btn-amber btn-sm" data-start-challenge="' + c.id + '">Rejoindre le défi</button>') +
        '</div>'
      );
    }).join("");

    grid.querySelectorAll("[data-start-challenge]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = NexiStore.getChallenge(btn.getAttribute("data-start-challenge"));
        if (!c || NexiStore.hasAttempted(c, user.id)) { U.toast("Ce défi a déjà été réalisé."); return; }
        if (bot) bot.say("C'est parti pour « " + c.title + " » !");
        startChallengeExam(c);
      });
    });
  }

  function startChallengeExam(challenge) {
    exam = {
      kind: "challenge",
      item: challenge,
      questions: challenge.questions,
      idx: 0,
      answers: {},
      correctCount: 0,
      startedAt: Date.now(),
      timeLeft: 0,
      timerId: null
    };
    showPanel("panel-exam");
    document.getElementById("childTiles").querySelectorAll(".tile").forEach(function (t) { t.classList.remove("active"); });
    renderExamQuestion();
  }

  function renderExamQuestion() {
    var wrap = document.getElementById("panel-exam");
    var q = exam.questions[exam.idx];
    var total = exam.questions.length;
    var isMulti = exam.kind === "challenge" ? !!q.multi : false;
    var letters = ["A", "B", "C", "D", "E", "F"];

    wrap.innerHTML =
      '<div class="exam-wrap">' +
        '<div class="exam-progress"><div style="width:' + Math.round((exam.idx / total) * 100) + '%"></div></div>' +
        '<div class="exam-meta">' +
          '<span>Question ' + (exam.idx + 1) + ' / ' + total + (isMulti ? ' · plusieurs réponses possibles' : '') + '</span>' +
          '<span class="timer-ring" id="examTimer">⏱ ' + q.time + 's</span>' +
        '</div>' +
        '<div class="exam-question">' + U.escapeHTML(q.text) + '</div>' +
        '<div class="exam-options" id="examOptions">' +
          q.options.map(function (opt, i) {
            return '<div class="opt" data-i="' + i + '"><span class="letter">' + letters[i] + '</span><span>' + U.escapeHTML(opt) + '</span></div>';
          }).join("") +
        '</div>' +
        '<div class="modal-foot" style="justify-content:flex-end;">' +
          '<button class="btn btn-primary" id="btnValidateExam">Valider ma réponse</button>' +
        '</div>' +
      '</div>';

    var selected = [];
    wrap.querySelectorAll(".opt").forEach(function (optEl) {
      optEl.addEventListener("click", function () {
        var i = Number(optEl.getAttribute("data-i"));
        if (isMulti) {
          optEl.classList.toggle("selected");
          selected = Array.prototype.slice.call(wrap.querySelectorAll(".opt.selected")).map(function (e) { return Number(e.getAttribute("data-i")); });
        } else {
          wrap.querySelectorAll(".opt").forEach(function (o) { o.classList.remove("selected"); });
          optEl.classList.add("selected");
          selected = [i];
        }
      });
    });

    document.getElementById("btnValidateExam").addEventListener("click", function () {
      submitExamAnswer(selected.slice());
    });

    // Timer par question
    exam.timeLeft = q.time;
    updateTimerDisplay();
    clearInterval(exam.timerId);
    exam.timerId = setInterval(function () {
      exam.timeLeft--;
      updateTimerDisplay();
      if (exam.timeLeft <= 0) {
        clearInterval(exam.timerId);
        submitExamAnswer(selected.slice());
      }
    }, 1000);

    function updateTimerDisplay() {
      var t = document.getElementById("examTimer");
      if (!t) return;
      t.textContent = "⏱ " + Math.max(0, exam.timeLeft) + "s";
      t.classList.toggle("urgent", exam.timeLeft <= 5);
    }
  }

  function submitExamAnswer(selected) {
    clearInterval(exam.timerId);
    var q = exam.questions[exam.idx];
    exam.answers[q.id] = selected;

    if (exam.kind === "challenge") {
      var ok = U.arraysEqualAsSets(selected.slice().sort(), q.correct.slice().sort());
      if (ok) exam.correctCount++;
      // hint() plutôt que say() : pendant un défi de 25 questions, une bulle
      // qui s'ouvre après chaque réponse serait envahissante — un pulse discret suffit.
      if (bot) bot.hint(ok ? NexiBot.cheer() : NexiBot.wrongAnswer());
    }

    exam.idx++;
    if (exam.idx < exam.questions.length) {
      setTimeout(renderExamQuestion, exam.kind === "challenge" ? 550 : 150);
    } else {
      setTimeout(finishExam, exam.kind === "challenge" ? 550 : 150);
    }
  }

  function finishExam() {
    if (exam.kind === "challenge") finishChallengeExam();
    else finishAffinityExam();
  }

  function finishChallengeExam() {
    var result = U.scoreChallenge(exam.item.questions, exam.answers);
    var durationSec = Math.round((Date.now() - exam.startedAt) / 1000);
    NexiStore.recordChallengeAttempt(exam.item.id, user.id, {
      score: result.score,
      total: result.total,
      percent: result.percent,
      durationSec: durationSec,
      answers: exam.answers
    });

    var passed = result.percent >= 50;
    var provisional = NexiStore.provisionalProfileForChallenge(exam.item.id, user.id);
    var wrap = document.getElementById("panel-exam");
    wrap.innerHTML =
      '<div class="exam-wrap result-card">' +
        '<div style="font-size:2.4rem;">' + (passed ? "🎉" : "💪") + '</div>' +
        '<div class="result-score">' + result.score + '<span> / ' + result.total + '</span></div>' +
        '<p style="color:#9AA6E0;margin:10px 0 18px;">' + (passed ? "Bravo, défi réussi !" : "Défi terminé — chaque essai compte.") + '</p>' +
      '</div>' +
      '<div style="text-align:left;margin:10px 0 22px;">' +
        '<h4 style="font-size:.88rem;margin-bottom:2px;">Ton profil d\'apprentissage provisoire</h4>' +
        '<p style="font-size:.72rem;color:#7C8AC9;margin:0 0 10px;">Basé sur ce seul défi — ne remplace pas le profil complet, plus spécifique, que ton établissement établit à partir de toutes tes données.</p>' +
        (provisional.length === 0
          ? ""
          : provisional.map(function (r) {
              return '<div class="axis-bar-row"><div class="axis-label">' + U.escapeHTML(r.category) + '</div>' +
                '<div class="axis-bar-track"><div class="axis-bar-fill" style="width:' + r.percent + '%"></div></div>' +
                '<div class="axis-val">' + r.percent + '%</div></div>';
            }).join("")) +
      '</div>' +
      '<button class="btn btn-amber" id="btnBackToChallenges" style="width:100%;">Retour aux défis</button>';

    if (passed) U.confettiBurst();
    if (bot) bot.say(passed ? NexiBot.cheer() : NexiBot.encourage());

    document.getElementById("btnBackToChallenges").addEventListener("click", function () {
      exam = null;
      showPanel("panel-defis");
      renderAll();
    });
  }

  /* ===================== AFFINITÉS ===================== */

  function renderAffinities() {
    var list = NexiStore.listAffinities().filter(function (a) { return a.visible && a.published && NexiStore.isVisibleForClass(a, user.classe); });
    var grid = document.getElementById("affinitiesList");
    document.getElementById("tileAffSub").textContent =
      list.filter(function (a) { return !NexiStore.hasAttempted(a, user.id); }).length + " à faire";

    if (list.length === 0) {
      grid.innerHTML = '<div class="empty-state">Aucun test d\'affinité disponible pour l\'instant.</div>';
      return;
    }
    grid.innerHTML = list.map(function (a) {
      var done = NexiStore.hasAttempted(a, user.id);
      var attempt = done ? a.attempts[user.id] : null;
      return (
        '<div class="card">' +
          '<h3 style="font-size:1rem;">' + U.escapeHTML(a.title) + '</h3>' +
          '<p style="font-size:.82rem;color:#9AA6E0;margin:8px 0 14px;">' + U.escapeHTML(a.description || "") + '</p>' +
          (done
            ? '<button class="btn btn-ghost btn-sm" data-view-affinity="' + a.id + '">Voir mon profil : ' + U.escapeHTML(attempt.profileLabel) + '</button>'
            : '<button class="btn btn-amber btn-sm" data-start-affinity="' + a.id + '">Commencer</button>') +
        '</div>'
      );
    }).join("");

    grid.querySelectorAll("[data-start-affinity]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var a = NexiStore.getAffinity(btn.getAttribute("data-start-affinity"));
        if (!a || NexiStore.hasAttempted(a, user.id)) { U.toast("Déjà réalisé aujourd'hui."); return; }
        if (bot) bot.say("Aucune bonne ou mauvaise réponse, sois toi-même !");
        startAffinityExam(a);
      });
    });
    grid.querySelectorAll("[data-view-affinity]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var a = NexiStore.getAffinity(btn.getAttribute("data-view-affinity"));
        showAffinityResult(a, a.attempts[user.id]);
      });
    });
  }

  function startAffinityExam(affinity) {
    exam = {
      kind: "affinity",
      item: affinity,
      questions: affinity.questions,
      idx: 0,
      answers: {},
      startedAt: Date.now(),
      timerId: null
    };
    showPanel("panel-exam");
    document.getElementById("childTiles").querySelectorAll(".tile").forEach(function (t) { t.classList.remove("active"); });
    renderAffinityQuestion();
  }

  function renderAffinityQuestion() {
    var wrap = document.getElementById("panel-exam");
    var q = exam.questions[exam.idx];
    var total = exam.questions.length;
    var labels = ["Pas du tout", "Un peu", "Neutre", "Assez", "Tout à fait"];

    wrap.innerHTML =
      '<div class="exam-wrap">' +
        '<div class="exam-progress"><div style="width:' + Math.round((exam.idx / total) * 100) + '%"></div></div>' +
        '<div class="exam-meta"><span>Item ' + (exam.idx + 1) + ' / ' + total + '</span><span>Aucune bonne ou mauvaise réponse</span></div>' +
        '<div class="exam-question">' + U.escapeHTML(q.text) + '</div>' +
        '<div class="likert" id="likertRow">' +
          [1, 2, 3, 4, 5].map(function (v) {
            return '<button type="button" data-v="' + v + '">' + labels[v - 1] + '</button>';
          }).join("") +
        '</div>' +
        '<div class="modal-foot" style="justify-content:flex-end;">' +
          '<button class="btn btn-primary" id="btnValidateExam" disabled>Suivant</button>' +
        '</div>' +
      '</div>';

    var chosen = null;
    var row = document.getElementById("likertRow");
    row.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        row.querySelectorAll("button").forEach(function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
        chosen = Number(b.getAttribute("data-v"));
        document.getElementById("btnValidateExam").disabled = false;
      });
    });

    document.getElementById("btnValidateExam").addEventListener("click", function () {
      exam.answers[q.id] = chosen;
      exam.idx++;
      if (exam.idx < exam.questions.length) renderAffinityQuestion();
      else finishAffinityExam();
    });
  }

  function finishAffinityExam() {
    var result = U.scoreAffinity(exam.item.questions, exam.answers, NexiStore.AXES);
    NexiStore.recordAffinityAttempt(exam.item.id, user.id, result);
    if (bot) bot.say("Ton profil du jour est prêt : " + result.profileLabel + " !");
    showAffinityResult(exam.item, {
      axesScores: result.axesScores,
      profileLabel: result.profileLabel,
      recommendations: result.recommendations
    });
    exam = null;
  }

  function showAffinityResult(affinity, attempt) {
    var wrap = document.getElementById("panel-exam");
    var maxVal = 5;
    wrap.innerHTML =
      '<div class="exam-wrap">' +
        '<div class="result-card" style="padding:10px 10px 24px;">' +
          '<div style="font-size:2.2rem;">🧭</div>' +
          '<h3 style="margin:10px 0 4px;">' + U.escapeHTML(attempt.profileLabel) + '</h3>' +
          '<p style="color:#9AA6E0;font-size:.85rem;">' + U.escapeHTML(affinity.title) + '</p>' +
        '</div>' +
        '<div style="margin:14px 0 22px;">' +
          attempt.axesScores.map(function (ax) {
            return (
              '<div class="axis-bar-row">' +
                '<div class="axis-label">' + U.escapeHTML(ax.pos) + ' ↔ ' + U.escapeHTML(ax.neg) + '</div>' +
                '<div class="axis-bar-track"><div class="axis-bar-fill" style="width:' + Math.round((ax.avg / maxVal) * 100) + '%"></div></div>' +
                '<div class="axis-val">' + ax.avg + '</div>' +
              '</div>'
            );
          }).join("") +
        '</div>' +
        '<h4 style="font-size:.9rem;margin-bottom:8px;">Recommandations</h4>' +
        '<ul style="margin:0 0 20px;padding-left:18px;font-size:.85rem;color:#EAF0FF;">' +
          attempt.recommendations.map(function (r) { return '<li style="margin-bottom:6px;">' + U.escapeHTML(r) + '</li>'; }).join("") +
        '</ul>' +
        '<button class="btn btn-amber" id="btnBackToAffinities">Retour aux affinités</button>' +
      '</div>';

    document.getElementById("btnBackToAffinities").addEventListener("click", function () {
      showPanel("panel-affinites");
      renderAll();
    });
  }

  /* ===================== PROFIL ===================== */

  function bindProfile() {
    var avatarPicker = document.getElementById("avatarPicker");
    avatarPicker.innerHTML = NexiStore.AVATAR_IDS.map(function (id) {
      return '<div class="picker-item" data-avatar="' + id + '"><img src="' + NexiStore.avatarUrl(id) + '" alt=""></div>';
    }).join("");
    avatarPicker.querySelectorAll("[data-avatar]").forEach(function (el) {
      el.addEventListener("click", function () {
        avatarPicker.querySelectorAll(".picker-item").forEach(function (x) { x.classList.remove("selected"); });
        el.classList.add("selected");
      });
    });

    var themePicker = document.getElementById("themePicker");
    themePicker.innerHTML = THEMES.map(function (t) {
      return '<div class="theme-swatch" data-theme="' + t.id + '" title="' + t.label + '" style="background:' + t.color + '"></div>';
    }).join("");
    themePicker.querySelectorAll("[data-theme]").forEach(function (el) {
      el.addEventListener("click", function () {
        themePicker.querySelectorAll(".theme-swatch").forEach(function (x) { x.classList.remove("selected"); });
        el.classList.add("selected");
      });
    });
  }

  function bindSaveProfile() {
    document.getElementById("btnSaveProfile").addEventListener("click", function () {
      var avatarEl = document.querySelector("#avatarPicker .picker-item.selected");
      var themeEl = document.querySelector("#themePicker .theme-swatch.selected");
      var patch = {};
      if (avatarEl) patch.avatar = avatarEl.getAttribute("data-avatar");
      if (themeEl) patch.theme = themeEl.getAttribute("data-theme");
      NexiStore.updateUser(user.id, patch);
      refreshUser();
      renderWhoBadge();
      U.toast("Profil enregistré !");
      if (bot) bot.say("Beau style !");
      renderProfile();
    });
  }

  function renderProfile() {
    document.getElementById("realNameDesc").textContent =
      "Nom : " + user.displayName + " · Identifiant : " + user.identifiant + (user.classe ? " · Classe : " + user.classe : "");
    document.querySelectorAll("#avatarPicker .picker-item").forEach(function (el) {
      el.classList.toggle("selected", el.getAttribute("data-avatar") === user.avatar);
    });
    document.querySelectorAll("#themePicker .theme-swatch").forEach(function (el) {
      el.classList.toggle("selected", el.getAttribute("data-theme") === user.theme);
    });
    renderLearningProfile();
  }

  function renderLearningProfile() {
    var box = document.getElementById("learningProfileBox");
    if (!box) return;
    var cumulative = NexiStore.cumulativeLearningProfile(user.id);
    var yearMonth = NexiStore.currentYearMonth();
    var monthly = NexiStore.monthlyLearningProfile(user.id, yearMonth);
    var affinities = NexiStore.listAffinities();
    var lastAffinity = null;
    affinities.forEach(function (a) { if (a.attempts[user.id]) lastAffinity = a.attempts[user.id]; });

    function bars(rows) {
      if (rows.length === 0) return '<div class="empty-state" style="padding:10px;">Pas encore de données.</div>';
      return rows.map(function (r) {
        return '<div class="axis-bar-row"><div class="axis-label">' + U.escapeHTML(r.category) + '</div>' +
          '<div class="axis-bar-track"><div class="axis-bar-fill" style="width:' + r.percent + '%"></div></div>' +
          '<div class="axis-val">' + r.percent + '%</div></div>';
      }).join("");
    }

    box.innerHTML =
      '<h4 style="font-size:.88rem;margin-bottom:2px;">Profil du mois — ' + U.escapeHTML(NexiStore.monthLabelFR(yearMonth)) + '</h4>' +
      '<p style="font-size:.72rem;color:#7C8AC9;margin:0 0 10px;">Le profil d\'apprentissage formel est établi chaque mois à partir de tes défis hebdomadaires.</p>' +
      bars(monthly) +
      '<h4 style="font-size:.88rem;margin:18px 0 2px;">Profil cumulé (depuis le début)</h4>' +
      '<p style="font-size:.72rem;color:#7C8AC9;margin:0 0 10px;">Visible par toi, ton superviseur et l\'administration.</p>' +
      bars(cumulative) +
      (lastAffinity
        ? '<div class="badge badge-blue" style="margin-top:14px;">Dernier profil d\'affinité : ' + U.escapeHTML(lastAffinity.profileLabel) + '</div>'
        : "");
  }

  /* ===================== PROGRESSION ===================== */

  function renderProgression() {
    var challenges = NexiStore.listChallenges();
    var myAttempts = challenges
      .filter(function (c) { return NexiStore.hasAttempted(c, user.id); })
      .map(function (c) { return { title: c.title, attempt: c.attempts[user.id] }; });

    var historyBody = document.getElementById("historyBody");
    if (myAttempts.length === 0) {
      historyBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#9AA6E0;">Aucun défi réalisé pour l\'instant.</td></tr>';
    } else {
      historyBody.innerHTML = myAttempts.map(function (m) {
        return "<tr><td>" + U.escapeHTML(m.title) + "</td><td>" + m.attempt.score + "/" + m.attempt.total + " (" + m.attempt.percent + "%)</td><td>" + U.fmtDateTime(m.attempt.date) + "</td></tr>";
      }).join("");
    }

    var nbDone = myAttempts.length;
    var perfect = myAttempts.some(function (m) { return m.attempt.percent === 100; });
    var affDone = NexiStore.listAffinities().some(function (a) { return NexiStore.hasAttempted(a, user.id); });

    var badges = [
      { icon: NexiIcons.trophy(), label: "Premier défi", unlocked: nbDone >= 1 },
      { icon: NexiIcons.flame(), label: "3 défis relevés", unlocked: nbDone >= 3 },
      { icon: NexiIcons.medal(), label: "Score parfait", unlocked: perfect },
      { icon: NexiIcons.compass(), label: "Explorateur affinités", unlocked: affDone }
    ];
    document.getElementById("badgesRow").innerHTML = badges.map(function (b) {
      return (
        '<div class="badge-trophy' + (b.unlocked ? "" : " locked") + '">' +
          '<div class="icon">' + b.icon + '</div>' +
          '<div class="lbl">' + b.label + '</div>' +
        '</div>'
      );
    }).join("");
  }

  /* ===================== CLASSEMENT ===================== */

  function renderLeaderboard() {
    var children = NexiStore.listChildren();
    var rows = children.map(function (c) {
      var attempts = NexiStore.listChallenges()
        .filter(function (ch) { return NexiStore.hasAttempted(ch, c.id); })
        .map(function (ch) { return ch.attempts[c.id]; });
      var totalScore = attempts.reduce(function (s, a) { return s + a.score; }, 0);
      return { id: c.id, identifiant: c.identifiant, totalScore: totalScore, nbDefis: attempts.length };
    }).sort(function (a, b) { return b.totalScore - a.totalScore; });

    var el = document.getElementById("leaderboardList");
    if (rows.every(function (r) { return r.nbDefis === 0; })) {
      el.innerHTML = '<div class="empty-state">Aucun classement pour l\'instant — sois le premier à faire un défi !</div>';
      return;
    }
    el.innerHTML = rows.map(function (r, i) {
      var rankClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      var rankIcon = i === 0 ? '<span class="rank-icon">' + NexiIcons.trophy() + '</span>' : i === 1 || i === 2 ? '<span class="rank-icon">' + NexiIcons.medal() + '</span>' : "";
      return (
        '<div class="leaderboard-row' + (r.id === user.id ? " me" : "") + '">' +
          '<div class="leaderboard-rank ' + rankClass + '">' + rankIcon + '#' + (i + 1) + '</div>' +
          '<div style="flex:1;font-weight:700;">' + U.escapeHTML(r.identifiant) + (r.id === user.id ? " (toi)" : "") + '</div>' +
          '<div class="badge badge-blue">' + r.totalScore + ' pts · ' + r.nbDefis + ' défi(s)</div>' +
        '</div>'
      );
    }).join("");
  }
})();
