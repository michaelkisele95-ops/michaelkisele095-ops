# NEXIONE — NEXI ACADEMY (NEXI ONE)

Application web (PWA — installable sur téléphone/PC) : portail de connexion unique, panel administrateur, panel superviseur d'établissement, et espace enfant gamifié (Défis + Nexi d'affinité), synchronisée avec un Google Sheet qui sert de vraie base de données partagée entre tous les appareils.

Ouvre `index.html` via un serveur local (section 3) et teste avec les comptes de démonstration affichés sur l'écran de connexion.

---

## 1. Ce qui est livré, honnêtement

**Le point le plus important : le compte créé sur un téléphone marche sur un autre.**
Une fois Google Sheets connecté (section 4), le Sheet est la SEULE source de vérité. Chaque page (connexion, Admin, Enfant, Superviseur) recharge l'état complet depuis le Sheet à chaque ouverture (`NexiStore.bootstrap()`), puis travaille sur une copie locale rapide et repousse ses changements vers le Sheet. Un identifiant/mot de passe créé sur le téléphone A fonctionne sur le téléphone B dès que celui-ci a du réseau — testé noir sur blanc avec deux navigateurs complètement séparés (voir section 8).

**Fonctionne et testé de bout en bout :**
- Portail de connexion unique, redirection automatique par rôle (Admin / Superviseur / Enfant). Un compte bloqué ou supprimé côté Sheet est déconnecté automatiquement à la prochaine ouverture.
- Panel Admin : enfants (créer / bloquer / supprimer, avatar parmi 50 fournis, classe RDC), Défis (création manuelle question par question avec **domaine RDC ou personnalisé par question**, import CSV, défis **hebdomadaires**), Nexi d'affinité (6 axes, import CSV), Établissements/Superviseurs, validation des suggestions, Réglages avec **statut de connexion Google Sheets en direct** (bouton "Tester la connexion" / "Forcer une synchronisation").
- Panel Superviseur : vue école, profil complet par élève (**profil d'apprentissage mensuel ET cumulé** par domaine), comparatif classe, statistiques, export CSV/PDF.
- Espace Enfant : Nexi Bot **flottant en haut, discret** — il pulse silencieusement à chaque action (changement de section, début de défi...) sans jamais ouvrir sa bulle tout seul ; un clic volontaire révèle le message. Défi en mode examen chronométré, verrouillé après une tentative, confettis + profil d'apprentissage **provisoire** par domaine en fin de défi. Test d'affinité (échelle 1-5). Profil avec les 50 vrais avatars + thème. Progression avec badges en icônes SVG originales (trophée, flamme, médaille, boussole). Classement anonymisé (identifiant seul).
- **Navigation en pages empilées** : cliquer une tuile ouvre une page dédiée plein écran avec un bouton retour — la grille de tuiles se cache pendant ce temps, pour ne jamais surcharger l'écran (`js/nav.js`, partagé par les 3 dashboards).
- **Liaison Google Sheets bidirectionnelle** (`config.js` + `js/sync.js` + `google-apps-script/Code.gs`) : lecture ET écriture, contrairement à une simple exportation. File d'attente locale résiliente en cas de coupure réseau.
- Nouveau logo intégré (écran de connexion, topbars, icônes d'app, favicon).
- Fonctionne hors-ligne une fois ouvert une première fois (Service Worker) et s'installe comme une app.

**À savoir avant de partir en production (voir section 9) :**
- La synchronisation est de type **"instantané complet, le dernier envoi gagne"** : à chaque sauvegarde, l'app renvoie tout son état au Sheet. C'est volontairement simple et fiable (pas de fusion ligne par ligne qui peut mal tourner), mais si deux personnes modifient des données **exactement en même temps** sur deux appareils sans se resynchroniser entre-temps, la dernière sauvegarde écrase l'autre. Pour l'usage prévu (un admin, quelques superviseurs, des élèves qui ne touchent qu'à leurs propres résultats), ce n'est pas un problème en pratique.
- Tant que `GOOGLE_SHEETS_ENABLED` est à `false` dans `config.js`, l'app reste en mode démo 100% local — utile pour tester sans rien connecter.
- Pas de chiffrement des mots de passe (ils transitent et sont stockés en clair dans le Sheet) — à corriger si tu passes un jour sur un vrai backend applicatif (Firebase/Supabase, voir section 10).
- Les 50 avatars ont été découpés automatiquement depuis ton image "NEXIONE Avatar Catalog" — vérifie leur cadrage et remplace-les si tu obtiens des exports individuels de meilleure qualité.
- Les icônes de trophées/manette sont des créations SVG originales dans le style NEXI (pas des reproductions des photos que tu avais envoyées, potentiellement protégées).

---

## 2. Structure des fichiers

```
nexione/
├── index.html, admin.html, child.html, supervisor.html
├── config.js                    → ⚙️ SEUL fichier à modifier pour connecter Google Sheets
├── manifest.json / service-worker.js
├── css/style.css
├── js/
│   ├── store.js                  → Couche de données + bootstrap() (pull) + push vers Sheets
│   ├── sync.js                    → File d'attente résiliente vers l'Apps Script
│   ├── nav.js                      → Navigation "pages empilées" partagée (3 dashboards)
│   ├── icons.js                     → Icônes SVG (trophée, médaille, manette, boussole...)
│   ├── utils.js                      → Fonctions pures (CSV, scores, overlay de chargement...)
│   ├── auth.js / admin.js / child.js / supervisor.js / bot.js / sw-register.js
├── google-apps-script/
│   └── Code.gs                  → Backend complet (lecture + écriture) à coller dans ton Sheet
└── assets/
    ├── nexi-logo-full.png, nexi-mark.png, favicon.png  → Nouveau logo, partout dans l'app
    ├── icons/                    → Icônes PWA (générées depuis le vrai logo)
    └── avatars/                  → Les 50 avatars enfants
```

---

## 3. Lancer le projet dans VS Code (en local)

### Option A — Extension "Live Server"
Ouvre le dossier dans VS Code, installe l'extension **Live Server**, clic droit sur `index.html` → **"Open with Live Server"**.

### Option B — Terminal
```bash
python3 -m http.server 5500
# ou : npx serve .
```
Puis ouvre `http://localhost:5500`.

**Comptes de démonstration** (masqués automatiquement une fois Google Sheets connecté) :
| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin` | `admin123` |
| Superviseur (Collège Imara) | `kasongo` | `sup123` |
| Élève | `grace_m` | `grace123` |

---

## 4. Connecter Google Sheets (le Sheet devient la vraie base de données)

### Étape 1 — Crée le Google Sheet
Va sur [sheets.google.com](https://sheets.google.com), crée une feuille vide (ex : "NEXIONE — Données").

### Étape 2 — Colle le script serveur
1. `Extensions > Apps Script` dans ce Sheet.
2. Supprime le code d'exemple, colle **tout le contenu** de `google-apps-script/Code.gs`.
3. Remplace `var APP_SECRET = "change-moi";` par un mot de passe que toi seul connais.
4. Enregistre.

### Étape 3 — Déploie comme Application Web
1. **Déployer > Nouveau déploiement > Application Web**.
2. "Exécuter en tant que" : **Moi**. "Qui a accès" : **Tout le monde**.
3. **Déployer**, autorise les permissions, copie l'**URL de déploiement** (finit par `/exec`).

### Étape 4 — Configure `config.js`
```js
window.NEXI_CONFIG = {
  GOOGLE_SHEETS_ENABLED: true,
  APPS_SCRIPT_URL: "COLLE_TON_URL_ICI",
  APP_SECRET: "LE_MEME_MOT_DE_PASSE",
  SHEET_LABEL: "NEXIONE — Données"
};
```
Redéploie le site (nouveau glisser-déposer Netlify, ou `git push`).

### Étape 5 — Vérifie
Admin → Réglages → le bloc "Liaison Google Sheet" doit afficher **Connecté**. Clique **"Tester la connexion"**. Crée un enfant : un onglet **"NexiOne_État"** apparaît automatiquement dans ton Sheet (c'est la vraie base de données, format JSON — ne le modifie pas à la main), et des onglets **lisibles** ("Enfants", "Établissements", "ResultatsDefis", "ResultatsAffinites") se régénèrent à chaque sauvegarde pour tes propres analyses (tableaux croisés dynamiques, Looker Studio...).

**Preuve du multi-appareil :** connecte-toi depuis un deuxième téléphone/navigateur avec un compte créé sur le premier — ça doit marcher directement, sans rien réinstaller. Si ce n'est pas le cas, vérifie que les DEUX appareils ont bien le même `config.js` déployé (même URL, même secret) et une connexion internet active au moment de l'ouverture de l'app.

---

## 5-6. Déploiement (Netlify / GitHub Pages)

**Netlify (rapide) :** glisse-dépose le dossier `nexione` complet sur [netlify.com](https://www.netlify.com) (Deploy manually). Pour les mises à jour futures (ex. après avoir modifié `config.js`), relance un glisser-déposer ou connecte le dépôt GitHub.

**GitHub Pages :**
```bash
git init && git add . && git commit -m "NEXIONE"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/nexione.git
git push -u origin main
```
Puis `Settings > Pages > Source` → branche `main`, dossier `/ (root)`.

---

## 7. Navigation, Nexi Bot et classes

**Pages empilées :** chaque dashboard démarre sur un écran d'accueil avec uniquement une grille de tuiles. Cliquer une tuile ouvre SA page en plein écran (bouton retour en haut à gauche) — jamais deux sections empilées à l'écran en même temps.

**Nexi Bot :** flotte en haut à droite, en permanence visible mais discret (58px replié). Il réagit à chaque action de l'espace Enfant par un simple pulse (petite pastille orange) — jamais une bulle qui s'ouvre toute seule. Cliquer sur le bot révèle le message en attente ; un second clic le referme. Pendant un défi, une réponse juste/fausse déclenche aussi ce pulse discret plutôt qu'un pop-up par question.

**Classes RDC :** chaque enfant est rattaché à une classe officielle (1ère primaire → 6ème Humanités/Terminale, `js/store.js` → `CLASS_LEVELS_GROUPED`). Un défi ou test d'affinité peut être ciblé sur une ou plusieurs classes — sans sélection, il est visible par toutes. Deux banques d'affinité livrées et déjà chargées : `content/banque_affinites_generale_50.csv` (50 items, toutes classes) et `content/banque_affinites_6e_humanites_terminale_25.csv` (25 items, ciblée Terminale).

---

## 8. Comment j'ai testé avant de te livrer le code

Sept suites de tests automatisés (navigateur réel, Playwright), toutes vertes :
- Parcours complet des 3 rôles (admin/superviseur/élève), création de compte, défi, affinité.
- Domaines personnalisés, semaines de défi, profils d'apprentissage (provisoire/mensuel/cumulé) visibles admin + superviseur + enfant.
- Les deux banques d'affinité (50 + 25) : import CSV réel, ciblage par classe vérifié (un élève de 1ère primaire ne voit **pas** la banque réservée à la Terminale).
- Navigation en pages empilées : tuiles cachées pendant qu'une page est ouverte, bouton retour fonctionnel, sur les 3 dashboards.
- Comportement du Nexi Bot : aucune bulle ne s'ouvre automatiquement à la navigation (juste un pulse), un clic volontaire révèle bien le message.
- **Le test le plus important : synchronisation croisée.** Deux navigateurs complètement indépendants (aucune donnée partagée, comme deux téléphones différents) pointés vers un faux serveur Google Sheets. Un compte créé sur le "Téléphone A" se connecte avec succès sur le "Téléphone B" — preuve directe que le compte ne dépend plus d'un appareil. Un résultat de défi fait sur B apparaît ensuite quand A réouvre l'app.

Bugs réels trouvés et corrigés pendant cette passe :
- `bootstrap()` (rechargement depuis le Sheet) n'était appelé qu'à la connexion, jamais sur les dashboards eux-mêmes — c'était la cause du bug que tu as signalé.
- La bannière hors-ligne avait une condition qui l'empêchait de jamais s'afficher.
- Le bot manipulait une classe CSS (`.collapsed`) qui ne correspondait à rien dans le CSS réel (`.expanded`) — son affichage était cassé depuis le début.
- L'écran d'accueil affichait un panel par défaut EN PLUS de la grille de tuiles (résidu de l'ancien HTML), créant la "surcharge écran" — corrigé sur les 3 dashboards.
- Le nom du compte admin de démo ("ADEM (Administrateur)") débordait et cassait la mise en page du bandeau sur mobile — raccourci, et la fonction qui calcule les initiales de l'avatar est maintenant robuste face à la ponctuation.

---

## 9. Limites à connaître

- Synchronisation "dernier envoi gagne" (voir section 1) — pas de fusion fine en cas de modification strictement simultanée sur deux appareils.
- Pas de chiffrement des mots de passe.
- L'app doit avoir du réseau au moment de l'ouverture pour être à jour ; sans réseau, elle continue de fonctionner sur la dernière copie locale connue et rattrape la synchronisation dès que la connexion revient.

## 10. Brancher un vrai backend plus tard (Firebase / Supabase)

Toute l'app ne parle qu'à `NexiStore` (`js/store.js`). Pour un vrai backend applicatif : garde les mêmes noms de fonctions, remplace leur contenu par des appels à ton SDK. `js/sync.js` peut rester en parallèle comme simple couche de reporting vers Sheets si tu veux garder ça pour l'orientation.

## 11. Réinitialiser les données de démonstration

Panel Admin → Réglages → **"Réinitialiser les données de démo"** — ne touche qu'au cache local, pas aux données déjà envoyées au Sheet.
