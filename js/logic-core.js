/**
 * NEXI LAB — logic-core.js
 * Fonctions PURES (aucun accès DOM/réseau) : calcul des NX, scoring des
 * donjons, résultat Nexify. Isolées ici pour être testables unitairement
 * (voir /test/logic-core.test.js) et partagées entre eleve.js et l'admin.
 * Exporté en CommonJS pour Node (tests) ET en window.NexiLogic pour le navigateur.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else root.NexiLogic = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STARTING_NX = 100;

  /**
   * Calcule le gain NX d'un défi de donjon.
   * @param {boolean} isCorrect - réponse correcte ou non
   * @param {number} basePoints - points NX de base définis par l'admin
   * @param {number} timeTakenSec - temps mis par le joueur
   * @param {number} timeLimitSec - temps limite du défi
   * @param {number} [timeBonusFactor=0] - NX bonus max attribuable pour rapidité (0 = désactivé)
   * @returns {{gained:number, bonus:number, base:number}}
   */
  function calculateDungeonReward(isCorrect, basePoints, timeTakenSec, timeLimitSec, timeBonusFactor) {
    basePoints = Number(basePoints) || 0;
    timeBonusFactor = Number(timeBonusFactor) || 0;
    if (!isCorrect) return { gained: 0, bonus: 0, base: basePoints };
    let bonus = 0;
    if (timeBonusFactor > 0 && timeLimitSec > 0) {
      const remainingRatio = Math.max(0, (timeLimitSec - timeTakenSec) / timeLimitSec);
      bonus = Math.round(remainingRatio * timeBonusFactor);
    }
    return { gained: basePoints + bonus, bonus, base: basePoints };
  }

  /**
   * Résout une manche Nexify (carte-pari).
   * @param {number} betNX - NX misés (doit être <= solde du joueur, vérifié en amont)
   * @param {number} multiplier - multiplicateur défini sur la carte (ex: 2, 3)
   * @param {boolean} isCorrect
   * @returns {{delta:number, newNote:string}} delta à appliquer au solde NX (peut être négatif)
   */
  function calculateNexifyResult(betNX, multiplier, isCorrect) {
    betNX = Math.max(0, Number(betNX) || 0);
    multiplier = Math.max(1, Number(multiplier) || 1);
    if (isCorrect) {
      const winnings = Math.round(betNX * multiplier) - betNX;
      return { delta: winnings, outcome: "gagne" };
    }
    return { delta: -betNX, outcome: "perdu" };
  }

  /** Empêche un solde NX de descendre sous 0. */
  function applyDelta(currentNX, delta) {
    return Math.max(0, Math.round(currentNX + delta));
  }

  /** Niveau indicatif dérivé du NX (paliers non-linéaires, purement cosmétique). */
  function levelFromNX(nx) {
    nx = Number(nx) || 0;
    const thresholds = [0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7200];
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
      if (nx >= thresholds[i]) level = i + 1;
    }
    const next = thresholds[level] ?? thresholds[thresholds.length - 1] + 2500;
    const prev = thresholds[level - 1] ?? 0;
    const progressPct = next > prev ? Math.min(100, Math.round(((nx - prev) / (next - prev)) * 100)) : 100;
    return { level, next, prev, progressPct };
  }

  /** Vérifie qu'un joueur peut encore tenter un défi (une seule fois / défi publié). */
  function canAttemptDungeon(attemptsForThisDungeon) {
    return !attemptsForThisDungeon || attemptsForThisDungeon.length === 0;
  }

  /**
   * Choisit le shard (feuille-joueurs) le moins chargé, sous le plafond de
   * capacité. Retourne null si tous les shards connus sont pleins — dans ce
   * cas, l'appelant doit inviter l'admin à provisionner un nouveau shard.
   * @param {{shardId:string, count:number}[]} counts
   * @param {number} capacity
   * @returns {string|null}
   */
  function pickLeastLoadedShard(counts, capacity) {
    let best = null;
    (counts || []).forEach((c) => {
      if (c.count < capacity && (!best || c.count < best.count)) best = c;
    });
    return best ? best.shardId : null;
  }

  return {
    STARTING_NX,
    calculateDungeonReward,
    calculateNexifyResult,
    applyDelta,
    levelFromNX,
    canAttemptDungeon,
    pickLeastLoadedShard,
  };
});
