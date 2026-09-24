/**
 * NEXI LAB — config.js
 * Aucun secret ici : l'URL du backend Google Apps Script n'est JAMAIS
 * exposée côté client. Le front appelle uniquement /api/proxy (fonction
 * serverless Vercel), qui relaie vers Apps Script côté serveur.
 * => Un F12 / onglet réseau du navigateur ne révèle que "/api/proxy".
 */
window.NEXI_CONFIG = Object.freeze({
  APP_NAME: "Nexi Lab",
  API_ENDPOINT: "/api/proxy",
  SESSION_KEY: "nexi_session_v1",
  SESSION_TTL_MS: 12 * 60 * 60 * 1000, // 12h glissantes
  ELEMENT_CATEGORIES: [
    "Chimie analytique", "Chimie inorganique", "Chimie organique",
    "Chimie de l'environnement", "Chimie physique", "Chimie quantique",
    "Chimie théorique", "Chimie industrielle", "Métallurgie hydro",
    "Métallurgie pyro"
  ]
});
