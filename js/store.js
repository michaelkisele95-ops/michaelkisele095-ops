/* ============================================================
   NEXIONE — store.js
   Couche de données. Aujourd'hui : localStorage (démo mono-appareil).
   Demain : remplacer StoreImpl par des appels Firebase/Supabase
   en gardant exactement la même API (voir README.md, section "Brancher un vrai backend").
   ============================================================ */

(function (global) {
  "use strict";

  var DB_KEY = "nexione_db_v1";
  var SESSION_KEY = "nexione_session_v1";

  var AXES = [
    { id: "creatif_analytique", pos: "Créatif", neg: "Analytique" },
    { id: "collab_autonome", pos: "Collaboratif", neg: "Autonome" },
    { id: "theorique_applique", pos: "Théorique", neg: "Appliqué" },
    { id: "leadership_support", pos: "Leadership", neg: "Support opérationnel" },
    { id: "techno_manuel", pos: "Techno / Numérique", neg: "Manuel / Artisanal" },
    { id: "innovation_optim", pos: "Innovation", neg: "Optimisation" }
  ];

  // Domaines alignés sur le programme de l'Éducation Nationale en RDC.
  // "Autre" permet à l'admin de saisir un domaine personnalisé question par question.
  var CATEGORIES = [
    "Mathématiques",
    "Français",
    "Sciences (SVT)",
    "Physique-Chimie (SPC)",
    "Histoire-Géographie",
    "Anglais",
    "Éducation civique et morale",
    "Culture générale"
  ];

  // Classes officielles RDC, de la 1ère primaire à la dernière année des Humanités.
  // Utilisé pour la fiche enfant, les suggestions du superviseur, et pour cibler
  // un défi ou un test d'affinité sur une ou plusieurs classes précises.
  var CLASS_LEVELS_GROUPED = [
    { group: "Primaire", classes: ["1ère primaire", "2ème primaire", "3ème primaire", "4ème primaire", "5ème primaire", "6ème primaire"] },
    { group: "Secondaire — Cycle d'orientation", classes: ["7ème CO", "8ème CO"] },
    { group: "Secondaire — Humanités", classes: ["3ème Humanités", "4ème Humanités", "5ème Humanités", "6ème Humanités (Terminale)"] }
  ];
  var CLASS_LEVELS = CLASS_LEVELS_GROUPED.reduce(function (acc, g) { return acc.concat(g.classes); }, []);

  // 50 avatars enfants (voir assets/avatars/avatar_01.png ... avatar_50.png)
  var AVATAR_IDS = [];
  for (var _ai = 1; _ai <= 50; _ai++) AVATAR_IDS.push("avatar_" + (_ai < 10 ? "0" + _ai : _ai));

  function avatarUrl(avatarId) {
    if (!avatarId) return "assets/avatars/avatar_01.png";
    if (avatarId.indexOf("avatar_") === 0) return "assets/avatars/" + avatarId + ".png";
    return null; // ancienne valeur emoji (compat) — le rendu gère le repli
  }

  function randomAvatarId() {
    return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
  }

  // Libellé de la semaine ISO courante, pour les défis hebdomadaires.
  function currentWeekLabel(d) {
    d = d ? new Date(d) : new Date();
    var day = (d.getDay() + 6) % 7; // lundi = 0
    var monday = new Date(d); monday.setDate(d.getDate() - day);
    var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    var fmt = function (x) { return String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0"); };
    return "Semaine du " + fmt(monday) + " au " + fmt(sunday) + "/" + sunday.getFullYear();
  }

  function currentYearMonth(d) {
    d = d ? new Date(d) : new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function monthLabelFR(yearMonth) {
    var parts = yearMonth.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }

  // Notifie la couche de synchronisation Google Sheets si elle est chargée (js/sync.js).
  // Sans effet en mode démo (config.js: GOOGLE_SHEETS_ENABLED = false).
  // v2 : chaque mutation programme un envoi de l'état COMPLET (voir saveRaw ci-dessous) —
  // plus fiable qu'un envoi événement par événement, qui pouvait silencieusement rater.
  function scheduleRemoteSync() {
    try {
      if (global.NexiSync && typeof global.NexiSync.schedulePush === "function") {
        global.NexiSync.schedulePush();
      }
    } catch (e) { console.warn("NexiSync indisponible :", e); }
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function nowISO() { return new Date().toISOString(); }

  function loadRaw() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error("NEXIONE store: lecture impossible", e);
      return null;
    }
  }

  // Écrit en cache local SANS déclencher de synchronisation — utilisé uniquement
  // quand on vient de recevoir l'état depuis le Sheet (bootstrap), pour éviter
  // de repousser inutilement ce qu'on vient tout juste de recevoir.
  function writeLocalOnly(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error("NEXIONE store: écriture impossible", e);
      return false;
    }
  }

  // Écrit en cache local ET programme l'envoi de l'état complet vers Google
  // Sheets (si connecté). Utilisé par TOUTES les fonctions de mutation.
  function saveRaw(db) {
    var ok = writeLocalOnly(db);
    if (ok) scheduleRemoteSync();
    return ok;
  }

  function seedDB() {
    var childId1 = uid("child");
    var childId2 = uid("child");
    var childId3 = uid("child");
    var estId = uid("etab");
    var supId = uid("sup");
    var chalId = uid("chal");
    var affId = uid("aff");

    var db = {
      version: 1,
      users: [
        {
          id: "admin_root",
          role: "admin",
          displayName: "ADEM",
          identifiant: "admin",
          password: "admin123",
          createdAt: nowISO(),
          blocked: false
        },
        {
          id: supId,
          role: "supervisor",
          displayName: "Préfet Kasongo",
          identifiant: "kasongo",
          password: "sup123",
          establishmentId: estId,
          createdAt: nowISO(),
          blocked: false
        },
        {
          id: childId1,
          role: "child",
          displayName: "Grace Mwamba",
          identifiant: "grace_m",
          password: "grace123",
          avatar: "avatar_04",
          theme: "blue",
          establishmentId: estId,
          classe: "5ème primaire",
          createdAt: nowISO(),
          blocked: false
        },
        {
          id: childId2,
          role: "child",
          displayName: "Joseph Ilunga",
          identifiant: "joseph_i",
          password: "joseph123",
          avatar: "avatar_05",
          theme: "amber",
          establishmentId: estId,
          classe: "5ème primaire",
          createdAt: nowISO(),
          blocked: false
        },
        {
          id: childId3,
          role: "child",
          displayName: "Aline Kabeya",
          identifiant: "aline_k",
          password: "aline123",
          avatar: "avatar_11",
          theme: "green",
          establishmentId: null,
          classe: "6ème Humanités (Terminale)",
          createdAt: nowISO(),
          blocked: false
        }
      ],
      establishments: [
        { id: estId, name: "Collège Imara", supervisorId: supId, maxStudents: 50 }
      ],
      pendingStudents: [],
      challenges: [
        {
          id: chalId,
          type: "challenge",
          title: "Défi de la semaine — Rentrée NEXI",
          description: "Un échauffement multi-domaines pour bien démarrer l'année NEXI Académie.",
          week: currentWeekLabel(),
          visible: true,
          published: true,
          publishAt: null,
          createdAt: nowISO(),
          questions: [
            {
              id: uid("q"),
              text: "Combien font 7 × 8 ?",
              category: "Mathématiques",
              options: ["54", "56", "58", "64"],
              correct: [1],
              multi: false,
              time: 20
            },
            {
              id: uid("q"),
              text: "Quelle est la capitale de la RD Congo ?",
              category: "Histoire-Géographie",
              options: ["Lubumbashi", "Kolwezi", "Kinshasa", "Goma"],
              correct: [2],
              multi: false,
              time: 20
            },
            {
              id: uid("q"),
              text: "Complète la suite : 2, 4, 8, 16, __",
              category: "Mathématiques",
              options: ["18", "24", "32", "20"],
              correct: [2],
              multi: false,
              time: 25
            },
            {
              id: uid("q"),
              text: "Quel est le pluriel correct de « un cheval » ?",
              category: "Français",
              options: ["des chevals", "des chevaux", "des chevales", "des cheveaux"],
              correct: [1],
              multi: false,
              time: 20
            },
            {
              id: uid("q"),
              text: "Quel organe pompe le sang dans le corps humain ?",
              category: "Sciences (SVT)",
              options: ["Le foie", "Le cœur", "Le poumon", "Le rein"],
              correct: [1],
              multi: false,
              time: 20
            }
          ],
          attempts: {}
        }
      ],
      affinities: [
        {
          id: affId,
          type: "affinity",
          title: "Nexi d'affinité — Banque générale (50 items)",
          description: "Questionnaire de préférences couvrant les 6 axes. Aucune bonne ou mauvaise réponse. Visible par toutes les classes.",
          visible: true,
          published: true,
          publishAt: null,
          targetClasses: [],
          createdAt: nowISO(),
          questions: [
            { id: uid('q'), text: 'J\'aime inventer des histoires ou imaginer des solutions originales.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère dessiner, composer ou créer quelque chose de nouveau plutôt que suivre un modèle.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je trouve facilement plusieurs façons différentes de résoudre un même problème.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'J\'aime décortiquer un problème étape par étape avant d\'agir.', axis: 'creatif_analytique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je me sens à l\'aise quand je dois comparer des chiffres ou des données pour prendre une décision.', axis: 'creatif_analytique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je préfère suivre une méthode précise plutôt que d\'improviser.', axis: 'creatif_analytique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je passe facilement du temps à imaginer « et si... » sans me soucier si c\'est réaliste.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je vérifie toujours la logique de mon raisonnement avant de conclure.', axis: 'creatif_analytique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'On me dit souvent que j\'ai des idées originales.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je travaille mieux en équipe, en échangeant les idées avec les autres.', axis: 'collab_autonome', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère avancer seul(e), à mon propre rythme, sans dépendre des autres.', axis: 'collab_autonome', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime organiser des activités de groupe et faire participer tout le monde.', axis: 'collab_autonome', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je me sens plus efficace quand je gère mes tâches sans qu\'on me surveille.', axis: 'collab_autonome', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Discuter avec d\'autres m\'aide à mieux comprendre un sujet.', axis: 'collab_autonome', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je termine plus vite un travail si je le fais moi-même plutôt qu\'en groupe.', axis: 'collab_autonome', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime partager mes réussites et mes difficultés avec les autres.', axis: 'collab_autonome', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère prendre mes propres décisions sans attendre l\'avis des autres.', axis: 'collab_autonome', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime comprendre le « pourquoi » derrière une règle ou un principe.', axis: 'theorique_applique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère apprendre en manipulant, en testant, en pratiquant directement.', axis: 'theorique_applique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Lire une explication détaillée m\'intéresse plus que de foncer directement à l\'action.', axis: 'theorique_applique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je retiens mieux quand je fais un exercice concret plutôt qu\'une leçon théorique.', axis: 'theorique_applique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime discuter d\'idées abstraites, même sans application immédiate.', axis: 'theorique_applique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère un travail manuel ou pratique à une longue explication.', axis: 'theorique_applique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je me pose souvent des questions sur le fonctionnement général des choses.', axis: 'theorique_applique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère apprendre en observant un exemple concret plutôt qu\'une définition.', axis: 'theorique_applique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je prends naturellement la tête d\'un groupe pour organiser une tâche.', axis: 'leadership_support', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère exécuter une tâche précise plutôt que diriger le groupe.', axis: 'leadership_support', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je me sens à l\'aise pour donner des consignes aux autres.', axis: 'leadership_support', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'J\'aime apporter une aide concrète en coulisses, sans être devant.', axis: 'leadership_support', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je prends facilement des décisions pour le groupe quand il faut avancer.', axis: 'leadership_support', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère qu\'on me confie une mission claire plutôt que de décider pour tout le monde.', axis: 'leadership_support', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Motiver les autres à avancer me donne de l\'énergie.', axis: 'leadership_support', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je suis plus efficace en soutenant quelqu\'un d\'autre qui dirige.', axis: 'leadership_support', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime utiliser des outils numériques (ordinateur, tablette, applications) pour apprendre ou créer.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère travailler de mes mains : construire, réparer, fabriquer.', axis: 'techno_manuel', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je suis curieux(se) de comprendre comment fonctionnent les nouvelles technologies.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'J\'aime les activités où je peux toucher, assembler ou bricoler concrètement.', axis: 'techno_manuel', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je passe volontiers du temps à explorer un logiciel, une application ou un jeu numérique.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère une activité où je travaille avec mes mains plutôt qu\'avec un écran.', axis: 'techno_manuel', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime apprendre à coder ou à utiliser de nouveaux outils numériques.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je trouve satisfaction à fabriquer ou réparer un objet moi-même.', axis: 'techno_manuel', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je m\'adapte vite à un nouvel outil numérique.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'J\'aime imaginer quelque chose de complètement nouveau plutôt que d\'améliorer l\'existant.', axis: 'innovation_optim', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère perfectionner et rendre plus efficace ce qui existe déjà.', axis: 'innovation_optim', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Prendre des risques pour essayer une idée neuve ne me fait pas peur.', axis: 'innovation_optim', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère une solution éprouvée et fiable à une idée non testée.', axis: 'innovation_optim', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime remettre en question la façon habituelle de faire les choses.', axis: 'innovation_optim', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je cherche toujours à réduire le gaspillage de temps ou de ressources dans une tâche.', axis: 'innovation_optim', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je suis motivé(e) à l\'idée de créer quelque chose qui n\'existe pas encore.', axis: 'innovation_optim', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'J\'aime organiser et optimiser un planning ou une méthode pour qu\'elle soit plus efficace.', axis: 'innovation_optim', direction: 'neg', time: 15 }
          ],
          attempts: {}
        },
        {
          id: uid("aff"),
          type: "affinity",
          title: "Nexi d'affinité — Orientation Terminale (25 items)",
          description: "Version adaptée à la 6ème Humanités : vocabulaire et situations tournés vers le choix d'études supérieures et de métier.",
          visible: true,
          published: true,
          publishAt: null,
          targetClasses: ["6ème Humanités (Terminale)"],
          createdAt: nowISO(),
          questions: [
            { id: uid('q'), text: 'Face à un problème complexe, j\'aime d\'abord imaginer plusieurs pistes originales avant de choisir.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère décomposer un problème en données précises et en tirer une conclusion logique.', axis: 'creatif_analytique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je pourrais facilement m\'orienter vers un domaine créatif ou de conception (design, communication, arts).', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Un métier basé sur l\'analyse de données, de statistiques ou de faits m\'attire plus qu\'un métier créatif.', axis: 'creatif_analytique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aime remettre en question les idées reçues et proposer une vision différente.', axis: 'creatif_analytique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je m\'imagine bien dans une filière ou un métier où l\'on travaille constamment en équipe (projet collectif, entreprise, ONG).', axis: 'collab_autonome', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je me projette plutôt dans un parcours où je gère mes propres projets, à mon rythme et selon mes choix.', axis: 'collab_autonome', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Pour préparer mon avenir (université, métier), j\'aime échanger avec d\'autres pour construire mes idées.', axis: 'collab_autonome', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère prendre seul(e) mes grandes décisions d\'orientation, sans trop dépendre des avis extérieurs.', axis: 'collab_autonome', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je suis attiré(e) par des études longues et théoriques (recherche, université, sciences fondamentales).', axis: 'theorique_applique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère une formation professionnalisante où j\'applique vite mes compétences sur le terrain.', axis: 'theorique_applique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Comprendre les grands principes qui expliquent le monde m\'intéresse plus qu\'appliquer une technique précise.', axis: 'theorique_applique', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je m\'épanouis davantage dans un métier concret et pratique que dans un poste centré sur la théorie.', axis: 'theorique_applique', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je me vois porter la responsabilité d\'un projet, d\'une équipe ou d\'une future entreprise.', axis: 'leadership_support', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère apporter une expertise précise au service d\'un projet dirigé par quelqu\'un d\'autre.', axis: 'leadership_support', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Prendre la parole en public pour défendre une idée ou représenter un groupe ne m\'effraie pas.', axis: 'leadership_support', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je suis plus à l\'aise dans un rôle d\'exécution rigoureuse que dans un rôle de décision pour les autres.', axis: 'leadership_support', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je m\'intéresse aux métiers liés au numérique, à l\'informatique ou aux nouvelles technologies pour mon avenir.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je me projette dans un métier manuel, technique ou artisanal (construction, mécanique, artisanat, agriculture).', axis: 'techno_manuel', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je suis curieux(se) des innovations technologiques et de leur impact sur la société congolaise et le monde.', axis: 'techno_manuel', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère un métier où je vois concrètement le résultat de mon travail manuel plutôt qu\'un écran.', axis: 'techno_manuel', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'J\'aimerais un jour créer quelque chose de nouveau : une entreprise, une initiative, un projet inédit.', axis: 'innovation_optim', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je préfère rejoindre une structure existante et l\'aider à mieux fonctionner plutôt que tout créer moi-même.', axis: 'innovation_optim', direction: 'neg', time: 15 },
            { id: uid('q'), text: 'Je suis prêt(e) à prendre des risques dans mon orientation pour poursuivre une voie qui me passionne vraiment.', axis: 'innovation_optim', direction: 'pos', time: 15 },
            { id: uid('q'), text: 'Je privilégie la sécurité et la stabilité d\'un parcours déjà bien établi.', axis: 'innovation_optim', direction: 'neg', time: 15 }
          ],
          attempts: {}
        }
      ],
      settings: {
        appName: "NEXIONE",
        soundEnabled: true
      }
    };
    return db;
  }

  function getDB() {
    var db = loadRaw();
    if (!db) {
      db = seedDB();
      writeLocalOnly(db);
    }
    return db;
  }

  function resetDB() {
    var db = seedDB();
    saveRaw(db);
    return db;
  }

  // Instantané complet de l'état local — c'est exactement ce que sync.js envoie
  // au Sheet à chaque saveRaw(). Enregistré comme "fournisseur" auprès de
  // NexiSync dès que ce fichier se charge (voir tout en bas).
  function fullSnapshot() {
    var db = getDB();
    return {
      users: db.users,
      establishments: db.establishments,
      pendingStudents: db.pendingStudents,
      challenges: db.challenges,
      affinities: db.affinities,
      settings: db.settings
    };
  }

  // Point d'entrée obligatoire au chargement de CHAQUE page (voir auth.js,
  // admin.js, child.js, supervisor.js : tous appellent
  // NexiStore.bootstrap().then(...) avant leur premier rendu).
  //
  // - Mode démo (Sheets désactivé) : résout immédiatement avec le cache local.
  // - Mode connecté : récupère l'état COMPLET depuis le Sheet et remplace le
  //   cache local par cet état — c'est ce qui garantit qu'un compte créé sur
  //   un autre téléphone apparaît ici. Si le Sheet est vide (tout premier
  //   lancement), on y pousse notre état local pour l'initialiser. Si le
  //   réseau est indisponible, on continue avec le cache local existant
  //   (l'app reste utilisable hors-ligne) et on retentera automatiquement.
  function bootstrap() {
    var remoteConfigured = !!(global.NEXI_CONFIG && global.NEXI_CONFIG.GOOGLE_SHEETS_ENABLED);
    if (!remoteConfigured) {
      getDB();
      return Promise.resolve({ ok: true, remote: false });
    }
    if (!global.NexiSync) {
      getDB();
      return Promise.resolve({ ok: true, remote: false, error: "js/sync.js non chargé." });
    }

    return global.NexiSync.pull().then(function (res) {
      if (res.empty) {
        // Le Sheet n'a encore jamais reçu de données : on initialise avec
        // notre état local (ou la démo par défaut) et on le pousse tout de suite.
        getDB();
        global.NexiSync.pushNow();
        return { ok: true, remote: true, seeded: true };
      }
      var remoteDb = res.data || {};
      var merged = {
        version: 1,
        users: remoteDb.users || [],
        establishments: remoteDb.establishments || [],
        pendingStudents: remoteDb.pendingStudents || [],
        challenges: remoteDb.challenges || [],
        affinities: remoteDb.affinities || [],
        settings: remoteDb.settings && Object.keys(remoteDb.settings).length ? remoteDb.settings : { appName: "NEXI ONE", soundEnabled: true }
      };
      writeLocalOnly(merged); // pas de re-push : on vient de recevoir la vérité
      return { ok: true, remote: true };
    }).catch(function (err) {
      // Hors-ligne ou mal configuré : on continue avec ce qu'on a localement.
      getDB();
      return { ok: true, remote: false, offline: true, error: String(err && err.message || err) };
    });
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setSession(userId) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: userId, at: nowISO() }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ---------- API haut niveau (à garder identique si vous branchez un vrai backend) ----------

  var Store = {
    AXES: AXES,
    CATEGORIES: CATEGORIES,
    DOMAINS: CATEGORIES,
    CLASS_LEVELS: CLASS_LEVELS,
    CLASS_LEVELS_GROUPED: CLASS_LEVELS_GROUPED,
    AVATAR_IDS: AVATAR_IDS,
    uid: uid,
    nowISO: nowISO,

    getDB: getDB,
    save: function (db) { return saveRaw(db); },
    resetDB: resetDB,

    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,

    login: function (identifiant, password) {
      var db = getDB();
      identifiant = (identifiant || "").trim().toLowerCase();
      var user = db.users.find(function (u) {
        return u.identifiant.toLowerCase() === identifiant && u.password === password;
      });
      if (!user) return { ok: false, error: "Identifiant ou mot de passe incorrect." };
      if (user.blocked) return { ok: false, error: "Ce compte a été bloqué par l'administrateur." };
      setSession(user.id);
      return { ok: true, user: user };
    },

    logout: function () { clearSession(); },

    currentUser: function () {
      var s = getSession();
      if (!s) return null;
      var db = getDB();
      return db.users.find(function (u) { return u.id === s.userId; }) || null;
    },

    // ---- Utilisateurs / enfants ----
    listChildren: function () { return getDB().users.filter(function (u) { return u.role === "child"; }); },

    addChild: function (data) {
      var db = getDB();
      var idTaken = db.users.some(function (u) { return u.identifiant.toLowerCase() === data.identifiant.toLowerCase(); });
      if (idTaken) return { ok: false, error: "Cet identifiant est déjà utilisé." };
      var child = {
        id: uid("child"),
        role: "child",
        displayName: data.displayName,
        identifiant: data.identifiant,
        password: data.password,
        avatar: randomAvatarId(),
        theme: "blue",
        establishmentId: data.establishmentId || null,
        classe: data.classe || "",
        createdAt: nowISO(),
        blocked: false
      };
      db.users.push(child);
      saveRaw(db);
      return { ok: true, user: child };
    },

    updateUser: function (userId, patch) {
      var db = getDB();
      var u = db.users.find(function (x) { return x.id === userId; });
      if (!u) return { ok: false, error: "Utilisateur introuvable." };
      Object.assign(u, patch);
      saveRaw(db);
      return { ok: true, user: u };
    },

    removeUser: function (userId) {
      var db = getDB();
      db.users = db.users.filter(function (u) { return u.id !== userId; });
      saveRaw(db);
      return { ok: true };
    },

    // ---- Établissements / superviseurs ----
    listEstablishments: function () { return getDB().establishments; },

    addEstablishment: function (data) {
      var db = getDB();
      var idTaken = db.users.some(function (u) { return u.identifiant.toLowerCase() === data.supIdentifiant.toLowerCase(); });
      if (idTaken) return { ok: false, error: "Cet identifiant superviseur est déjà utilisé." };
      var est = { id: uid("etab"), name: data.name, supervisorId: null, maxStudents: Number(data.maxStudents) || 50 };
      var sup = {
        id: uid("sup"),
        role: "supervisor",
        displayName: data.supName,
        identifiant: data.supIdentifiant,
        password: data.supPassword,
        establishmentId: est.id,
        createdAt: nowISO(),
        blocked: false
      };
      est.supervisorId = sup.id;
      db.establishments.push(est);
      db.users.push(sup);
      saveRaw(db);
      return { ok: true, establishment: est, supervisor: sup };
    },

    establishmentFor: function (supervisorUserId) {
      var db = getDB();
      var sup = db.users.find(function (u) { return u.id === supervisorUserId; });
      if (!sup) return null;
      return db.establishments.find(function (e) { return e.id === sup.establishmentId; }) || null;
    },

    studentsOf: function (establishmentId) {
      return getDB().users.filter(function (u) { return u.role === "child" && u.establishmentId === establishmentId; });
    },

    suggestStudent: function (establishmentId, data) {
      var db = getDB();
      db.pendingStudents.push({
        id: uid("req"),
        establishmentId: establishmentId,
        name: data.name,
        classe: data.classe,
        desiredIdentifiant: data.desiredIdentifiant,
        status: "pending",
        createdAt: nowISO()
      });
      saveRaw(db);
      return { ok: true };
    },

    listPendingRequests: function (establishmentId) {
      var db = getDB();
      return db.pendingStudents.filter(function (r) {
        return r.status === "pending" && (!establishmentId || r.establishmentId === establishmentId);
      });
    },

    resolveRequest: function (requestId, action, overrides) {
      var db = getDB();
      var req = db.pendingStudents.find(function (r) { return r.id === requestId; });
      if (!req) return { ok: false, error: "Demande introuvable." };
      if (action === "refuse") {
        req.status = "refused";
        saveRaw(db);
        return { ok: true };
      }
      var name = (overrides && overrides.name) || req.name;
      var classe = (overrides && overrides.classe) || req.classe;
      var identifiant = (overrides && overrides.identifiant) || req.desiredIdentifiant;
      var idTaken = db.users.some(function (u) { return u.identifiant.toLowerCase() === identifiant.toLowerCase(); });
      if (idTaken) return { ok: false, error: "Identifiant déjà utilisé, merci de le modifier." };
      var pwd = Math.random().toString(36).slice(-8);
      var child = {
        id: uid("child"),
        role: "child",
        displayName: name,
        identifiant: identifiant,
        password: pwd,
        avatar: randomAvatarId(),
        theme: "blue",
        establishmentId: req.establishmentId,
        classe: classe,
        createdAt: nowISO(),
        blocked: false
      };
      db.users.push(child);
      req.status = "validated";
      saveRaw(db);
      return { ok: true, user: child, generatedPassword: pwd };
    },

    // ---- Défis & Affinités (fusionnés : "type" = challenge | affinity) ----
    listChallenges: function () { return getDB().challenges; },
    listAffinities: function () { return getDB().affinities; },

    getChallenge: function (id) { return getDB().challenges.find(function (c) { return c.id === id; }); },
    getAffinity: function (id) { return getDB().affinities.find(function (a) { return a.id === id; }); },

    upsertChallenge: function (challenge) {
      var db = getDB();
      if (challenge.id) {
        var idx = db.challenges.findIndex(function (c) { return c.id === challenge.id; });
        if (idx >= 0) { db.challenges[idx] = Object.assign({}, db.challenges[idx], challenge); saveRaw(db); return { ok: true, item: db.challenges[idx] }; }
      }
      challenge.id = uid("chal");
      challenge.type = "challenge";
      challenge.week = challenge.week || currentWeekLabel();
      challenge.targetClasses = challenge.targetClasses || [];
      challenge.createdAt = nowISO();
      challenge.attempts = challenge.attempts || {};
      db.challenges.push(challenge);
      saveRaw(db);
      return { ok: true, item: challenge };
    },

    upsertAffinity: function (aff) {
      var db = getDB();
      if (aff.id) {
        var idx = db.affinities.findIndex(function (a) { return a.id === aff.id; });
        if (idx >= 0) { db.affinities[idx] = Object.assign({}, db.affinities[idx], aff); saveRaw(db); return { ok: true, item: db.affinities[idx] }; }
      }
      aff.id = uid("aff");
      aff.type = "affinity";
      aff.targetClasses = aff.targetClasses || [];
      aff.createdAt = nowISO();
      aff.attempts = aff.attempts || {};
      db.affinities.push(aff);
      saveRaw(db);
      return { ok: true, item: aff };
    },

    // Un défi/test sans classe ciblée (tableau vide) est visible par toutes les classes.
    isVisibleForClass: function (item, childClasse) {
      if (!item.targetClasses || item.targetClasses.length === 0) return true;
      return item.targetClasses.indexOf(childClasse) > -1;
    },

    deleteChallenge: function (id) {
      var db = getDB();
      db.challenges = db.challenges.filter(function (c) { return c.id !== id; });
      saveRaw(db);
    },

    deleteAffinity: function (id) {
      var db = getDB();
      db.affinities = db.affinities.filter(function (a) { return a.id !== id; });
      saveRaw(db);
    },

    // Vérifie / applique les déclencheurs automatiques de publication programmée
    applyScheduledPublications: function () {
      var db = getDB();
      var changed = false;
      var now = Date.now();
      [db.challenges, db.affinities].forEach(function (list) {
        list.forEach(function (item) {
          if (!item.published && item.publishAt && new Date(item.publishAt).getTime() <= now) {
            item.published = true;
            changed = true;
          }
        });
      });
      if (changed) saveRaw(db);
      return changed;
    },

    hasAttempted: function (item, userId) {
      return !!(item.attempts && item.attempts[userId]);
    },

    recordChallengeAttempt: function (challengeId, userId, result) {
      var db = getDB();
      var c = db.challenges.find(function (x) { return x.id === challengeId; });
      if (!c) return { ok: false };
      if (c.attempts[userId]) return { ok: false, error: "Défi déjà réalisé." };
      var attemptRecord = {
        score: result.score,
        total: result.total,
        percent: result.percent,
        durationSec: result.durationSec,
        answers: result.answers,
        date: nowISO()
      };
      c.attempts[userId] = attemptRecord;
      saveRaw(db);
      return { ok: true };
    },

    recordAffinityAttempt: function (affId, userId, result) {
      var db = getDB();
      var a = db.affinities.find(function (x) { return x.id === affId; });
      if (!a) return { ok: false };
      var attemptRecord = {
        axesScores: result.axesScores,
        profileLabel: result.profileLabel,
        recommendations: result.recommendations,
        date: nowISO()
      };
      a.attempts[userId] = attemptRecord;
      saveRaw(db);
      return { ok: true };
    },

    // ---- Profils d'apprentissage (par domaine RDC) ----
    // Provisoire : basé sur un seul défi juste terminé (utilise la même logique testée que "computeStrengths").
    provisionalProfileForChallenge: function (challengeId, userId) {
      var c = this.getChallenge(challengeId);
      if (!c) return [];
      return global.NexiUtils.computeStrengths([c], userId, CATEGORIES).filter(function (r) { return r.total > 0; });
    },

    // Cumulé : agrège TOUS les défis réalisés par l'enfant, tous domaines confondus.
    cumulativeLearningProfile: function (userId) {
      var db = getDB();
      return global.NexiUtils.computeStrengths(db.challenges, userId, CATEGORIES).filter(function (r) { return r.total > 0; });
    },

    // Formel et mensuel : agrège uniquement les tentatives dont la date tombe dans le mois donné (format "AAAA-MM").
    monthlyLearningProfile: function (userId, yearMonth) {
      var db = getDB();
      yearMonth = yearMonth || currentYearMonth();
      return global.NexiUtils.computeStrengthsInMonth(db.challenges, userId, CATEGORIES, yearMonth).filter(function (r) { return r.total > 0; });
    },

    currentWeekLabel: currentWeekLabel,
    currentYearMonth: currentYearMonth,
    monthLabelFR: monthLabelFR,
    avatarUrl: avatarUrl,
    randomAvatarId: randomAvatarId,

    settings: function () { return getDB().settings; },
    updateSettings: function (patch) {
      var db = getDB();
      db.settings = Object.assign({}, db.settings, patch);
      saveRaw(db);
      return db.settings;
    },

    bootstrap: bootstrap,
    fullSnapshot: fullSnapshot
  };

  global.NexiStore = Store;

  // Permet à sync.js de lire l'état complet à chaque push, sans dépendance
  // circulaire (sync.js est chargé AVANT store.js, donc on relie ici).
  if (global.NexiSync && typeof global.NexiSync.setSnapshotProvider === "function") {
    global.NexiSync.setSnapshotProvider(fullSnapshot);
  }
})(window);
