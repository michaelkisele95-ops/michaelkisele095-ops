# Nexi Lab — NEXI ACADEMY

PWA gamifiée pour accompagner des étudiants en **chimie et métallurgie** :
donjons de défis, cartes-paris "Nexify", cartes de révision, classement
général, et un panel administrateur complet — le tout synchronisé via
Google Sheets, sans dépendance à un téléphone en particulier.

**v2** : répartition automatique des joueurs sur plusieurs Google Sheets
(20/feuille, extensible depuis le panel admin sans toucher au code),
verrouillage anti-corruption des soldes NX, suivi manuel des abonnements
(moyen de paiement/référence), import en masse de contenu, et un tableau
de bord Stats (joueurs actifs, connexions 7 jours, défis complétés).

## Démarrer ici

👉 **Ouvre `GUIDE_DEPLOIEMENT.md`** : c'est le guide pas-à-pas complet
(Google Sheets → Apps Script → Vercel → premiers réglages → checklist de
test).

## Structure du projet

```
nexi-lab/
├── index.html              Connexion (joueur + admin), invite d'installation PWA
├── eleve.html               Panel joueur (profil, donjons, nexify, cartes, classement)
├── admin.html                Panel administrateur
├── manifest.json / service-worker.js   PWA installable, cache de l'habillage
├── css/style.css             Design system partagé
├── js/
│   ├── config.js              Configuration front (aucun secret)
│   ├── logic-core.js           Calculs NX — testé unitairement (voir test/)
│   ├── api.js                  Couche réseau (appelle /api/proxy uniquement)
│   ├── auth.js                 Session joueur/admin
│   ├── nexibot.js              Bulle d'orientation contextuelle
│   ├── eleve.js / admin.js     Logique des deux panels
├── api/proxy.js               Fonction serverless Vercel (masque l'URL Apps Script)
├── google-apps-script/Code.gs Backend complet (auth, Sheets, sessions, actions)
├── icons/                     Logo moléculaire + avatars (tuiles façon tableau périodique)
└── test/logic-core.test.js    Tests unitaires (Node, sans dépendance)
```

## Tester la logique de jeu localement

```bash
npm test
```

Ceci exécute `test/logic-core.test.js`, qui valide indépendamment du
navigateur : calcul des gains de donjon (bonus de vitesse inclus), résultat
des cartes Nexify (mise/multiplicateur/perte), garde-fou anti-solde-négatif,
et paliers de niveau.

## Sécurité — ce qui est fait

- Le navigateur ne parle jamais directement à Google Apps Script : il passe
  par `/api/proxy` (fonction serverless), qui seul connaît l'URL réelle et
  le secret partagé (variables d'environnement Vercel, jamais dans le code).
- Mots de passe hachés (SHA-256 + sel par utilisateur) — jamais stockés en
  clair dans le Google Sheet.
- Sessions par jeton opaque expirant après 12h, revalidées à chaque appel.
- Le vrai nom d'un Nexian n'est jamais exposé au classement — seul son
  identifiant l'est.
- Aucun message d'erreur technique n'est montré à un joueur : uniquement
  "connexion instable" ou un message métier clair écrit pour lui.

Voir `GUIDE_DEPLOIEMENT.md` pour la checklist de vérification complète.
