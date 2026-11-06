# Briefing Studio Next — développement en cours, PR brouillon

Cette branche intègre un parcours utilisable dans l'application existante. Elle ne constitue pas la totalité du cahier des charges « Studio Next ». La recette navigateur synthétique et PostgreSQL jetable a réussi ; la PR reste en brouillon pour les fonctionnalités restantes et la recette métier réelle.

## Utilisation

1. Ouvrir un briefing, puis **Studio Next**. Un document déjà converti s'ouvre directement dans Next.
2. **Générer** : choisir le préréglage, le thème, le format et les sources. Les tâches n'ont pas de phase métier : le filtre phase concerne les contrôles et l'équipe. Le total inclus/exclu est affiché et aucune limite de 12 tâches n'est appliquée.
3. Sélectionner un bloc pour modifier son contenu, sa composition, son style et ses annotations. Ctrl/Cmd ou Maj + clic sélectionne plusieurs blocs. Le glisser-déposer change l'ordre ; les flèches sont l'alternative clavier. Copier, dupliquer, supprimer et copier/coller le style fonctionnent sur la sélection. Les pages peuvent être dupliquées et déplacées.
4. Les retouches sont enregistrées après temporisation. **Enregistrer** permet de réessayer après une erreur. Un conflit de révision conserve la copie locale et propose son téléchargement JSON, ou le rechargement explicite du serveur. Le JSON de secours n'a pas encore d'importeur UI.
5. **Actualiser** compare les sources aux valeurs de référence : ajouts, changements, suppressions et conflits. Les annotations et styles sont conservés ; une suppression source exige un choix explicite. Les exclusions connues sont conservées. Les blocs figés ne suivent plus les sources.
6. **Vue chantier** affiche le contenu sémantique sur mobile. Changer un statut appelle l'API `Task` existante ; le briefing reste un instantané jusqu'à actualisation. Les contrôles ouvrent la fiche qualité existante avec ses preuves, droits et historique. Aucun bouton Next ne valide directement un contrôle.
7. **Diffusions** enregistre une édition immuable, consultable par les personnes déjà autorisées au projet. Il n'existe aucun lien public ni route de modification d'une édition.
8. **PDF / imprimer** prépare une copie isolée et un aperçu paginé, avec texte sélectionnable et liens. Choisir ensuite « Enregistrer en PDF » dans l'impression du navigateur, sans en-têtes/pieds de page du navigateur, avec arrière-plans activés. L'export Next ne téléverse pas automatiquement le PDF ; l'ajouter ensuite aux fichiers du projet. L'export Studio historique conserve son téléversement et utilise désormais un canevas isolé.

## Modèles réutilisables et pages PDF

**Mes modèles** enregistre une structure privée dans `briefing_templates`, liée au compte connecté et utilisable sur ses autres projets autorisés. Titres, textes, annotations, sources, fichiers, fonds graphiques, identifiants projet et données de marque ne sont pas copiés. Les compositions conservent leurs formes et styles ; leurs textes sont vidés et leurs repères remis à compléter. Chaque bloc lié peut être explicitement relié à une source du projet destinataire. L’ajout à la suite est proposé par défaut ; le remplacement du document reste annulable. Export/import JSON versionné, validation serveur stricte, suppression et retry idempotent sont inclus. Les modèles ne constituent pas une copie de contenu client autorisé : ce mode de copie reste à réaliser.

**Pages d’un PDF** utilise les PDF déjà présents dans les fichiers du projet. Le serveur vérifie projet/fichier puis compte les pages dans le document réel avec `pdf-lib` existant. Téléchargement limité à 10 Mo, délai de 20 secondes, redirections interdites et hôte Cloudinary explicite. Il ne déduit plus la fin du document d’une erreur réseau. Le choix accepte `1, 3-5`, avec au maximum 50 pages par lot et 500 pages par document. Chaque aperçu est chargé avant l’ajout atomique des pages ; échec ou annulation conserve le briefing initial. Les pages ajoutées sont sauvegardées, exportées et liées à l’original.

Limite : le rendu utilise le service PDF-vers-image Cloudinary existant, en PNG jusqu’à 2 000 px. Il requiert un PDF de type `image/upload` dont les transformations sont autorisées ; les fichiers protégés, privés non transformables ou hors Cloudinary sont refusés explicitement. Le plan intégré est rasterisé, l’original reste disponible pour sa précision vectorielle. Les règles de qualité métier ne changent pas. Aucune nouvelle dépendance de production.

Migration additive : la table `briefing_templates` et son index propriétaire sont créés par `migrateBriefingNext()` au démarrage, également déclarés dans Prisma. Retour arrière : conserver la table et revenir au code antérieur ; aucune donnée existante n’est supprimée. Les modèles restent privés au compte ; partage entre collaborateurs non implémenté.

## Composition libre

**+ Composition libre** ouvre un bloc vectoriel de 1000 × 600 : textes, rectangles, ellipses, flèches dans huit directions, repères numérotés et légendes. Une photo du projet peut servir de fond ; « Créer un schéma annoté » conserve la photo originale. Le fond entier est ajusté au cadre ; remplacer le fond conserve les annotations, dont les positions doivent être revérifiées.

Maj + clic et Ctrl/Cmd+A sélectionnent ; les groupes se déplacent ensemble. Alignements, distribution, calques, verrouillage, visibilité, copie de style, duplication, zoom et grille sont disponibles. Les flèches clavier déplacent de 1 px (Maj : 10 px). Redimensionner le texte modifie sa largeur sans étirer sa police. Limites explicites : 200 objets et 2 000 caractères par texte.

L’historique local regroupe chaque geste ; Appliquer constitue une opération dans l’historique du document, puis utilise la sauvegarde avec révision. Annuler abandonne les changements du panneau. Un dépassement de page bloque l’application. Les textes et légendes sont lisibles dans la vue chantier ; l’export conserve le SVG vectoriel et attend les images.

Le module utilise les primitives SVG natives, sans dépendance supplémentaire. Le serveur valide une liste typée de formes ; aucun SVG ou HTML utilisateur n’est chargé. Le fond passe par les contrôles de sources du projet. Fabric et les anciens objets restent préservés dans l’éditeur historique.

## Compléments graphiques

- **Kit de marque** : nom, couleurs texte/fond/accent et police enregistrés dans le document et les diffusions. Import/export JSON versionné pour réutiliser une identité entre projets, sans contenu chantier, identifiants ou URLs. Les exceptions de style locales sont préservées. Le retour aux thèmes et l’application du kit sont annulables. La régénération conserve le kit.
- **Cadrage photo** : original, 16:9, carré ou portrait ; remplir/recadrer ou contenir ; point focal horizontal et vertical. Réglages enregistrés séparément des données source, préservés à l’actualisation et à la duplication. Aucun fichier original n’est modifié.
- **Export sélectif** : choix explicite des pages avant préparation. Le moteur conserve les images quand une longue légende doit passer sur une page suivante.

## Architecture et compatibilité

- `Briefing.document` : schéma sémantique v1 validé par Zod. `revision` protège la sauvegarde par une mise à jour conditionnelle atomique. Audience interne uniquement.
- `BriefingPublication` : instantanés indépendants du brouillon ; unicité briefing/révision pour les répétitions de publication.
- `briefingSources.ts` : catalogue projet, tâches, contrôles, livraisons, contacts, équipe et fichiers avec projection explicite des champs. La validation serveur refuse les références étrangères, même pour un utilisateur ayant accès à plusieurs projets.
- Routes protégées par l'authentification et les règles `scopeGuard`. Aucune nouvelle route de modification des tâches ou de validation qualité.
- `briefing-next-model.js` : génération déterministe, migration additive, sélection, duplication, comparaison à trois versions.
- `briefing-next.js` / `.css` : éditeur de blocs DOM, thèmes, historique document, collage texte/TSV et capture téléversée via l'API projet existante. Le HTML collé est réduit au texte brut et échappé.
- L'ancien JSON `slides` / `studioSlides` reste inchangé. Une page Fabric est représentée par son rendu dans Next ; une page classique par son texte. **Copie éditable de l'original** crée un autre briefing pour retrouver l'éditeur historique sans deux représentations modifiables du même document. Ce n'est pas une conversion complète des objets libres en blocs sémantiques.
- Pas de nouvelle dépendance de production. Playwright est ajouté uniquement en développement, pour la recette navigateur automatisée et les captures ; il ne remplace aucun moteur applicatif. Fabric 5.3.0 et jsPDF 2.5.1 existants conservés. Next utilise la composition HTML pour le texte sélectionnable et la lecture mobile.

## Migration et retour arrière

Le dépôt utilise les migrations idempotentes au démarrage, pas `prisma migrate deploy`. Le schéma Prisma et `src/utils/migrations.ts` ajoutent deux colonnes et une table. Aucun champ historique n'est effacé. Les trois instructions SQL doivent réussir pour initialiser cette fonctionnalité.

Avant fusion : sauvegarder la base et tester un démarrage puis un second démarrage sur une base de recette. L'application doit pouvoir lire un briefing classique, un Studio et un document Next. Cette vérification a réussi dans le workflow sur PostgreSQL 16 jetable ; consulter QA.md pour la preuve et les limites.

Retour arrière applicatif : revenir au commit précédent et conserver les colonnes/tables supplémentaires. Les anciens éditeurs retrouvent leurs contenus historiques. Les travaux Next restent dans `document` et `briefing_publications`, mais ne sont pas éditables par l'ancienne application. Ne pas supprimer ces colonnes pour revenir en arrière.

## Vérifications exécutées

- `npm ci --no-audit --no-fund` et génération du client Prisma.
- `npm run build` : compilation TypeScript.
- `npm run test:briefing-next` : tests de logique, DOM jsdom, routes Express avec doublure de base et garde d'accès réel. Voir `QA.md` pour le résultat final.
- Tests significatifs : 50 tâches, exclusions, conservation des annotations, conflits de champs, suppression source, duplication avec nouveaux IDs, migration sans modification de l'original, validation du schéma, références étrangères, lecture seule, conflit entre deux révisions, publications immuables et export historique en échec sans modification du canevas actif.

Les tests avec doublure de base ne démontrent pas une transaction PostgreSQL réelle ; jsdom ne démontre ni la géométrie ni la pagination d'impression.

## Recette navigateur exécutée sur GitHub Actions

`tests/briefingNext.browser.cjs` prépare 25 pages, 50 tâches (dont un très long texte), 20 images synthétiques, cinq statuts qualité et une source PDF de trois pages. Il vérifie l'ouverture, la sauvegarde/réouverture, le thème, l'actualisation, la vue mobile, le collage TSV, le conflit de révision et l'export A4. Il produit des captures, un PDF et les mesures réelles uniquement après exécution réussie.

Prérequis : Playwright et son Chromium installés dans l'environnement de recette. Exécuter `node tests/briefingNext.browser.cjs` ; `CHROMIUM_PATH` permet un navigateur installé. `BRIEFING_DEMO_ONLY=1` démarre uniquement le serveur synthétique sur le port 4317. Ne pas déployer ce serveur de démonstration.

Ici, le Chromium disponible échoue au démarrage (socket de profil refusée), le navigateur distant ne joint pas le serveur local et le téléchargement du navigateur de test retourne une archive invalide. La recette a ensuite réussi sur GitHub Actions : captures desktop/mobile et PDF de démonstration sont disponibles dans les artefacts de l’exécution liée dans QA.md. Il n’y a pas de capture avant/après de la production.

## Écarts restant au cahier des charges

- La composition libre concerne un bloc graphique ; les pages sémantiques restent en flux. Conversion complète des anciens objets Fabric, rotation libre, groupes imbriqués et magnétisme entre objets restent à réaliser. Les fonds graphiques Next acceptent les images ; les pages PDF disposent d’un parcours d’import séparé.
- Pas encore de bibliothèque partagée de kits de marque ou de logos, galerie photographique élaborée, partage des modèles entre collaborateurs ou presse-papiers riche interapplications. La multisélection Next porte sur les blocs de la page courante.
- Les filtres de génération ne sont pas stockés en tant que requête dynamique ; les exclusions d'IDs sont stockées. Les nouveaux éléments sont présentés à la comparaison pour décision.
- Régénération globale réversible via l'historique ; pas encore de régénération ciblée d'une section ni de propositions IA confirmables.
- Pas de diffusion client dédiée, ni de présélection « synthèse client ». L'audience reste interne ; aucun contrôle serveur de publication client n'est promis.
- Export FR et traduction des champs descriptifs en EN seulement : titres/labels système ne sont pas entièrement localisés. Pagination A4 vérifiée dans le navigateur sur la fixture synthétique ; traduction complète encore à compléter ; une recette 16:9 sélective est ajoutée au workflow. Anciennes pages Fabric rasterisées. Les grandes images nécessitent une recette de charge et l'export serveur reste à évaluer.
- PostgreSQL 16 et la migration ont été testés sur une base CI jetable. Aucun test réel de Cloudinary, preuve photographique, permissions sur compte réel, traduction réseau ou Railway. Les règles qualité sont réutilisées via la fiche existante, sans nouveau chemin de validation.

La branche doit rester en brouillon tant que ces limites et les critères de recette non couverts n'ont pas été traités ou acceptés explicitement.

## Actualisation ciblée (tranche suivante)

**Actualiser une sélection** permet de comparer la page actuelle ou les blocs sélectionnés avec leurs sources projet. Les champs modifiés et les conflits sont présentés avant application. Les blocs figés ou verrouillés sont ignorés dans ce parcours ; les annotations, styles et autres pages sont conservés. Aucune nouvelle source n’est ajoutée et les exclusions restent inchangées. L’application est annulable en une étape. Si le document change pendant la comparaison, il faut relancer celle-ci pour éviter d’écraser une modification récente.

Cette opération actualise les données des blocs existants : elle ne recompose pas la mise en page et ne remplace pas encore la régénération complète d’une section. Tests locaux : compilation TypeScript et 36 tests réussis, dont isolation du périmètre et parcours DOM avec annulation. La recette navigateur de cette tranche est exécutée par la PR dédiée ; le rapport QA précédent concerne la PR #32.
