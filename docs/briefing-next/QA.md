# Validation — 5 novembre 2026

Code validé : `5704db3ee191c0de9c01c434110e1b62203bd000`.

[Exécution GitHub Actions réussie](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42040094812) · [Captures et PDF de démonstration](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42040094812/artifacts/13420337427).

| Vérification | Résultat |
|---|---|
| Installation npm, génération Prisma, compilation TypeScript | Réussies localement et en CI |
| Tests Briefing Next (logique, DOM, routes, export isolé) | 23 / 23 réussis |
| Tests existants info-requests | 62 / 62 réussis localement |
| Schéma Prisma | Valide |
| Migration PostgreSQL 16 | Réussie deux fois sur une base CI jetable |
| Sauvegardes concurrentes en PostgreSQL réel | Une sauvegarde réussit ; l’autre reçoit 409 |
| Conservation des anciennes slides | Vérifiée en PostgreSQL |
| Publication immuable, répétition idempotente et suppression en cascade | Vérifiées en PostgreSQL |
| Recette Chromium | Réussie sur 25 pages source, 50 tâches et 20 images synthétiques |
| A4 paginé | 49 pages, zéro débordement DOM détecté ; les 50 tâches et 20 images sont présentes |
| Export 16:9 sélectif | Une page source sélectionnée ; photo conservée et aucun débordement DOM |
| Kit de marque et cadrage | Sauvegarde, réouverture, point focal et diffusion PDF vérifiés |
| Longue légende photo | Image conservée ; légende répartie sur les pages suivantes |
| Desktop et mobile | Captures inspectées ; hauteur portrait limitée à 500 px dans l’éditeur |
| PDF de démonstration | Généré sur une page isolée sans interface ; page échantillon rendue et inspectée |
| Syntaxe JS et `git diff --check` | Réussis |

## Mesures de cette exécution

Ubuntu / Chromium headless, API simulée, jeu synthétique. Ces durées ne sont pas des garanties de performance en production.

- Ouverture : **125 ms**.
- Composition de l’aperçu paginé : **870 ms**.
- Export et vérifications complémentaires du scénario : **1 509 ms**.

Les valeurs brutes et les limites du harnais sont dans `qa-browser.json`. Le test PostgreSQL est distinct du scénario navigateur : les deux réussissent mais ne constituent pas un test bout en bout avec authentification et base réelles simultanément.

## Recette encore nécessaire

Authentification réelle, permissions sur comptes métier, Cloudinary, photos obligatoires dans la fiche qualité réelle, traduction réseau, polices sur les postes utilisateurs, anciens documents représentatifs et déploiement Railway. Aucune opération de production n’a été exécutée. Les fonctionnalités manquantes du cahier des charges sont listées dans README.md.

Le navigateur local était indisponible ; les essais visuels ont été exécutés sur GitHub Actions. Les artefacts de la dernière exécution ci-dessus remplacent ceux des premiers essais.
