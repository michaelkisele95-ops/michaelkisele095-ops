/**
 * NEXI LAB — api/proxy.js (fonction serverless Vercel)
 *
 * Pourquoi ce fichier existe :
 *   Le front (index.html/eleve.html/admin.html) n'appelle JAMAIS l'URL du
 *   Google Apps Script directement. Il appelle "/api/proxy", qui tourne
 *   côté serveur Vercel. Résultat : en ouvrant F12 > Réseau, un visiteur
 *   ne voit qu'une requête vers "/api/proxy" sur votre propre domaine —
 *   l'URL réelle du script Google et le secret partagé restent invisibles.
 *
 * Ce fichier ne contient aucune logique métier : il relaie fidèlement le
 * corps de la requête vers Apps Script, en y ajoutant le secret partagé
 * (dans le corps JSON, car Apps Script ne lit pas les en-têtes personnalisés
 * de façon fiable) que seul le script accepte.
 */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, code: "method", message: "Méthode non autorisée." });
    return;
  }

  const GAS_URL = process.env.GAS_WEBAPP_URL;
  const SECRET = process.env.GAS_SHARED_SECRET;

  if (!GAS_URL || !SECRET) {
    res.status(200).json({ ok: false, code: "config", message: "Service momentanément indisponible. Réessaie dans un instant." });
    return;
  }

  try {
    const outgoing = Object.assign({}, req.body || {}, { secret: SECRET });
    const upstream = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(outgoing),
    });
    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { json = { ok: false, code: "upstream_format", message: "Connexion instable. Réessaie." }; }
    res.status(200).json(json);
  } catch (e) {
    res.status(200).json({ ok: false, code: "connection", message: "Connexion instable. Vérifie ta connexion et réessaie." });
  }
};
