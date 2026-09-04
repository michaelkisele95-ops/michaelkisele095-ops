/* ============================================================
   NEXIONE — utils.js
   Fonctions pures + petits helpers UI partagés par admin/child/supervisor.
   Les fonctions pures (parseCSV, scoreChallenge, scoreAffinity, computeStrengths)
   sont testées automatiquement (voir tests/logic.test.js).
   ============================================================ */

(function (global) {
  "use strict";

  // ---------- CSV ----------
  // Split respectant les guillemets ("...") — réutilisé par parseCSV et par
  // l'import CSV des tests d'affinité (admin.js) pour éviter que des virgules
  // à l'intérieur d'un texte de question ne cassent le découpage des colonnes.
  function splitCSVLine(line, sep) {
    var out = [];
    var cur = "";
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  // Format attendu : Question | Option A | Option B | Option C | Option D | Bonne(s) réponse(s) | Temps (secondes) | Domaine (optionnel)
  // "Bonne(s) réponse(s)" accepte "A", "A;C", "A,C" (plusieurs bonnes réponses).
  // "Domaine" est optionnel — s'il est absent, l'appelant applique un domaine par défaut.
  // Avec un en-tête explicite (première ligne contenant "Question"), les colonnes sont
  // repérées par leur nom ("Option ...", "Bonne(s) réponse(s)"/"Correct", "Temps", "Domaine") —
  // ce qui permet un nombre variable d'options et une colonne Domaine en fin de ligne.
  // Sans en-tête, on retombe sur l'ancienne logique positionnelle (sans domaine).
  function parseCSV(text) {
    var lines = String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });

    if (lines.length === 0) return { ok: false, error: "Fichier vide.", questions: [] };

    var sep = lines[0].indexOf(";") > -1 && lines[0].split(";").length >= lines[0].split(",").length ? ";" : ",";
    var splitLine = function (line) { return splitCSVLine(line, sep); };

    var header = splitLine(lines[0]).map(function (h) { return h.toLowerCase(); });
    var looksLikeHeader = header.some(function (h) { return h.indexOf("question") > -1; });
    var dataLines = looksLikeHeader ? lines.slice(1) : lines;

    // Repérage des colonnes nommées quand un en-tête est présent.
    var qIdx = -1, ansIdx = -1, timeIdx = -1, domIdx = -1, optIdxs = [];
    if (looksLikeHeader) {
      header.forEach(function (h, i) {
        if (qIdx === -1 && h.indexOf("question") > -1) { qIdx = i; return; }
        if (h.indexOf("domaine") > -1 || h.indexOf("domain") > -1) { domIdx = i; return; }
        if (h.indexOf("temps") > -1 || h.indexOf("time") > -1) { timeIdx = i; return; }
        if (ansIdx === -1 && (h.indexOf("bonne") > -1 || h.indexOf("répons") > -1 || h.indexOf("repons") > -1 || h.indexOf("correct") > -1)) { ansIdx = i; return; }
        if (h.indexOf("option") > -1) { optIdxs.push(i); }
      });
    }
    var useNamedColumns = looksLikeHeader && qIdx > -1 && optIdxs.length > 0 && ansIdx > -1;

    var letters = ["a", "b", "c", "d", "e", "f"];
    var questions = [];
    var errors = [];

    dataLines.forEach(function (line, idx) {
      var cols = splitLine(line);
      if (cols.length < 4) { errors.push("Ligne " + (idx + 1) + " : colonnes insuffisantes."); return; }

      var text, options, correctRaw, timeRaw, domainRaw;
      if (useNamedColumns) {
        text = cols[qIdx] || "";
        options = optIdxs.map(function (i) { return cols[i] || ""; }).filter(function (o) { return o !== ""; });
        correctRaw = cols[ansIdx] || "";
        timeRaw = timeIdx > -1 ? (cols[timeIdx] || "20") : "20";
        domainRaw = domIdx > -1 ? (cols[domIdx] || "") : "";
      } else {
        text = cols[0];
        options = [];
        var col = 1;
        while (col < cols.length - 2 && cols[col] !== "") {
          options.push(cols[col]);
          col++;
        }
        correctRaw = cols[cols.length - 2] || "";
        timeRaw = cols[cols.length - 1] || "20";
        domainRaw = "";
      }

      var correctIdx = correctRaw
        .split(/[;,/]/)
        .map(function (s) { return s.trim().toLowerCase(); })
        .filter(Boolean)
        .map(function (s) {
          var li = letters.indexOf(s);
          if (li > -1) return li;
          var num = parseInt(s, 10);
          if (!isNaN(num)) return num - 1;
          var byText = options.findIndex(function (o) { return o.toLowerCase() === s; });
          return byText;
        })
        .filter(function (i) { return i > -1 && i < options.length; });

      if (options.length < 2) { errors.push("Ligne " + (idx + 1) + " : au moins 2 options requises."); return; }
      if (correctIdx.length === 0) { errors.push("Ligne " + (idx + 1) + " : aucune bonne réponse reconnue."); return; }

      questions.push({
        text: text,
        options: options,
        correct: correctIdx,
        multi: correctIdx.length > 1,
        time: Math.max(5, parseInt(timeRaw, 10) || 20),
        category: domainRaw ? domainRaw.trim() : null
      });
    });

    return { ok: questions.length > 0, questions: questions, errors: errors };
  }

  // ---------- Scoring défi ----------
  function arraysEqualAsSets(a, b) {
    if (a.length !== b.length) return false;
    var sa = a.slice().sort().join(",");
    var sb = b.slice().sort().join(",");
    return sa === sb;
  }

  function scoreChallenge(questions, answers) {
    // answers: { [questionId]: number[] }
    var total = questions.length;
    var score = 0;
    questions.forEach(function (q) {
      var given = (answers[q.id] || []).slice().sort();
      if (arraysEqualAsSets(given, q.correct)) score++;
    });
    var percent = total > 0 ? Math.round((score / total) * 100) : 0;
    return { score: score, total: total, percent: percent };
  }

  // ---------- Scoring affinités (ipsatif simplifié) ----------
  // answers: { [questionId]: number(1..5) }
  function scoreAffinity(questions, answers, axesMeta) {
    var sums = {}, counts = {};
    axesMeta.forEach(function (ax) { sums[ax.id] = 0; counts[ax.id] = 0; });

    questions.forEach(function (q) {
      var raw = answers[q.id];
      if (raw == null) return;
      var val = q.direction === "neg" ? (6 - raw) : raw; // inverse si l'item pointe vers le pôle négatif
      sums[q.axis] = (sums[q.axis] || 0) + val;
      counts[q.axis] = (counts[q.axis] || 0) + 1;
    });

    var axesScores = axesMeta.map(function (ax) {
      var avg = counts[ax.id] ? sums[ax.id] / counts[ax.id] : 0;
      return { id: ax.id, pos: ax.pos, neg: ax.neg, avg: Math.round(avg * 10) / 10 };
    });

    var sorted = axesScores.slice().sort(function (a, b) { return b.avg - a.avg; });
    var top1 = sorted[0];
    var top2 = sorted[1];

    var label = "Nexi d'affinité — " + (top1 ? top1.pos : "Explorateur");
    if (top2 && top2.avg > 0) label += " " + top2.pos;

    var recoBank = {
      creatif_analytique: "Anime un atelier créatif ou un concours d'idées.",
      collab_autonome: "Rejoins un projet de groupe avec un rôle clair.",
      theorique_applique: "Participe à un défi pratique ou un mini-projet concret.",
      leadership_support: "Prends le rôle de capitaine d'équipe lors du prochain défi.",
      techno_manuel: "Explore un module numérique ou un atelier de fabrication.",
      innovation_optim: "Propose une nouvelle façon de résoudre un défi existant."
    };
    var recos = [];
    if (top1) recos.push(recoBank[top1.id] || "Continue à explorer tes centres d'intérêt.");
    if (top2) recos.push(recoBank[top2.id] || "Essaie une activité complémentaire à ton profil.");
    recos.push("Discute de ton profil avec ton mentor NEXI pour choisir ton prochain défi.");

    return { axesScores: axesScores, profileLabel: label, recommendations: recos };
  }

  // ---------- Forces / faiblesses (superviseur) ----------
  function computeStrengths(challenges, userId, categories) {
    var byCat = {};
    categories.forEach(function (c) { byCat[c] = { correct: 0, total: 0 }; });

    challenges.forEach(function (chal) {
      var attempt = chal.attempts && chal.attempts[userId];
      if (!attempt || !attempt.answers) return;
      chal.questions.forEach(function (q) {
        var cat = q.category || "Culture générale";
        if (!byCat[cat]) byCat[cat] = { correct: 0, total: 0 };
        var given = (attempt.answers[q.id] || []).slice().sort();
        var ok = arraysEqualAsSets(given, q.correct);
        byCat[cat].total++;
        if (ok) byCat[cat].correct++;
      });
    });

    var rows = Object.keys(byCat).map(function (cat) {
      var d = byCat[cat];
      var percent = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
      return { category: cat, percent: percent, total: d.total };
    });

    return rows;
  }

  // Comme computeStrengths, mais ne compte que les tentatives dont la date
  // tombe dans le mois donné ("AAAA-MM") — sert au profil d'apprentissage mensuel.
  function computeStrengthsInMonth(challenges, userId, categories, yearMonth) {
    var byCat = {};
    categories.forEach(function (c) { byCat[c] = { correct: 0, total: 0 }; });

    challenges.forEach(function (chal) {
      var attempt = chal.attempts && chal.attempts[userId];
      if (!attempt || !attempt.answers) return;
      if (!attempt.date || attempt.date.slice(0, 7) !== yearMonth) return;
      chal.questions.forEach(function (q) {
        var cat = q.category || "Culture générale";
        if (!byCat[cat]) byCat[cat] = { correct: 0, total: 0 };
        var given = (attempt.answers[q.id] || []).slice().sort();
        var ok = arraysEqualAsSets(given, q.correct);
        byCat[cat].total++;
        if (ok) byCat[cat].correct++;
      });
    });

    return Object.keys(byCat).map(function (cat) {
      var d = byCat[cat];
      var percent = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
      return { category: cat, percent: percent, total: d.total };
    });
  }

  // ---------- Format / divers ----------
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " à " +
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function initials(name) {
    var clean = String(name || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
    if (!clean) return "?";
    return clean.split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
  }
  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Construit les <optgroup> Primaire / Cycle d'orientation / Humanités pour un <select> de classe.
  function classOptionsHTML(selected, includeEmpty) {
    var out = includeEmpty ? '<option value="">— Non renseignée —</option>' : "";
    global.NexiStore.CLASS_LEVELS_GROUPED.forEach(function (grp) {
      out += '<optgroup label="' + escapeHTML(grp.group) + '">';
      grp.classes.forEach(function (c) {
        out += '<option value="' + escapeHTML(c) + '"' + (c === selected ? " selected" : "") + '>' + escapeHTML(c) + '</option>';
      });
      out += "</optgroup>";
    });
    return out;
  }

  // ---------- Toast ----------
  function toast(msg) {
    var el = document.getElementById("nexi-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "nexi-toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  // ---------- Confettis (canvas léger, sans dépendance) ----------
  function confettiBurst() {
    var canvas = document.getElementById("confetti-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "confetti-canvas";
      document.body.appendChild(canvas);
    }
    var ctx = canvas.getContext("2d");
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);

    var colors = ["#2F6BFF", "#FFB020", "#FFFFFF", "#1FB67A"];
    var particles = [];
    for (var i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.3,
        r: 4 + Math.random() * 5,
        c: colors[Math.floor(Math.random() * colors.length)],
        vy: 2 + Math.random() * 3,
        vx: -2 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: -0.2 + Math.random() * 0.4
      });
    }
    var frames = 0;
    var maxFrames = 130;
    function step() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6);
        ctx.restore();
      });
      frames++;
      if (frames < maxFrames) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(step);
  }

  // ---------- Export CSV générique ----------
  function downloadCSV(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell == null ? "" : cell);
        if (s.indexOf(",") > -1 || s.indexOf('"') > -1) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(",");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- Overlay de chargement / bannière hors-ligne (partagés par
  // index.html, admin.html, child.html, supervisor.html) ----------
  function hideLoadingOverlay() {
    var el = document.getElementById("nexiLoadingOverlay");
    if (el) el.classList.add("hidden");
  }

  function showOfflineBannerIfNeeded(boot) {
    var el = document.getElementById("nexiOfflineBanner");
    if (!el) return;
    if (boot && boot.offline) {
      el.textContent = "Connexion à Google Sheets impossible pour l'instant — données locales affichées.";
      el.classList.add("show");
    } else {
      el.classList.remove("show");
    }
  }

  global.NexiUtils = {
    parseCSV: parseCSV,
    splitCSVLine: splitCSVLine,
    scoreChallenge: scoreChallenge,
    scoreAffinity: scoreAffinity,
    computeStrengths: computeStrengths,
    computeStrengthsInMonth: computeStrengthsInMonth,
    hideLoadingOverlay: hideLoadingOverlay,
    showOfflineBannerIfNeeded: showOfflineBannerIfNeeded,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    initials: initials,
    escapeHTML: escapeHTML,
    classOptionsHTML: classOptionsHTML,
    toast: toast,
    confettiBurst: confettiBurst,
    downloadCSV: downloadCSV,
    arraysEqualAsSets: arraysEqualAsSets
  };

  // Export CommonJS pour les tests Node (voir tests/logic.test.js)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.NexiUtils;
  }
})(typeof window !== "undefined" ? window : global);
