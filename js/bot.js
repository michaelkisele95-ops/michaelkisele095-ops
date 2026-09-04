/* ============================================================
   NEXIONE — bot.js
   NEXI BOT : mascotte SVG (bleu / blanc / noir, inspirée de la référence fournie :
   tête ronde à visage-écran, loupe en main) + petites interactions.
   ============================================================ */

(function (global) {
  "use strict";

  var BOT_SVG =
    '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nexi Bot">' +
      '<defs>' +
        '<linearGradient id="botBody" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#2F6BFF"/>' +
          '<stop offset="1" stop-color="#0B1B5C"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<ellipse cx="100" cy="178" rx="46" ry="8" fill="#000" opacity="0.25"/>' +
      '<circle cx="42" cy="96" r="14" fill="#0B1B5C"/>' +
      '<circle cx="158" cy="96" r="14" fill="#0B1B5C"/>' +
      '<rect x="58" y="108" width="84" height="62" rx="26" fill="url(#botBody)"/>' +
      '<circle cx="86" cy="139" r="9" fill="#0B1B5C"/>' +
      '<circle cx="114" cy="139" r="9" fill="#0B1B5C"/>' +
      '<rect x="70" y="30" width="60" height="56" rx="22" fill="#FFFFFF"/>' +
      '<rect x="78" y="42" width="44" height="30" rx="10" fill="#0A0A0A"/>' +
      '<circle cx="94" cy="57" r="7" fill="#7FD4FF"/>' +
      '<circle cx="112" cy="57" r="7" fill="#7FD4FF"/>' +
      '<circle cx="66" cy="20" r="5" fill="#0B1B5C"/>' +
      '<circle cx="134" cy="20" r="5" fill="#0B1B5C"/>' +
      '<line x1="66" y1="20" x2="72" y2="30" stroke="#0B1B5C" stroke-width="3"/>' +
      '<line x1="134" y1="20" x2="128" y2="30" stroke="#0B1B5C" stroke-width="3"/>' +
    '</svg>';

  var GREETINGS = [
    "Nous sommes {date}. Prêt·e à relever un défi aujourd'hui ?",
    "Bienvenue sur NEXIONE ! Aujourd'hui, on progresse encore un peu.",
    "{date} — belle journée pour tester tes affinités ou un nouveau défi !"
  ];

  var CHEERS = [
    "Excellent ! Continue comme ça, tu progresses vraiment bien.",
    "Bravo ! Ce genre de résultat, ça se fête.",
    "Impressionnant ! Ton badge t'attend dans Ma Progression."
  ];

  var ENCOURAGE = [
    "Pas grave du tout, chaque essai fait grandir ta logique. On retente au prochain défi !",
    "C'est en se trompant qu'on apprend le mieux. Je crois en toi pour le prochain !",
    "Ce n'était pas le bon jour pour cette question, mais tu progresses quand même."
  ];

  var WRONG_ANSWER = [
    "Presque ! Regarde bien la prochaine question.",
    "Pas cette fois, mais tu vas trouver la suite !",
    "On avance, la prochaine est pour toi."
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function todayFR() {
    var d = new Date();
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }

  function mount(containerEl) {
    if (!containerEl) return null;
    containerEl.innerHTML =
      '<div class="hero-bot" id="nexiHeroBot">' +
        '<div class="bot-avatar" id="nexiBotAvatar" tabindex="0" role="button" aria-label="Parler à Nexi Bot">' +
          '<div class="bot-inner">' + BOT_SVG + '</div>' +
          '<span class="bot-pulse"></span>' +
          '<span class="bot-unread-dot"></span>' +
        '</div>' +
        '<div class="bot-speech">' +
          '<div class="bot-name">NEXI BOT</div>' +
          '<div class="bubble" id="nexiBotBubble">Salut ! Clique sur moi pour un mot d\'encouragement.</div>' +
        '</div>' +
      '</div>';

    var wrap = document.getElementById("nexiHeroBot");
    var avatar = document.getElementById("nexiBotAvatar");
    var inner = avatar.querySelector(".bot-inner");
    var bubble = document.getElementById("nexiBotBubble");
    var dot = wrap.querySelector(".bot-unread-dot");
    var collapseTimer = null;
    var pendingText = null;

    function pulse() {
      inner.classList.remove("talking");
      void inner.offsetWidth;
      inner.classList.add("talking");
    }

    // Ouvre réellement la bulle avec un message — utilisé pour une action
    // volontaire (clic) ou un moment clé (fin de défi, par ex.). La classe
    // "expanded" est celle que le CSS utilise pour afficher la bulle.
    function expandWith(text) {
      wrap.classList.add("expanded");
      bubble.textContent = text;
      pulse();
      if (dot) dot.classList.remove("show");
      pendingText = null;
      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(function () { wrap.classList.remove("expanded"); }, 4000);
    }

    // say() reste disponible pour les moments où le message DOIT être vu
    // (résultat d'un défi, par ex.) : la bulle s'ouvre immédiatement.
    function say(text) { expandWith(text); }

    // hint() = réaction discrète à la navigation : juste une pastille qui
    // pulse, jamais de bulle qui s'ouvre toute seule. Le message n'apparaît
    // que si l'enfant clique sur le bot lui-même — non intrusif par design.
    function hint(text) {
      pendingText = text;
      if (dot) dot.classList.add("show");
      pulse();
    }

    avatar.addEventListener("click", function () {
      if (wrap.classList.contains("expanded")) { wrap.classList.remove("expanded"); clearTimeout(collapseTimer); return; }
      expandWith(pendingText || pick(GREETINGS).replace("{date}", todayFR()));
    });
    avatar.addEventListener("keypress", function (e) {
      if (e.key === "Enter" || e.key === " ") avatar.click();
    });

    // Au chargement : juste une pastille discrète (pas de bulle imposée).
    hint(pick(GREETINGS).replace("{date}", todayFR()));

    return { say: say, hint: hint, el: avatar };
  }

  function svgSmall() { return BOT_SVG; }

  global.NexiBot = {
    mount: mount,
    svg: svgSmall,
    cheer: function () { return pick(CHEERS); },
    encourage: function () { return pick(ENCOURAGE); },
    wrongAnswer: function () { return pick(WRONG_ANSWER); },
    greeting: function () { return pick(GREETINGS).replace("{date}", todayFR()); }
  };
})(window);
