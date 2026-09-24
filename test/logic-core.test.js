/**
 * Tests unitaires purs (Node, sans dépendance) pour logic-core.js.
 * Exécuter: node test/logic-core.test.js
 */
const assert = require("assert");
const L = require("../js/logic-core.js");

let passed = 0;
function t(name, fn) {
  try {
    fn();
    console.log("  OK  " + name);
    passed++;
  } catch (e) {
    console.error("FAIL  " + name + " -> " + e.message);
    process.exitCode = 1;
  }
}

console.log("== Donjons (calculateDungeonReward) ==");
t("mauvaise réponse => 0 NX", () => {
  const r = L.calculateDungeonReward(false, 50, 10, 30, 20);
  assert.strictEqual(r.gained, 0);
});
t("bonne réponse rapide => base + bonus max proche du plafond", () => {
  const r = L.calculateDungeonReward(true, 50, 2, 30, 20);
  assert.ok(r.gained > 50 && r.gained <= 70, "gained=" + r.gained);
});
t("bonne réponse au dernier moment => bonus proche de 0", () => {
  const r = L.calculateDungeonReward(true, 50, 29, 30, 20);
  assert.ok(r.gained >= 50 && r.gained <= 51, "gained=" + r.gained);
});
t("pas de facteur temps => gain = base uniquement", () => {
  const r = L.calculateDungeonReward(true, 40, 5, 30, 0);
  assert.strictEqual(r.gained, 40);
});

console.log("== Nexify (calculateNexifyResult) ==");
t("bonne réponse x2 => gain net = mise", () => {
  const r = L.calculateNexifyResult(100, 2, true);
  assert.strictEqual(r.delta, 100);
});
t("bonne réponse x3 => gain net = 2x la mise", () => {
  const r = L.calculateNexifyResult(100, 3, true);
  assert.strictEqual(r.delta, 200);
});
t("mauvaise réponse => perte totale de la mise", () => {
  const r = L.calculateNexifyResult(150, 2, false);
  assert.strictEqual(r.delta, -150);
});

console.log("== Garde-fou solde (applyDelta) ==");
t("le solde ne descend jamais sous 0", () => {
  assert.strictEqual(L.applyDelta(50, -200), 0);
});
t("addition normale", () => {
  assert.strictEqual(L.applyDelta(100, 25), 125);
});

console.log("== Progression (levelFromNX) ==");
t("100 NX de départ => niveau 2, palier suivant 250", () => {
  const r = L.levelFromNX(100);
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.next, 250);
});
t("0 NX => niveau 1", () => {
  assert.strictEqual(L.levelFromNX(0).level, 1);
});
t("NX très élevé => palier au-delà de la table gérée sans erreur", () => {
  const r = L.levelFromNX(999999);
  assert.ok(r.level >= 10);
});

console.log("== Anti-triche (canAttemptDungeon) ==");
t("aucune tentative existante => autorisé", () => {
  assert.strictEqual(L.canAttemptDungeon([]), true);
});
t("une tentative déjà enregistrée => refusé", () => {
  assert.strictEqual(L.canAttemptDungeon([{ id: "x" }]), false);
});

console.log("== Répartition de charge (pickLeastLoadedShard) ==");
t("choisit le shard le moins chargé sous la capacité", () => {
  const r = L.pickLeastLoadedShard([{ shardId: "s1", count: 18 }, { shardId: "s2", count: 5 }], 20);
  assert.strictEqual(r, "s2");
});
t("ignore les shards pleins", () => {
  const r = L.pickLeastLoadedShard([{ shardId: "s1", count: 20 }, { shardId: "s2", count: 20 }], 20);
  assert.strictEqual(r, null);
});
t("un seul shard disponible et non plein => le retourne", () => {
  const r = L.pickLeastLoadedShard([{ shardId: "s1", count: 3 }], 20);
  assert.strictEqual(r, "s1");
});

console.log(`\n${passed} test(s) réussi(s).`);
