/**
 * =============================================================
 *  NEXI LAB — Backend Google Apps Script (Code.gs) — v2
 * =============================================================
 * v2 ajoute : sharding multi-Google Sheets (20 joueurs/feuille),
 * verrouillage anti-corruption des soldes NX, suivi manuel des
 * paiements d'abonnement, import en masse de contenu, et
 * statistiques agrégées pour prouver la traction du projet.
 *
 * ARCHITECTURE DE DONNÉES
 * ------------------------------------------------------------
 * • Une feuille "Registre" (celle où ce script est collé) contient :
 *     Shards        — liste des feuilles-joueurs enregistrées
 *     ShardIndex    — identifiant -> shardId (résolution rapide au login)
 *     Sessions      — jetons de connexion actifs (joueurs + admin)
 *     Dungeons, NexifyCards, RevisionCards, Facts — contenu partagé
 *       (le même pour tous les joueurs, quel que soit leur shard)
 * • Le Registre EST AUSSI le premier shard ("shard1") : il contient en
 *   plus les onglets Users et DungeonAttempts pour les 20 premiers
 *   joueurs. Aucune deuxième feuille n'est nécessaire pour démarrer.
 * • Chaque shard supplémentaire est une Google Sheet À PART, ne
 *   contenant QUE Users + DungeonAttempts, enregistrée depuis le panel
 *   admin (onglet "Shards") — aucun retour à l'éditeur de script requis.
 *
 * SÉCURITÉ (inchangé, renforcé) :
 *  - Chaque requête doit contenir "secret" = SHARED_SECRET.
 *  - Mots de passe : SHA-256 + sel par utilisateur, jamais en clair.
 *  - Sessions à jeton opaque, expiration 12h, revalidées à chaque appel.
 *  - Toute écriture qui touche un solde NX est protégée par LockService
 *    (voir withLock) : deux requêtes simultanées du même joueur ne
 *    peuvent plus se marcher dessus et corrompre son solde.
 *  - Aucune erreur technique n'est jamais renvoyée telle quelle au joueur.
 *
 * INSTALLATION : voir GUIDE_DEPLOIEMENT.md à la racine du projet.
 * Avant le premier lancement, exécuter une fois setupNexiLab().
 */

const SHEET_NAMES = {
  SHARDS: "Shards",
  SHARD_INDEX: "ShardIndex",
  SESSIONS: "Sessions",
  DUNGEONS: "Dungeons",
  NEXIFY_CARDS: "NexifyCards",
  REVISION_CARDS: "RevisionCards",
  FACTS: "Facts",
  USERS: "Users",
  DUNGEON_ATTEMPTS: "DungeonAttempts",
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const STARTING_NX = 100;
const DEFAULT_SHARD_CAPACITY = 20;

/* ---------------------------------------------------------------
 * Point d'entrée HTTP
 * ------------------------------------------------------------- */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, code: "bad_request", message: "Requête invalide." });
  }

  const props = PropertiesService.getScriptProperties();
  const sharedSecret = props.getProperty("SHARED_SECRET");
  if (!sharedSecret || body.secret !== sharedSecret) {
    return jsonOut({ ok: false, code: "forbidden", message: "Accès refusé." });
  }

  const action = body.action;
  const payload = body.payload || {};
  const token = body.token || null;

  try {
    const handler = ACTIONS[action];
    if (!handler) return jsonOut({ ok: false, code: "unknown_action", message: "Action inconnue." });
    const data = handler(payload, token);
    return jsonOut({ ok: true, data });
  } catch (err) {
    console.error("Erreur action=" + action + " : " + (err && err.stack || err));
    const friendly = (err && err.friendlyMessage) || "Cette action n'a pas pu aboutir. Réessaie.";
    return jsonOut({ ok: false, code: (err && err.code) || "error", message: friendly });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail(message, code) {
  const e = new Error(message);
  e.friendlyMessage = message;
  e.code = code || "business_error";
  throw e;
}

/* ---------------------------------------------------------------
 * Verrou anti-corruption (soldes NX, création de compte, shards)
 * ------------------------------------------------------------- */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    fail("Le service est très sollicité, réessaie dans un instant.", "busy");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------
 * Accès Sheets — génériques (fonctionnent sur n'importe quel classeur)
 * ------------------------------------------------------------- */
function sheetIn(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) fail("Configuration incomplète.", "config");
  return sh;
}

function readRowsSS(ss, name) {
  const sh = sheetIn(ss, name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || [];
  return values
    .filter((row) => row.some((c) => c !== "" && c !== null))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function appendRowSS(ss, name, obj) {
  const sh = sheetIn(ss, name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map((h) => (obj[h] !== undefined ? obj[h] : ""));
  sh.appendRow(row);
}

function updateRowByIdSS(ss, name, idField, id, patch) {
  const sh = sheetIn(ss, name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idField);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(id)) {
      headers.forEach((h, c) => {
        if (patch[h] !== undefined) sh.getRange(r + 1, c + 1).setValue(patch[h]);
      });
      return true;
    }
  }
  return false;
}

function deleteRowByIdSS(ss, name, idField, id) {
  const sh = sheetIn(ss, name);
  const values = sh.getDataRange().getValues();
  const idCol = values[0].indexOf(idField);
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idCol]) === String(id)) sh.deleteRow(r + 1);
  }
}

function genId(prefix) {
  return (prefix || "id") + "_" + Utilities.getUuid().split("-")[0];
}

/* ---------------------------------------------------------------
 * Registre (feuille où le script est collé) — contenu partagé
 * ------------------------------------------------------------- */
function registrySS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}
function readRows(name) { return readRowsSS(registrySS(), name); }
function appendRow(name, obj) { return appendRowSS(registrySS(), name, obj); }
function updateRowById(name, idField, id, patch) { return updateRowByIdSS(registrySS(), name, idField, id, patch); }

/* ---------------------------------------------------------------
 * Sharding — résolution et équilibrage des feuilles-joueurs
 * ------------------------------------------------------------- */
const _shardSpreadsheetCache = {};

function listShardsRaw() {
  return readRows(SHEET_NAMES.SHARDS); // [{shardId, spreadsheetId, label}]
}

function shardSpreadsheet(shardId) {
  if (_shardSpreadsheetCache[shardId]) return _shardSpreadsheetCache[shardId];
  const shards = listShardsRaw();
  const s = shards.find((x) => x.shardId === shardId);
  if (!s) fail("Configuration de compte introuvable.", "config");
  let ss;
  try {
    ss = s.spreadsheetId === registrySS().getId() ? registrySS() : SpreadsheetApp.openById(s.spreadsheetId);
  } catch (e) {
    fail("Feuille de données introuvable pour ce compte.", "config");
  }
  _shardSpreadsheetCache[shardId] = ss;
  return ss;
}

function shardCapacity() {
  return Number(PropertiesService.getScriptProperties().getProperty("SHARD_CAPACITY")) || DEFAULT_SHARD_CAPACITY;
}

function countUsersInShard(shardId) {
  try {
    return readRowsSS(shardSpreadsheet(shardId), SHEET_NAMES.USERS).length;
  } catch (e) {
    return 0;
  }
}

/** Choisit automatiquement un shard non plein pour un nouveau Nexian. */
function pickShardForNewUser() {
  const shards = listShardsRaw();
  if (!shards.length) fail("Aucune feuille-joueurs enregistrée. Ajoute un shard depuis l'onglet « Shards ».", "no_shard");
  const capacity = shardCapacity();
  const counts = shards.map((s) => ({ shardId: s.shardId, count: countUsersInShard(s.shardId) }));
  const chosen = NexiLogicServer.pickLeastLoadedShard(counts, capacity);
  if (!chosen) fail("Toutes les feuilles-joueurs sont pleines (" + capacity + " chacune). Ajoute un nouveau shard depuis l'onglet « Shards ».", "shards_full");
  return chosen;
}

/* ---------------------------------------------------------------
 * Mots de passe & sessions (sessions centralisées dans le Registre)
 * ------------------------------------------------------------- */
function hashPassword(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ":" + salt);
  return digest.map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}

function createSession(userId, role, shardId) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  appendRow(SHEET_NAMES.SESSIONS, { token, userId, role, shardId: shardId || "", expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function requireSession(token, requiredRole) {
  if (!token) fail("Session expirée, reconnecte-toi.", "auth");
  const sessions = readRows(SHEET_NAMES.SESSIONS);
  const s = sessions.find((x) => x.token === token);
  if (!s || Number(s.expiresAt) < Date.now()) fail("Session expirée, reconnecte-toi.", "auth");
  if (requiredRole && s.role !== requiredRole) fail("Accès refusé.", "auth");
  return s;
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd");
}

/* ---------------------------------------------------------------
 * Actions — espace Nexian
 * ------------------------------------------------------------- */
function action_login(payload) {
  const idx = readRows(SHEET_NAMES.SHARD_INDEX).find((x) => x.identifiant === payload.identifiant);
  if (!idx) fail("Identifiant ou mot de passe incorrect.", "auth");
  const ss = shardSpreadsheet(idx.shardId);
  const users = readRowsSS(ss, SHEET_NAMES.USERS);
  const u = users.find((x) => x.id === idx.userId);
  if (!u) fail("Identifiant ou mot de passe incorrect.", "auth");
  if (u.abonnement !== "actif") fail("Ton abonnement est actuellement suspendu.", "subscription");
  const hash = hashPassword(payload.motDePasse, u.salt);
  if (hash !== u.passwordHash) fail("Identifiant ou mot de passe incorrect.", "auth");

  const token = createSession(u.id, "nexian", idx.shardId);
  withLock(() => {
    updateRowByIdSS(ss, SHEET_NAMES.USERS, "id", u.id, {
      nbConnexions: (Number(u.nbConnexions) || 0) + 1,
      derniereConnexion: todayStr(),
    });
  });
  return { token, profileSummary: { identifiant: u.identifiant, nx: u.nx } };
}

function getUserOrFail(token) {
  const s = requireSession(token, "nexian");
  const ss = shardSpreadsheet(s.shardId);
  const users = readRowsSS(ss, SHEET_NAMES.USERS);
  const u = users.find((x) => x.id === s.userId);
  if (!u) fail("Compte introuvable.", "auth");
  u._ss = ss;
  u._shardId = s.shardId;
  return u;
}

function action_getProfile(payload, token) {
  const u = getUserOrFail(token);
  let history = [];
  try { history = JSON.parse(u.historyJSON || "[]"); } catch (e) { history = []; }
  return {
    identifiant: u.identifiant, nx: Number(u.nx) || 0, avatarId: u.avatarId || "H",
    bestScore: Number(u.bestScore) || 0, history,
  };
}

function action_setAvatar(payload, token) {
  const u = getUserOrFail(token);
  updateRowByIdSS(u._ss, SHEET_NAMES.USERS, "id", u.id, { avatarId: payload.avatarId });
  return { ok: true };
}

function action_listDungeons(payload, token) {
  const u = getUserOrFail(token);
  const dungeons = readRows(SHEET_NAMES.DUNGEONS).filter((d) => d.publie === true || d.publie === "TRUE" || d.publie === "true");
  const attempts = readRowsSS(u._ss, SHEET_NAMES.DUNGEON_ATTEMPTS).filter((a) => a.userId === u.id);
  return dungeons.map((d) => {
    let questions = [];
    try { questions = JSON.parse(d.questionsJSON || "[]"); } catch (e) { questions = []; }
    const safeQuestions = questions.map((q) => ({ id: q.id, enonce: q.enonce, options: q.options, tempsLimite: q.tempsLimite }));
    const dejaFait = attempts.some((a) => a.dungeonId === d.id && a.dateJour === todayStr());
    return { id: d.id, titre: d.titre, categorie: d.categorie, nbQuestions: questions.length, questions: safeQuestions, dejaFait };
  });
}

function action_submitDungeonAttempt(payload, token) {
  const u = getUserOrFail(token);
  const d = readRows(SHEET_NAMES.DUNGEONS).find((x) => x.id === payload.dungeonId);
  if (!d) fail("Ce défi n'existe plus.", "not_found");

  return withLock(() => {
    // Relire l'utilisateur et ses tentatives À L'INTÉRIEUR du verrou : garantit
    // qu'aucune autre requête simultanée n'a pu créditer/consommer entre-temps.
    const freshUsers = readRowsSS(u._ss, SHEET_NAMES.USERS);
    const freshUser = freshUsers.find((x) => x.id === u.id);
    const attempts = readRowsSS(u._ss, SHEET_NAMES.DUNGEON_ATTEMPTS);
    const already = attempts.some((a) => a.userId === u.id && a.dungeonId === d.id && a.dateJour === todayStr());
    if (already) fail("Tu as déjà relevé ce défi aujourd'hui.", "already_done");

    let questions = [];
    try { questions = JSON.parse(d.questionsJSON || "[]"); } catch (e) { questions = []; }
    let totalGain = 0;
    (payload.answers || []).forEach((ans) => {
      const q = questions.find((x) => x.id === ans.questionId);
      if (!q) return;
      const isCorrect = Number(ans.optionIndex) === Number(q.bonneReponseIndex);
      const r = NexiLogicServer.calculateDungeonReward(isCorrect, q.nx, (ans.tempsMs || 0) / 1000, q.tempsLimite, q.bonusVitesse);
      totalGain += r.gained;
    });

    const newNx = NexiLogicServer.applyDelta(Number(freshUser.nx) || 0, totalGain);
    const bestScore = Math.max(Number(freshUser.bestScore) || 0, newNx);
    let history = [];
    try { history = JSON.parse(freshUser.historyJSON || "[]"); } catch (e) { history = []; }
    history.push({ date: todayStr(), nx: newNx });
    if (history.length > 60) history = history.slice(-60);

    updateRowByIdSS(u._ss, SHEET_NAMES.USERS, "id", u.id, {
      nx: newNx, bestScore, historyJSON: JSON.stringify(history),
      nbDefisCompletes: (Number(freshUser.nbDefisCompletes) || 0) + (totalGain > 0 ? 1 : 0),
    });
    appendRowSS(u._ss, SHEET_NAMES.DUNGEON_ATTEMPTS, { id: genId("att"), userId: u.id, dungeonId: d.id, dateJour: todayStr(), nxGagne: totalGain, timestamp: Date.now() });
    return { nxGagne: totalGain, nouveauSolde: newNx };
  });
}

function action_listNexifyCards(payload, token) {
  getUserOrFail(token);
  return readRows(SHEET_NAMES.NEXIFY_CARDS).map((c) => ({ id: c.id, categorie: c.categorie, multiplicateur: Number(c.multiplicateur) }));
}

function action_playNexifyCard(payload, token) {
  const u = getUserOrFail(token);
  const c = readRows(SHEET_NAMES.NEXIFY_CARDS).find((x) => x.id === payload.cardId);
  if (!c) fail("Cette carte n'est plus disponible.", "not_found");
  let options = [];
  try { options = JSON.parse(c.optionsJSON || "[]"); } catch (e) { options = []; }

  return withLock(() => {
    const freshUsers = readRowsSS(u._ss, SHEET_NAMES.USERS);
    const freshUser = freshUsers.find((x) => x.id === u.id);
    const currentNx = Number(freshUser.nx) || 0;
    const bet = Number(payload.betNX) || 0;
    if (bet <= 0 || bet > currentNx) fail("Mise invalide.", "bad_bet");
    const isCorrect = Number(payload.answerId) === Number(c.bonneReponseIndex);
    const result = NexiLogicServer.calculateNexifyResult(bet, Number(c.multiplicateur), isCorrect);
    const newNx = NexiLogicServer.applyDelta(currentNx, result.delta);
    updateRowByIdSS(u._ss, SHEET_NAMES.USERS, "id", u.id, { nx: newNx });
    return { gagne: isCorrect, delta: result.delta, nouveauSolde: newNx, question: c.question, options };
  });
}

function action_listRevisionCards(payload, token) {
  getUserOrFail(token);
  return readRows(SHEET_NAMES.REVISION_CARDS)
    .filter((r) => !payload.category || r.categorie === payload.category)
    .map((r) => ({ id: r.id, categorie: r.categorie, recto: r.recto, reponse: r.reponse, explication: r.explication }));
}

function action_listFacts(payload, token) {
  getUserOrFail(token);
  return readRows(SHEET_NAMES.FACTS).map((f) => ({ id: f.id, texte: f.texte }));
}

function action_getLeaderboard(payload, token) {
  getUserOrFail(token);
  const shards = listShardsRaw();
  let all = [];
  shards.forEach((s) => {
    try {
      all = all.concat(readRowsSS(shardSpreadsheet(s.shardId), SHEET_NAMES.USERS).map((u) => ({ identifiant: u.identifiant, nx: Number(u.nx) || 0 })));
    } catch (e) { /* shard temporairement indisponible : ignoré, pas bloquant pour le classement */ }
  });
  return all.sort((a, b) => b.nx - a.nx).slice(0, 100);
}

/* ---------------------------------------------------------------
 * Actions — espace Administrateur
 * ------------------------------------------------------------- */
function action_adminLogin(payload) {
  const props = PropertiesService.getScriptProperties();
  const adminId = props.getProperty("ADMIN_IDENTIFIANT");
  const adminHash = props.getProperty("ADMIN_PASSWORD_HASH");
  const adminSalt = props.getProperty("ADMIN_SALT");
  if (!adminId || payload.identifiant !== adminId) fail("Identifiant ou mot de passe incorrect.", "auth");
  if (hashPassword(payload.motDePasse, adminSalt) !== adminHash) fail("Identifiant ou mot de passe incorrect.", "auth");
  const token = createSession("admin", "admin", "");
  return { token, profileSummary: { identifiant: adminId } };
}
function requireAdmin(token) { return requireSession(token, "admin"); }

function action_adminListNexians(payload, token) {
  requireAdmin(token);
  const shards = listShardsRaw();
  let all = [];
  shards.forEach((s) => {
    readRowsSS(shardSpreadsheet(s.shardId), SHEET_NAMES.USERS).forEach((u) => {
      all.push({
        id: u.id, identifiant: u.identifiant, nomComplet: u.nomComplet, nx: Number(u.nx) || 0,
        abonnement: u.abonnement, shardId: s.shardId, shardLabel: s.label,
        moyenPaiement: u.moyenPaiement || "", referencePaiement: u.referencePaiement || "", dateFinAbonnement: u.dateFinAbonnement || "",
        nbConnexions: Number(u.nbConnexions) || 0, derniereConnexion: u.derniereConnexion || "", nbDefisCompletes: Number(u.nbDefisCompletes) || 0,
      });
    });
  });
  return all;
}

function action_adminCreateNexian(payload, token) {
  requireAdmin(token);
  if (!payload.identifiant || !payload.nomComplet || !payload.motDePasse) fail("Champs manquants.", "bad_request");
  return withLock(() => {
    const existing = readRows(SHEET_NAMES.SHARD_INDEX);
    if (existing.some((x) => x.identifiant === payload.identifiant)) fail("Cet identifiant existe déjà.", "duplicate");
    const shardId = payload.shardId || pickShardForNewUser();
    const ss = shardSpreadsheet(shardId);
    const salt = Utilities.getUuid();
    const userId = genId("usr");
    appendRowSS(ss, SHEET_NAMES.USERS, {
      id: userId, identifiant: payload.identifiant, nomComplet: payload.nomComplet,
      passwordHash: hashPassword(payload.motDePasse, salt), salt,
      nx: Number(payload.nx) || STARTING_NX, avatarId: "H", abonnement: "actif",
      bestScore: 0, historyJSON: "[]", nbConnexions: 0, derniereConnexion: "", nbDefisCompletes: 0,
      moyenPaiement: payload.moyenPaiement || "", referencePaiement: payload.referencePaiement || "", dateFinAbonnement: payload.dateFinAbonnement || "",
    });
    appendRow(SHEET_NAMES.SHARD_INDEX, { identifiant: payload.identifiant, shardId, userId });
    return { ok: true, shardId };
  });
}

function action_adminUpdateNexian(payload, token) {
  requireAdmin(token);
  if (!payload.shardId) fail("Compte introuvable (shard manquant).", "bad_request");
  const ss = shardSpreadsheet(payload.shardId);
  return withLock(() => {
    if (payload.identifiant) {
      const idxRows = readRows(SHEET_NAMES.SHARD_INDEX);
      const mine = idxRows.find((x) => x.userId === payload.id);
      if (mine && mine.identifiant !== payload.identifiant) {
        if (idxRows.some((x) => x.identifiant === payload.identifiant)) fail("Cet identifiant existe déjà.", "duplicate");
        updateRowById(SHEET_NAMES.SHARD_INDEX, "userId", payload.id, { identifiant: payload.identifiant });
      }
    }
    const patch = {
      nomComplet: payload.nomComplet, identifiant: payload.identifiant, nx: Number(payload.nx),
      moyenPaiement: payload.moyenPaiement, referencePaiement: payload.referencePaiement, dateFinAbonnement: payload.dateFinAbonnement,
    };
    if (payload.motDePasse) {
      const salt = Utilities.getUuid();
      patch.salt = salt;
      patch.passwordHash = hashPassword(payload.motDePasse, salt);
    }
    updateRowByIdSS(ss, SHEET_NAMES.USERS, "id", payload.id, patch);
    return { ok: true };
  });
}

function action_adminSetSubscription(payload, token) {
  requireAdmin(token);
  if (!payload.shardId) fail("Compte introuvable (shard manquant).", "bad_request");
  updateRowByIdSS(shardSpreadsheet(payload.shardId), SHEET_NAMES.USERS, "id", payload.nexianId, { abonnement: payload.statut });
  return { ok: true };
}

/* --- Shards --- */
function action_adminListShards(payload, token) {
  requireAdmin(token);
  const capacity = shardCapacity();
  return listShardsRaw().map((s) => ({ shardId: s.shardId, label: s.label, nbJoueurs: countUsersInShard(s.shardId), capacite: capacity }));
}

function action_adminProvisionShard(payload, token) {
  requireAdmin(token);
  if (!payload.spreadsheetId || !payload.label) fail("Identifiant de feuille et libellé requis.", "bad_request");
  return withLock(() => {
    let ss;
    try { ss = SpreadsheetApp.openById(payload.spreadsheetId.trim()); }
    catch (e) { fail("Impossible d'ouvrir cette feuille. Vérifie l'identifiant et que le compte du script y a accès en modification.", "shard_open"); }
    ["Users", "DungeonAttempts"].forEach((name) => {
      if (!ss.getSheetByName(name)) {
        const sh = ss.insertSheet(name);
        const headers = name === "Users"
          ? ["id", "identifiant", "nomComplet", "passwordHash", "salt", "nx", "avatarId", "abonnement", "bestScore", "historyJSON", "nbConnexions", "derniereConnexion", "nbDefisCompletes", "moyenPaiement", "referencePaiement", "dateFinAbonnement"]
          : ["id", "userId", "dungeonId", "dateJour", "nxGagne", "timestamp"];
        sh.appendRow(headers);
      }
    });
    if (listShardsRaw().some((s) => s.spreadsheetId === payload.spreadsheetId.trim())) fail("Cette feuille est déjà enregistrée comme shard.", "duplicate");
    const shardId = genId("shard");
    appendRow(SHEET_NAMES.SHARDS, { shardId, spreadsheetId: payload.spreadsheetId.trim(), label: payload.label });
    return { ok: true, shardId };
  });
}

/* --- Statistiques (traction / rétention) --- */
function action_adminGetStats(payload, token) {
  requireAdmin(token);
  const shards = listShardsRaw();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let totalJoueurs = 0, joueursActifs = 0, totalNx = 0, connexions7j = 0, defisCompletes = 0;
  shards.forEach((s) => {
    readRowsSS(shardSpreadsheet(s.shardId), SHEET_NAMES.USERS).forEach((u) => {
      totalJoueurs++;
      if (u.abonnement === "actif") joueursActifs++;
      totalNx += Number(u.nx) || 0;
      defisCompletes += Number(u.nbDefisCompletes) || 0;
      if (u.derniereConnexion) {
        const d = new Date(u.derniereConnexion);
        if (!isNaN(d) && d >= weekAgo) connexions7j++;
      }
    });
  });
  return { totalJoueurs, joueursActifs, totalNx, connexions7j, defisCompletes, nbShards: shards.length, capaciteShard: shardCapacity() };
}

/* --- Cartes de révision --- */
function action_adminListRevisionCards(payload, token) { requireAdmin(token); return readRows(SHEET_NAMES.REVISION_CARDS); }

function action_adminSaveRevisionCard(payload, token) {
  requireAdmin(token);
  if (!payload.recto || !payload.reponse) fail("Recto et réponse requis.", "bad_request");
  const data = { categorie: payload.categorie, recto: payload.recto, reponse: payload.reponse, explication: payload.explication || "" };
  if (payload.id) updateRowById(SHEET_NAMES.REVISION_CARDS, "id", payload.id, data);
  else appendRow(SHEET_NAMES.REVISION_CARDS, Object.assign({ id: genId("rc") }, data));
  return { ok: true };
}

function action_adminDeleteRevisionCard(payload, token) {
  requireAdmin(token);
  deleteRowByIdSS(registrySS(), SHEET_NAMES.REVISION_CARDS, "id", payload.id);
  return { ok: true };
}

/** Import en masse : une carte par ligne, "recto;reponse;explication" (explication optionnelle). */
function action_adminImportRevisionCards(payload, token) {
  requireAdmin(token);
  if (!payload.csvText || !payload.categorie) fail("Catégorie et contenu à importer requis.", "bad_request");
  const lines = payload.csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  let added = 0, skipped = 0;
  lines.forEach((line) => {
    const parts = line.split(";").map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) { skipped++; return; }
    appendRow(SHEET_NAMES.REVISION_CARDS, { id: genId("rc"), categorie: payload.categorie, recto: parts[0], reponse: parts[1], explication: parts[2] || "" });
    added++;
  });
  return { added, skipped };
}

/* --- Le saviez-vous --- */
function action_adminListFacts(payload, token) { requireAdmin(token); return readRows(SHEET_NAMES.FACTS); }

function action_adminSaveFact(payload, token) {
  requireAdmin(token);
  if (!payload.texte) fail("Texte requis.", "bad_request");
  if (payload.id) updateRowById(SHEET_NAMES.FACTS, "id", payload.id, { texte: payload.texte });
  else appendRow(SHEET_NAMES.FACTS, { id: genId("fact"), texte: payload.texte });
  return { ok: true };
}

/** Import en masse : un fait par ligne. */
function action_adminImportFacts(payload, token) {
  requireAdmin(token);
  if (!payload.csvText) fail("Contenu à importer requis.", "bad_request");
  const lines = payload.csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  lines.forEach((texte) => appendRow(SHEET_NAMES.FACTS, { id: genId("fact"), texte }));
  return { added: lines.length };
}

/* --- Donjons --- */
function action_adminListDungeons(payload, token) {
  requireAdmin(token);
  return readRows(SHEET_NAMES.DUNGEONS).map((d) => {
    let questions = [];
    try { questions = JSON.parse(d.questionsJSON || "[]"); } catch (e) {}
    return { id: d.id, titre: d.titre, categorie: d.categorie, publie: d.publie === true || d.publie === "TRUE" || d.publie === "true", questions };
  });
}

function action_adminSaveDungeon(payload, token) {
  requireAdmin(token);
  if (!payload.titre || !payload.questions || !payload.questions.length) fail("Titre et questions requis.", "bad_request");
  const questions = payload.questions.map((q, i) => ({
    id: q.id || genId("q" + i), enonce: q.enonce, options: q.options, bonneReponseIndex: Number(q.bonneReponseIndex) || 0,
    nx: Number(q.nx) || 10, tempsLimite: Number(q.tempsLimite) || 30, bonusVitesse: Number(q.bonusVitesse) || 0,
  }));
  if (payload.id) updateRowById(SHEET_NAMES.DUNGEONS, "id", payload.id, { titre: payload.titre, categorie: payload.categorie, questionsJSON: JSON.stringify(questions) });
  else appendRow(SHEET_NAMES.DUNGEONS, { id: genId("dgn"), titre: payload.titre, categorie: payload.categorie, publie: false, questionsJSON: JSON.stringify(questions) });
  return { ok: true };
}

function action_adminPublishDungeon(payload, token) {
  requireAdmin(token);
  updateRowById(SHEET_NAMES.DUNGEONS, "id", payload.dungeonId, { publie: !!payload.publie });
  return { ok: true };
}

/* --- Nexify --- */
function action_adminListNexifyCards(payload, token) {
  requireAdmin(token);
  return readRows(SHEET_NAMES.NEXIFY_CARDS).map((c) => {
    let options = [];
    try { options = JSON.parse(c.optionsJSON || "[]"); } catch (e) {}
    return { id: c.id, categorie: c.categorie, question: c.question, options, bonneReponseIndex: Number(c.bonneReponseIndex), multiplicateur: Number(c.multiplicateur) };
  });
}

function action_adminSaveNexifyCard(payload, token) {
  requireAdmin(token);
  if (!payload.question || !payload.options || !payload.options.length) fail("Question et options requises.", "bad_request");
  const data = { categorie: payload.categorie, question: payload.question, optionsJSON: JSON.stringify(payload.options), bonneReponseIndex: Number(payload.bonneReponseIndex) || 0, multiplicateur: Number(payload.multiplicateur) || 2 };
  if (payload.id) updateRowById(SHEET_NAMES.NEXIFY_CARDS, "id", payload.id, data);
  else appendRow(SHEET_NAMES.NEXIFY_CARDS, Object.assign({ id: genId("nxc") }, data));
  return { ok: true };
}

/* --- Réglages --- */
function action_adminChangePassword(payload, token) {
  requireAdmin(token);
  const props = PropertiesService.getScriptProperties();
  const adminHash = props.getProperty("ADMIN_PASSWORD_HASH");
  const adminSalt = props.getProperty("ADMIN_SALT");
  if (hashPassword(payload.ancien, adminSalt) !== adminHash) fail("Ancien mot de passe incorrect.", "auth");
  const newSalt = Utilities.getUuid();
  props.setProperties({ ADMIN_SALT: newSalt, ADMIN_PASSWORD_HASH: hashPassword(payload.nouveau, newSalt) });
  return { ok: true };
}

const ACTIONS = {
  login: action_login, getProfile: action_getProfile, setAvatar: action_setAvatar,
  listDungeons: action_listDungeons, submitDungeonAttempt: action_submitDungeonAttempt,
  listNexifyCards: action_listNexifyCards, playNexifyCard: action_playNexifyCard,
  listRevisionCards: action_listRevisionCards, listFacts: action_listFacts, getLeaderboard: action_getLeaderboard,
  adminLogin: action_adminLogin, adminListNexians: action_adminListNexians, adminCreateNexian: action_adminCreateNexian,
  adminUpdateNexian: action_adminUpdateNexian, adminSetSubscription: action_adminSetSubscription,
  adminListShards: action_adminListShards, adminProvisionShard: action_adminProvisionShard, adminGetStats: action_adminGetStats,
  adminListDungeons: action_adminListDungeons, adminSaveDungeon: action_adminSaveDungeon, adminPublishDungeon: action_adminPublishDungeon,
  adminListNexifyCards: action_adminListNexifyCards, adminSaveNexifyCard: action_adminSaveNexifyCard,
  adminListRevisionCards: action_adminListRevisionCards, adminSaveRevisionCard: action_adminSaveRevisionCard,
  adminDeleteRevisionCard: action_adminDeleteRevisionCard, adminImportRevisionCards: action_adminImportRevisionCards,
  adminListFacts: action_adminListFacts, adminSaveFact: action_adminSaveFact, adminImportFacts: action_adminImportFacts,
  adminChangePassword: action_adminChangePassword,
};

/* ---------------------------------------------------------------
 * Logique NX partagée avec le front — copie fidèle de js/logic-core.js.
 * Toute modification doit être répercutée dans LES DEUX fichiers
 * (un test de parité existe côté dépôt : voir check_parity dans le README).
 * ------------------------------------------------------------- */
const NexiLogicServer = {
  calculateDungeonReward: function (isCorrect, basePoints, timeTakenSec, timeLimitSec, timeBonusFactor) {
    basePoints = Number(basePoints) || 0;
    timeBonusFactor = Number(timeBonusFactor) || 0;
    if (!isCorrect) return { gained: 0, bonus: 0, base: basePoints };
    let bonus = 0;
    if (timeBonusFactor > 0 && timeLimitSec > 0) {
      const remainingRatio = Math.max(0, (timeLimitSec - timeTakenSec) / timeLimitSec);
      bonus = Math.round(remainingRatio * timeBonusFactor);
    }
    return { gained: basePoints + bonus, bonus, base: basePoints };
  },
  calculateNexifyResult: function (betNX, multiplier, isCorrect) {
    betNX = Math.max(0, Number(betNX) || 0);
    multiplier = Math.max(1, Number(multiplier) || 1);
    if (isCorrect) return { delta: Math.round(betNX * multiplier) - betNX, outcome: "gagne" };
    return { delta: -betNX, outcome: "perdu" };
  },
  applyDelta: function (currentNX, delta) {
    return Math.max(0, Math.round(currentNX + delta));
  },
  /** Choisit le shard le moins chargé sous la capacité ; null si tous pleins. */
  pickLeastLoadedShard: function (counts, capacity) {
    let best = null;
    counts.forEach((c) => {
      if (c.count < capacity && (!best || c.count < best.count)) best = c;
    });
    return best ? best.shardId : null;
  },
};

/* ---------------------------------------------------------------
 * SETUP — à exécuter UNE SEULE FOIS depuis l'éditeur Apps Script,
 * lié à la Google Sheet qui servira de Registre (et de shard1).
 * ------------------------------------------------------------- */
function setupNexiLab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    Shards: ["shardId", "spreadsheetId", "label"],
    ShardIndex: ["identifiant", "shardId", "userId"],
    Sessions: ["token", "userId", "role", "shardId", "expiresAt"],
    Dungeons: ["id", "titre", "categorie", "publie", "questionsJSON"],
    NexifyCards: ["id", "categorie", "question", "optionsJSON", "bonneReponseIndex", "multiplicateur"],
    RevisionCards: ["id", "categorie", "recto", "reponse", "explication"],
    Facts: ["id", "texte"],
    Users: ["id", "identifiant", "nomComplet", "passwordHash", "salt", "nx", "avatarId", "abonnement", "bestScore", "historyJSON", "nbConnexions", "derniereConnexion", "nbDefisCompletes", "moyenPaiement", "referencePaiement", "dateFinAbonnement"],
    DungeonAttempts: ["id", "userId", "dungeonId", "dateJour", "nxGagne", "timestamp"],
  };
  Object.keys(schemas).forEach((name) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(schemas[name]);
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("SHARED_SECRET")) props.setProperty("SHARED_SECRET", Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty("SHARD_CAPACITY")) props.setProperty("SHARD_CAPACITY", String(DEFAULT_SHARD_CAPACITY));
  if (!props.getProperty("ADMIN_IDENTIFIANT")) {
    const salt = Utilities.getUuid();
    props.setProperties({ ADMIN_IDENTIFIANT: "admin", ADMIN_SALT: salt, ADMIN_PASSWORD_HASH: hashPassword("ChangeMoi123!", salt) });
  }

  // Cette feuille elle-même devient "shard1" si ce n'est pas déjà fait.
  const shards = readRowsSS(ss, "Shards");
  if (!shards.some((s) => s.spreadsheetId === ss.getId())) {
    appendRowSS(ss, "Shards", { shardId: "shard1", spreadsheetId: ss.getId(), label: "Shard 1 (feuille principale)" });
  }

  console.log("Installation terminée.");
  console.log("SHARED_SECRET à copier dans GAS_SHARED_SECRET (Vercel) : " + props.getProperty("SHARED_SECRET"));
  console.log("Identifiant admin initial : admin / ChangeMoi123!  (à changer immédiatement dans le panel admin)");
  console.log("Cette feuille sert de Registre ET de shard1 (jusqu'à " + DEFAULT_SHARD_CAPACITY + " joueurs). Ajoute d'autres feuilles-shards depuis le panel admin (onglet « Shards ») quand ce quota est atteint.");
}
