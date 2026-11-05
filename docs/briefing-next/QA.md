# Validation — 5 novembre 2026

État avant publication de la PR :

| Vérification | Résultat |
|---|---|
| Installation npm et génération du client Prisma | Réussies |
| Compilation TypeScript | Réussie |
| Tests Briefing Next | 21 / 21 réussis |
| Tests existants info-requests | 62 / 62 réussis |
| Validation du schéma Prisma | Réussie avec URL PostgreSQL fictive ; aucune connexion à une base |
| Analyse syntaxique des JS modifiés | Réussie |
| `git diff --check` | Réussi |
| Navigateur local | Bloqué au démarrage par une erreur de socket de profil |
| Navigateur distant | Connexion au serveur local refusée |
| Installation du premier navigateur de test | Archive téléchargée invalide |
| PostgreSQL / migrations réellement exécutées | Non exécutés |
| Recette Chromium sur GitHub Actions | Réussie : 25 pages source, 50 tâches, 20 images, export A4 de 47 pages, zéro débordement détecté |

Les durées de tests DOM ne sont pas des mesures d'ouverture, de réactivité ou d'export du produit. Aucun résultat de performance du Studio n'est inventé.

Le workflow de PR peut compléter la recette navigateur sur un hôte compatible. Une exécution verte ne remplace pas les essais sur PostgreSQL, avec Cloudinary et avec les droits métier réels. Voir README pour le périmètre non encore implémenté.

## Première recette navigateur réussie

[Exécution GitHub Actions](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42028755943) sur le commit `873f5bfb` : succès. [Captures, PDF de démonstration et mesures](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42028755943/artifacts/13414922469). Les captures desktop/mobile ont été inspectées. Le premier PDF de test a été rejeté à l’inspection visuelle : la page de test relançait l’application pendant la capture. Le harnais a été corrigé pour imprimer depuis une page vierge et vérifier l’absence de toute interface. Utiliser les artefacts de la dernière exécution réussie, pas ce premier PDF.

Ouverture mesurée : 89 ms sur le runner Linux/Chromium et API simulée. La valeur historique `exportMs: 2656` du premier rapport inclut aussi la création du PDF et les vérifications suivantes : elle ne représente pas le seul temps de composition. Le script distingue désormais `paginationMs` du reste du parcours. Ce ne sont pas des garanties de performance en production.

Le test PostgreSQL jetable est ajouté au workflow pour vérifier la migration deux fois, les 50 sources, la sauvegarde concurrente et les éditions immuables ; son résultat sera visible sur la dernière exécution de la PR.
