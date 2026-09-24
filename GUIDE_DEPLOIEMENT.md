# Guide de déploiement — Nexi Lab

Ce guide t'emmène de zéro jusqu'à une application en ligne, sécurisée,
avec un backend Google Sheets synchronisé sur tous les appareils.

Trois étapes : **① Google Sheets + Apps Script → ② Vercel → ③ premiers réglages**

---

## ⚠️ Ce qui a été testé, et ce qui ne pouvait pas l'être ici

- ✅ **Testé et validé automatiquement** : toute la logique de jeu (calcul des
  NX de donjon, résultat des cartes Nexify, garde-fou de solde, niveaux,
  **répartition automatique des nouveaux joueurs entre feuilles-shards**) —
  voir `test/logic-core.test.js`, exécutable avec `npm test`. La copie de
  cette logique dans `Code.gs` (Apps Script ne peut pas importer un fichier
  JS externe) a été comparée automatiquement à l'original : résultats
  identiques (front ET back).
- ✅ **Vérifié** : syntaxe JavaScript de tous les fichiers (front, proxy,
  Apps Script) — aucune erreur.
- ✅ **Corrigé depuis la v1** : les mises à jour de solde NX (donjons, Nexify)
  sont maintenant protégées par un verrou (`LockService`) — deux requêtes
  simultanées du même joueur ne peuvent plus corrompre son solde.
- ❌ **Non testable depuis cet environnement** : l'exécution réelle contre
  ton compte Google (Sheets + Apps Script, avec plusieurs feuilles-shards)
  et ton déploiement Vercel, car cela nécessite tes propres identifiants et
  un accès réseau que cet environnement de développement n'a pas. La
  section **Checklist de test** en bas de ce guide te permet de le
  vérifier toi-même, étape par étape.

---

## ① Google Sheets + Apps Script (le "cerveau" de données)

Nexi Lab répartit les joueurs sur plusieurs Google Sheets (20 joueurs par
feuille par défaut) pour rester confortablement sous les quotas gratuits de
Google. **Une seule feuille suffit pour démarrer** (jusqu'à 20 joueurs) ;
tu en ajouteras d'autres depuis le panel admin, sans jamais retoucher au
code, quand tu approcheras de la limite.

1. Va sur [sheets.google.com](https://sheets.google.com) et crée une
   feuille vide. Renomme-la par exemple **"Nexi Lab — Registre"**.
   C'est ta feuille principale : elle contient le contenu partagé (donjons,
   cartes, faits) ET sert de "shard 1" pour tes 20 premiers joueurs.
2. Menu **Extensions → Apps Script**. Un nouvel onglet s'ouvre.
3. Supprime le contenu par défaut de `Code.gs` et colle-y **tout** le
   contenu du fichier `google-apps-script/Code.gs` fourni dans ce projet.
4. En haut, clique sur **Enregistrer** (icône disquette).
5. Dans le menu déroulant des fonctions (à côté du bouton ▶ Exécuter),
   choisis **`setupNexiLab`**, puis clique sur **Exécuter**.
   - La première fois, Google demande des autorisations : accepte-les
     (c'est ton propre script, sur ta propre feuille).
   - Cela crée automatiquement tous les onglets nécessaires et enregistre
     cette feuille comme "shard1".
6. Ouvre **Affichage → Journaux d'exécution** (ou `Ctrl+Enter`). Tu y
   verras les infos importantes :
   - `SHARED_SECRET à copier dans GAS_SHARED_SECRET (Vercel) : ...`
     → **copie cette valeur**, tu en auras besoin à l'étape ②.
   - `Identifiant admin initial : admin / ChangeMoi123!`
     → note-le, tu changeras ce mot de passe dès ta première connexion.
7. Clique sur **Déployer → Nouveau déploiement**.
   - Type : **Application Web**.
   - Exécuter en tant que : **Moi**.
   - Qui a accès : **Tout le monde**.
   - Clique **Déployer**, autorise à nouveau si demandé.
8. Copie l'**URL de l'application Web** obtenue (elle se termine par
   `/exec`). C'est ton `GAS_WEBAPP_URL`.

> Si tu modifies `Code.gs` plus tard, il faut créer un **nouveau
> déploiement** (ou gérer les déploiements → modifier celui existant)
> pour que les changements soient pris en compte.

### Ajouter un shard (feuille-joueurs) supplémentaire — quand nécessaire

Fais-le uniquement quand un shard approche 20 joueurs (l'onglet **Shards**
du panel admin te montre la charge de chacun) :

1. Crée une nouvelle Google Sheet **vide** (elle n'a pas besoin d'Apps
   Script — une seule copie du script, sur le Registre, gère tous les shards).
2. **Partage-la en modification** avec le compte Google qui exécute le
   script (celui utilisé à l'étape ①.1 — en général ton propre compte).
3. Copie son identifiant depuis l'URL : `https://docs.google.com/spreadsheets/d/`**`IDENTIFIANT`**`/edit`.
4. Dans le panel admin → onglet **Shards**, colle cet identifiant et donne
   un libellé (ex. "Shard 2"), puis **Enregistrer ce shard**. Les onglets
   `Users` et `DungeonAttempts` y sont créés automatiquement.
5. Ce shard apparaît désormais dans la liste déroulante lors de la
   création d'un nouveau Nexian.

Ton équipe peut répéter cette étape autant de fois que nécessaire —
25 shards × 20 joueurs = 500 comptes, sans changer d'infrastructure.

---

## ② Déploiement sur Vercel

1. Sur [vercel.com](https://vercel.com), crée un compte (gratuit) si tu
   n'en as pas, puis **Add New → Project**.
2. Importe ce dossier `nexi-lab` (pousse-le d'abord sur un dépôt GitHub,
   ou utilise `vercel` en ligne de commande depuis VS Code — voir
   `README.md`).
3. Avant le premier déploiement, va dans **Settings → Environment
   Variables** et ajoute :
   | Nom | Valeur |
   |---|---|
   | `GAS_WEBAPP_URL` | l'URL `/exec` copiée à l'étape ①.8 |
   | `GAS_SHARED_SECRET` | le `SHARED_SECRET` copié à l'étape ①.6 |
4. Lance le déploiement. Vercel te donne une URL du type
   `https://nexi-lab.vercel.app`.
5. Ouvre cette URL sur ton téléphone : après quelques secondes, une
   bannière **"Installer Nexi Lab"** doit apparaître (Android/desktop
   Chrome). Sur iPhone (Safari), l'installation se fait via
   **Partager → Sur l'écran d'accueil** (Apple ne propose pas de bannière
   automatique, c'est une limite d'iOS et non de l'application).

---

## ③ Premiers réglages

### Accès administrateur (caché, aucun lien visible)

Pour rester sobre et professionnel, l'écran de connexion ne comporte plus
aucun bouton ni lien "Accès administrateur". Deux façons discrètes d'y
accéder :

- **Tapote 5 fois rapidement sur le logo** (le cercle moléculaire, en haut
  de l'écran de connexion), en moins de 1,5 seconde. Le sous-titre passe en
  doré ("Espace administrateur") : le formulaire attend maintenant tes
  identifiants admin. Retape 5 fois pour repasser en mode joueur normal.
- **Ou** ouvre directement `https://ton-app.vercel.app/index.html?admin=1`
  — pratique à mettre dans tes favoris personnels, puisque personne ne le
  devine sans le connaître.

1. Utilise l'une de ces deux méthodes, puis connecte-toi avec
   `admin` / `ChangeMoi123!`.
2. Va dans **Réglages** et **change immédiatement ce mot de passe**.
3. Onglet **Nexians** : crée tes premiers comptes joueurs (identifiant +
   mot de passe que tu communiques toi-même à chacun). Le shard est choisi
   automatiquement (ou manuellement si tu préfères). Renseigne le moyen de
   paiement et la référence de transaction si le joueur a déjà payé — ce
   suivi est manuel (pas d'intégration Mobile Money automatique pour
   l'instant, voir "Limites connues" plus bas).
4. Onglet **Donjons** : crée un premier défi (au moins une question),
   puis clique **Publier** pour le rendre visible aux joueurs.
5. Onglet **Nexify** et **Cartes** : ajoute quelques cartes pour tester —
   ou utilise **"Importer en masse"** pour coller plusieurs cartes ou faits
   d'un coup (une ligne par carte, `recto;réponse;explication`).
6. Onglet **Faits** : ajoute 2-3 entrées "Le saviez-vous" (import en masse
   disponible aussi, une ligne = un fait).
7. Onglet **Stats** : à revisiter régulièrement — c'est ton tableau de
   bord de traction (joueurs actifs, connexions 7 jours, défis complétés,
   NX en circulation) pour un dossier de concours ou d'investissement.

---

## ✅ Checklist de test de bout en bout (à faire une fois, ~15-20 min)

- [ ] Connexion admin fonctionne, changement de mot de passe pris en compte
- [ ] Création d'un Nexian → connexion avec son identifiant/mot de passe
- [ ] Le Nexian démarre bien à 100 NX (ou la valeur définie)
- [ ] Choix d'un avatar → persiste après rafraîchissement de la page
- [ ] Un donjon publié apparaît côté joueur ; non publié, il reste invisible
- [ ] Répondre correctement à un donjon crédite les NX attendus ; le
      refaire le même jour est bloqué ("déjà relevé aujourd'hui")
- [ ] Une carte Nexify : mise + bonne réponse multiplie le solde ; mauvaise
      réponse fait perdre exactement la mise
- [ ] Le classement général affiche l'identifiant, jamais le nom réel
- [ ] Suspendre l'abonnement d'un Nexian → sa connexion est refusée avec un
      message clair, sans jargon technique
- [ ] Couper le Wi-Fi puis rouvrir l'app → message "connexion instable",
      jamais d'erreur technique brute
- [ ] F12 → onglet Réseau : seule une requête vers `/api/proxy` apparaît,
      jamais l'URL Google Apps Script ni le secret
- [ ] F12 → onglet Sources : le code est lisible (JS front normal), mais
      aucun mot de passe, secret ou URL sensible n'y figure en clair
- [ ] Sur mobile, la bannière/le menu d'installation PWA fonctionne
- [ ] L'onglet **Shards** affiche "Shard 1" avec sa charge (X/20) juste
      après l'installation
- [ ] Ajouter un 2ᵉ shard (feuille vide + partage + collage de l'ID) le
      fait apparaître dans la liste, et un nouveau Nexian peut y être
      assigné (manuellement ou automatiquement une fois le 1er plein)
- [ ] Deux clics rapides sur "Jouer" un même donjon (double-tap accidentel)
      ne créditent les NX qu'une seule fois
- [ ] L'import en masse d'une liste de cartes de révision (3-4 lignes)
      crée bien les cartes correspondantes, catégorie correcte
- [ ] L'onglet **Stats** affiche des nombres cohérents avec les tests
      effectués (joueurs, connexions, défis, NX)

Si une étape échoue, regarde d'abord **Apps Script → Exécutions** (menu de
gauche dans l'éditeur) : les erreurs y sont journalisées en détail, même si
le joueur ne les voit jamais.

---

## Limites connues à améliorer ensuite

- **Paiement encore manuel** : les champs moyen de paiement / référence /
  date de fin d'abonnement sont saisis à la main par l'admin après
  réception d'un paiement Mobile Money (Orange Money, Airtel Money...).
  Aucune intégration automatique n'est branchée — cela nécessite un compte
  marchand et des identifiants API que je n'ai pas et que toi seul peux
  souscrire. C'est l'étape logique suivante une fois que le volume de
  joueurs rend la saisie manuelle trop lourde.
- **Classement général** : avec beaucoup de shards (proche de 25), le
  calcul du classement lit chaque feuille l'une après l'autre — ça reste
  rapide à cette échelle, mais si tu vises un jour bien plus que 500
  joueurs, il faudra migrer vers une vraie base de données.
- **Un seul compte administrateur** est géré (conforme au besoin exprimé :
  "moi, l'administrateur"). Pour que ton équipe ait des accès distincts,
  il faudrait transformer `ADMIN_*` en un onglet `Admins` dédié — dis-moi
  si tu veux que je l'ajoute.
- Les icônes sont fournies en SVG (fonctionnent sur Android/desktop). Pour
  une icône parfaite sur iOS, convertis `icons/logo-nexilab.svg` en PNG
  192×192 et 512×512 (par ex. via [cloudconvert.com](https://cloudconvert.com)
  ou `npx pwa-asset-generator`) et mets à jour `manifest.json` +
  `apple-touch-icon` dans `index.html`.
- Le mode hors-ligne ne met en cache que l'habillage de l'app (HTML/CSS/JS) :
  toute donnée de jeu nécessite une connexion, par choix, pour éviter des
  scores désynchronisés entre appareils.
