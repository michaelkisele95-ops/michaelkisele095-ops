/* ============================================================
   NEXIONE — config.js
   Seul fichier à modifier pour brancher NEXIONE à ton Google Sheet.
   Suis le guide "Connecter Google Sheets" dans README.md — en résumé :

   1. Crée un Google Sheet et ouvre Extensions > Apps Script.
   2. Colle le contenu de google-apps-script/Code.gs dans l'éditeur.
   3. Remplace APP_SECRET ci-dessous par un mot de passe que TOI seul connais,
      et mets exactement le même dans la constante APP_SECRET du fichier Code.gs.
   4. Déploie (Déployer > Nouveau déploiement > Application Web,
      exécuter en tant que "Moi", accès "Tout le monde").
   5. Colle l'URL obtenue dans APPS_SCRIPT_URL ci-dessous.
   6. Mets GOOGLE_SHEETS_ENABLED à true.

   Tant que GOOGLE_SHEETS_ENABLED est à false, NEXIONE fonctionne en mode
   démo 100% local (localStorage) — rien n'est envoyé nulle part.
   ============================================================ */

window.NEXI_CONFIG = {
  // Passe à true une fois les étapes 1 à 5 ci-dessus terminées.
  GOOGLE_SHEETS_ENABLED: true,

  // URL de déploiement de ton Google Apps Script (se termine par /exec).
  APPS_SCRIPT_URL: "",

  // Doit être identique au APP_SECRET dans google-apps-script/Code.gs.
  // Sert à vérifier que les données envoyées viennent bien de TON application.
  APP_SECRET: "",

  // Nom affiché dans le panel Admin > Réglages pour identifier la connexion.
  SHEET_LABEL: "DATA-NEXI-MICHAEL-MAGIC"
};
