// api/execute-script.js
// -----------------------------------------------------------------------------
// Vercel Serverless Function — proxy sécurisé "Nexi one"
// Rôle : recevoir les requêtes du client (sans secret), injecter APP_SECRET
// côté serveur, transférer vers Google Apps Script, renvoyer la réponse.
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  // --- 1. En-têtes CORS -------------------------------------------------
  // ⚠️ En production, remplace "*" par ton domaine réel (ex: "https://nexi-one.vercel.app")
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Requête préliminaire (préflight) envoyée automatiquement par le navigateur
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // --- 2. On n'accepte que POST ------------------------------------------
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      message: 'Méthode non autorisée. Utilisez POST.'
    });
    return;
  }

  try {
    // --- 3. Récupération des variables d'environnement Vercel ------------
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const APP_SECRET = process.env.APP_SECRET;

    if (!APPS_SCRIPT_URL || !APP_SECRET) {
      res.status(500).json({
        success: false,
        message: "Configuration serveur manquante : APPS_SCRIPT_URL ou APP_SECRET absent des variables d'environnement Vercel."
      });
      return;
    }

    // --- 4. Corps de la requête envoyée par le client (sans secret) ------
    // Exemple attendu : { action: "getAll" } ou { action: "saveAll", payload: {...} }
    const clientPayload = req.body || {};

    // --- 5. Injection secrète du mot de passe côté serveur ---------------
    const payloadToSend = {
      ...clientPayload,
      secret: APP_SECRET
    };

    // --- 6. Transfert vers Google Apps Script -----------------------------
    const scriptResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadToSend),
      redirect: 'follow'
    });

    const rawText = await scriptResponse.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Le script Google a répondu, mais pas en JSON valide (souvent une erreur
      // d'autorisation ou de déploiement du .gs)
      res.status(502).json({
        success: false,
        message: "Réponse invalide reçue depuis Google Apps Script.",
        raw: rawText.slice(0, 500)
      });
      return;
    }

    // --- 7. On relaie la réponse (déjà en JSON) au client -----------------
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur interne du proxy Vercel : ' + error.message
    });
  }
}
