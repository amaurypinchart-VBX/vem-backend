# Validation — 6 novembre 2026

Code validé : `e7ac2c7ebf026035275925f2f739a7eade56ba78` (PR #32).

[Exécution GitHub Actions réussie](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42087602829) · [Captures et PDF de démonstration](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42087602829/artifacts/13443831393).

| Vérification | Résultat |
|---|---|
| TypeScript, Prisma et tests de logique/DOM/routes | 34 / 34 tests réussis |
| Non-régression info-requests (locale) | 62 / 62 tests réussis |
| PostgreSQL 16 jetable | Migration répétée, modèles privés et création idempotente, concurrence 200/409 et publications immuables réussies |
| Modèles réutilisables | Suppression du contenu chantier, isolation propriétaire, liaison explicite aux sources destinataires et annulation vérifiées |
| Import PDF | Comptage réel testé ; sélection des pages 1 et 3, sauvegarde/réouverture et absence d’ajout partiel en cas d’échec vérifiées |
| Composition libre | Groupes, verrouillage, duplication, undo/redo, sauvegarde/réouverture vérifiés |
| Souris | Déplacement réel et redimensionnement du texte sans modifier sa taille de police |
| Sources graphiques | Fond avec référence projet obligatoire ; source étrangère refusée |
| Export A4 | 51 pages, 50 tâches, 20 photos, une composition vectorielle et deux pages PDF ; aucun débordement DOM |
| Export 16:9 sélectif | Réussi, contenu sélectionné présent |
| Images et légendes | Cadrage enregistré et longues légendes préservées |
| Vue mobile, collage TSV et conflit 409 | Réussis |

Mesures du scénario synthétique : ouverture 129 ms ; pagination 872 ms ; export et vérifications 1 574 ms. Ces chiffres ne garantissent pas les performances de production.

Inspection visuelle effectuée sur la capture Studio de la page PDF et sur la page 50 du PDF A4 produit par Chromium : image, titre, lien vers l’original et pied de page lisibles, sans chevauchement ni découpe observés sur ces vues. Le document exporté compte 51 pages A4.

Le navigateur utilise une API simulée, notamment des aperçus PDF synthétiques. Le test PostgreSQL est distinct : ce n’est pas un test bout en bout avec authentification et base réelles simultanément. Authentification réelle, comptes métier, transformations Cloudinary, preuves qualité, traduction réseau et polices des postes utilisateurs restent à tester. Les aperçus PDF nécessitent des fichiers Cloudinary image/upload avec transformations PDF autorisées ; ils sont rasterisés à 2 000 px, avec lien conservé vers l’original.

Cette tranche est proposée dans la PR #32, sans fusion ni déploiement. La tranche précédente (PR #31) a été fusionnée sur main et son déploiement Railway a réussi.
