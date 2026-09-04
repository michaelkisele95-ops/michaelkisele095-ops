/* ============================================================
   NEXIONE — icons.js
   Petit set d'icônes SVG originales (trophée, médaille, manette,
   flamme, boussole, étoile) dans la palette NEXI, pour remplacer
   les emojis dans les badges de progression et le classement.
   ============================================================ */
(function (global) {
  "use strict";

  function svg(inner, extra) {
    return '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" ' + (extra || "") + '>' + inner + "</svg>";
  }

  var NexiIcons = {
    trophy: function () {
      return svg(
        '<path d="M20 10h24v10c0 8-5.4 13.4-12 13.4S20 28 20 20V10z" fill="#FFB020"/>' +
        '<path d="M20 12H10v4c0 6 4.4 10 9 10.6" stroke="#C97A00" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M44 12h10v4c0 6-4.4 10-9 10.6" stroke="#C97A00" stroke-width="3" stroke-linecap="round"/>' +
        '<rect x="28" y="33" width="8" height="9" fill="#C97A00"/>' +
        '<rect x="18" y="46" width="28" height="7" rx="2" fill="#2F6BFF"/>' +
        '<rect x="24" y="41" width="16" height="6" rx="2" fill="#3B7BFF"/>'
      );
    },
    medal: function () {
      return svg(
        '<path d="M22 8l10 16 10-16" stroke="#FFB020" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '<circle cx="32" cy="40" r="16" fill="#FFB020"/>' +
        '<circle cx="32" cy="40" r="10.5" fill="#FFFFFF" opacity=".25"/>' +
        '<path d="M32 32l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L32 32z" fill="#C97A00"/>'
      );
    },
    flame: function () {
      return svg(
        '<path d="M32 6c4 8-2 10-2 16 0 4 3 6 3 6s7-3 7-11c6 6 8 13 8 18 0 10.5-8.5 19-18 19S12 44.5 12 34c0-9 6-16 8-19 1 5 3 7 5 7 3 0-1-9 7-16z" fill="#FF6B4A"/>' +
        '<path d="M32 26c1.5 4-1 5-1 8.5A5.5 5.5 0 1032 23c-.5 1-.5 2-0.3 3z" fill="#FFD23F"/>'
      );
    },
    compass: function () {
      return svg(
        '<circle cx="32" cy="32" r="24" fill="#2F6BFF"/>' +
        '<circle cx="32" cy="32" r="24" fill="none" stroke="#0B1B5C" stroke-width="2"/>' +
        '<path d="M40 22l-6 12-12 6 6-12 12-6z" fill="#FFFFFF"/>' +
        '<path d="M32 32l6-12-6 12-12 6 12-6z" fill="#FFB020"/>' +
        '<circle cx="32" cy="32" r="3" fill="#0B1B5C"/>'
      );
    },
    star: function () {
      return svg(
        '<path d="M32 6l7.6 15.9 17.5 2.4-12.7 12.1 3.2 17.4L32 45.6 16.4 53.8l3.2-17.4L6.9 24.3l17.5-2.4L32 6z" fill="#FFD23F"/>' +
        '<path d="M32 6l7.6 15.9 17.5 2.4-12.7 12.1 3.2 17.4L32 45.6z" fill="#FFB020"/>'
      );
    },
    controller: function () {
      return svg(
        '<rect x="6" y="22" width="52" height="24" rx="12" fill="#EAF0FF"/>' +
        '<circle cx="20" cy="34" r="7" fill="#2F6BFF"/>' +
        '<rect x="17.4" y="31" width="5.2" height="6" rx="1" fill="#EAF0FF"/>' +
        '<rect x="14.5" y="31.5" width="11" height="5" rx="1" fill="#EAF0FF"/>' +
        '<circle cx="44" cy="30" r="3.4" fill="#FF6B4A"/>' +
        '<circle cx="50" cy="36" r="3.4" fill="#1FB67A"/>'
      );
    },
    console: function () {
      return svg(
        '<rect x="14" y="8" width="20" height="48" rx="5" fill="#EAF0FF"/>' +
        '<circle cx="24" cy="46" r="4.5" fill="#2F6BFF"/>' +
        '<rect x="19" y="14" width="10" height="18" rx="2" fill="#0B1B5C"/>'
      );
    },
    book: function () {
      return svg(
        '<path d="M10 12c6-3 14-3 20 1v38c-6-4-14-4-20-1V12z" fill="#2F6BFF"/>' +
        '<path d="M54 12c-6-3-14-3-20 1v38c6-4 14-4 20-1V12z" fill="#1FB67A"/>'
      );
    }
  };

  global.NexiIcons = NexiIcons;
})(typeof window !== "undefined" ? window : this);
