// js/sync.js — Nexi one
// -----------------------------------------------------------------------------
// Ce fichier ne contient PLUS ni APPS_SCRIPT_URL ni APP_SECRET.
// Tout passe désormais par l'API Vercel (api/execute-script.js).
// -----------------------------------------------------------------------------

// ⚠️ Remplace cette URL par ta VRAIE URL de déploiement Vercel, par exemple :
// "https://nexi-one.vercel.app/api/execute-script"
const API_URL = "https://michaelkisele095-ops.vercel.app/api/execute-script";

const NexiSync = (function () {

  /**
   * Récupère toutes les données depuis le backend (via le proxy Vercel).
   * Retourne une Promise qui résout avec les données ("data") en cas de succès.
   */
  function pull() {
    return fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "getAll" })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Erreur réseau (" + response.status + ") lors du pull.");
        }
        return response.json();
      })
      .then(function (result) {
        if (!result.success) {
          throw new Error(result.message || "Échec du chargement des données.");
        }
        return result.data;
      })
      .catch(function (error) {
        console.error("[NexiSync] Erreur lors du pull :", error);
        throw error;
      });
  }

  /**
   * Envoie les données locales vers le backend (via le proxy Vercel).
   * @param {Object} payload - les données à sauvegarder
   * Retourne une Promise qui résout avec le résultat en cas de succès.
   */
  function doPushNow(payload) {
    return fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "saveAll",
        payload: payload
      })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Erreur réseau (" + response.status + ") lors du push.");
        }
        return response.json();
      })
      .then(function (result) {
        if (!result.success) {
          throw new Error(result.message || "Échec de la sauvegarde des données.");
        }
        return result;
      })
      .catch(function (error) {
        console.error("[NexiSync] Erreur lors du push :", error);
        throw error;
      });
  }

  // Expose uniquement ce qui est nécessaire au reste de l'application
  return {
    pull: pull,
    doPushNow: doPushNow
  };

})();
