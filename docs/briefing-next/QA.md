# Validation — 5 novembre 2026

Code validé : `04952e3233d3f47381910bbba0ec5815b12cf80b`.

[Exécution GitHub Actions réussie](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42071282359) · [Captures et PDF de démonstration](https://github.com/amaurypinchart-VBX/vem-backend/actions/runs/42071282359/artifacts/13435029770).

| Vérification | Résultat |
|---|---|
| TypeScript, Prisma et tests de logique/DOM/routes | 29 / 29 tests réussis |
| PostgreSQL 16 jetable | Migration répétée, concurrence 200/409 et publications immuables réussies |
| Composition libre | Groupes, verrouillage, duplication, undo/redo, sauvegarde/réouverture vérifiés |
| Souris | Déplacement réel et redimensionnement du texte sans modifier sa taille de police |
| Sources graphiques | Fond avec référence projet obligatoire ; source étrangère refusée |
| Export A4 | 49 pages, 50 tâches, 20 photos et une composition vectorielle avec fond ; aucun débordement DOM |
| Export 16:9 sélectif | Réussi, contenu sélectionné présent |
| Images et légendes | Cadrage enregistré et longues légendes préservées |
| Vue mobile, collage TSV et conflit 409 | Réussis |

Mesures du scénario synthétique : ouverture 85 ms ; pagination 854 ms ; export et vérifications 1 388 ms. Ces chiffres ne garantissent pas les performances de production.

Les captures et le PDF sont produits par Chromium dans les artefacts. Cette dernière révision a été vérifiée par les assertions du navigateur ; aucune nouvelle inspection visuelle manuelle n’a été effectuée après l’indisponibilité de l’environnement local. Les précédents rendus A4 et cadrages avaient été inspectés lors de la tranche précédente.

Le navigateur utilise une API simulée. Le test PostgreSQL est distinct : ce n’est pas un test bout en bout avec authentification et base réelles simultanément. Authentification réelle, comptes métier, Cloudinary, preuves qualité, traduction réseau, polices des postes utilisateurs et Railway restent à tester. Aucune fusion ni opération de production.
