# Validation — 5 novembre 2026

Code validé : `82e9f5383e59fa66cdf37203df1bd1bf82481f43`.

[Exécution GitHub Actions réussie](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42029733390) · [Captures et PDF de démonstration](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42029733390/artifacts/13415197541).

| Vérification | Résultat |
|---|---|
| Installation npm, génération Prisma, compilation TypeScript | Réussies localement et en CI |
| Tests Briefing Next (logique, DOM, routes, export isolé) | 21 / 21 réussis |
| Tests existants info-requests | 62 / 62 réussis localement |
| Schéma Prisma | Valide |
| Migration PostgreSQL 16 | Réussie deux fois sur une base CI jetable |
| Sauvegardes concurrentes en PostgreSQL réel | Une sauvegarde réussit ; l’autre reçoit 409 |
| Conservation des anciennes slides | Vérifiée en PostgreSQL |
| Publication immuable, répétition idempotente et suppression en cascade | Vérifiées en PostgreSQL |
| Recette Chromium | Réussie sur 25 pages source, 50 tâches et 20 images synthétiques |
| A4 paginé | 47 pages, zéro débordement DOM détecté ; les 50 tâches sont présentes |
| Desktop et mobile | Captures inspectées |
| PDF de démonstration | Généré sur une page isolée sans interface ; page échantillon rendue et inspectée |
| Syntaxe JS et `git diff --check` | Réussis |

## Mesures de cette exécution

Ubuntu / Chromium headless, API simulée, jeu synthétique. Ces durées ne sont pas des garanties de performance en production.

- Ouverture : **131 ms**.
- Composition de l’aperçu paginé : **873 ms**.
- Export et vérifications complémentaires du scénario : **1 325 ms**.

Les valeurs brutes et les limites du harnais sont dans `qa-browser.json`. Le test PostgreSQL est distinct du scénario navigateur : les deux réussissent mais ne constituent pas un test bout en bout avec authentification et base réelles simultanément.

## Recette encore nécessaire

Authentification réelle, permissions sur comptes métier, Cloudinary, photos obligatoires dans la fiche qualité réelle, traduction réseau, export 16:9, polices sur les postes utilisateurs, anciens documents représentatifs et déploiement Railway. Aucune opération de production n’a été exécutée. Les fonctionnalités manquantes du cahier des charges sont listées dans README.md.

Le navigateur local était indisponible ; les essais visuels ont été exécutés sur GitHub Actions. Les artefacts de la dernière exécution ci-dessus remplacent ceux des premiers essais.
