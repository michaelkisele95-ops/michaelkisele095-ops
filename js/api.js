/**
 * NEXI LAB — api.js
 * Couche unique d'accès réseau. Règle absolue côté joueur : jamais de
 * message d'erreur technique. On ne distingue que deux cas :
 *   - problème de connexion (pas de réponse du réseau)
 *   - action refusée "métier" (message volontairement rédigé par l'admin
 *     ou un libellé générique convivial)
 * Toute panne backend (Sheet indisponible, quota, script en erreur...)
 * est absorbée ici et rejouée automatiquement, jamais montrée telle quelle.
 */
(function () {
  "use strict";
  const cfg = window.NEXI_CONFIG;

  async function call(action, payload = {}, { retries = 2 } = {}) {
    const session = window.NexiAuth ? window.NexiAuth.getSession() : null;
    const body = { action, payload, token: session ? session.token : null };

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(cfg.API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("network_" + res.status);
        const json = await res.json();
        if (json.ok === false) {
          // Erreur "métier" volontaire (ex: identifiants invalides, NX insuffisant...)
          const err = new Error(json.message || "Action impossible pour le moment.");
          err.code = json.code || "business_error";
          err.friendly = true;
          throw err;
        }
        return json.data;
      } catch (e) {
        lastErr = e;
        if (e.friendly) throw e; // pas de retry sur une erreur métier claire
        // erreur réseau/backend -> on retente en silence
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    const connErr = new Error("Connexion instable. Vérifie ta connexion et réessaie.");
    connErr.code = "connection";
    connErr.friendly = true;
    throw connErr;
  }

  window.NexiAPI = {
    login: (identifiant, motDePasse) => call("login", { identifiant, motDePasse }),
    getProfile: () => call("getProfile"),
    setAvatar: (avatarId) => call("setAvatar", { avatarId }),
    listDungeons: () => call("listDungeons"),
    submitDungeonAttempt: (dungeonId, answers, timeTakenSec) =>
      call("submitDungeonAttempt", { dungeonId, answers, timeTakenSec }),
    listNexifyCards: () => call("listNexifyCards"),
    playNexifyCard: (cardId, betNX, answerId) =>
      call("playNexifyCard", { cardId, betNX, answerId }),
    listRevisionCards: (category) => call("listRevisionCards", { category }),
    listFacts: () => call("listFacts"),
    getLeaderboard: () => call("getLeaderboard"),

    // --- Admin ---
    adminLogin: (identifiant, motDePasse) => call("adminLogin", { identifiant, motDePasse }),
    adminListNexians: () => call("adminListNexians"),
    adminCreateNexian: (data) => call("adminCreateNexian", data),
    adminUpdateNexian: (data) => call("adminUpdateNexian", data),
    adminSetSubscription: (nexianId, statut, shardId) => call("adminSetSubscription", { nexianId, statut, shardId }),
    adminListShards: () => call("adminListShards"),
    adminProvisionShard: (spreadsheetId, label) => call("adminProvisionShard", { spreadsheetId, label }),
    adminGetStats: () => call("adminGetStats"),
    adminListDungeons: () => call("adminListDungeons"),
    adminSaveDungeon: (dungeon) => call("adminSaveDungeon", dungeon),
    adminPublishDungeon: (dungeonId, publie) => call("adminPublishDungeon", { dungeonId, publie }),
    adminListNexifyCards: () => call("adminListNexifyCards"),
    adminSaveNexifyCard: (card) => call("adminSaveNexifyCard", card),
    adminListRevisionCards: () => call("adminListRevisionCards"),
    adminSaveRevisionCard: (card) => call("adminSaveRevisionCard", card),
    adminImportRevisionCards: (categorie, csvText) => call("adminImportRevisionCards", { categorie, csvText }),
    adminDeleteRevisionCard: (id) => call("adminDeleteRevisionCard", { id }),
    adminListFacts: () => call("adminListFacts"),
    adminSaveFact: (fact) => call("adminSaveFact", fact),
    adminImportFacts: (csvText) => call("adminImportFacts", { csvText }),
    adminChangePassword: (ancien, nouveau) => call("adminChangePassword", { ancien, nouveau }),
  };
})();
