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
| PDF / captures / performances visuelles | Non validés localement ; workflow GitHub préparé |

Les durées de tests DOM ne sont pas des mesures d'ouverture, de réactivité ou d'export du produit. Aucun résultat de performance du Studio n'est inventé.

Le workflow de PR peut compléter la recette navigateur sur un hôte compatible. Une exécution verte ne remplace pas les essais sur PostgreSQL, avec Cloudinary et avec les droits métier réels. Voir README pour le périmètre non encore implémenté.
