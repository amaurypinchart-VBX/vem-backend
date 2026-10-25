# Formation VEM

| Fichier | Contenu |
|---|---|
| `formation-vem.html` | **Le support à diffuser** : un seul fichier, à ouvrir dans un navigateur (même hors ligne). Lien direct par chapitre : `formation-vem.html#clients`, `#projet-mail`, `#checklist`, `#memo-mail`… |
| `formation-vem-en.html` | Le même support en anglais (libellés de l'app gardés en français), généré depuis `_source/en/` |
| `00_INVENTAIRE_FONCTIONNEL.md` | Audit fonctionnel de VEM (interne) |
| `01_PLAN_PEDAGOGIQUE.md` | Parcours, durées, matrice « qui remplit quoi, quand » |
| `02_SCRIPT_SLIDES.md` | Script slide par slide (généré) |
| `03_FICHE_MEMO_MAIL.md` | Fiche mémo à imprimer : la règle du mail |
| `04_CHECKLIST_PROJET_COMPLET.md` | Ce qui doit être rempli à chaque étape |
| `03_FICHE_MEMO_MAIL_EN.md` · `04_CHECKLIST_PROJET_COMPLET_EN.md` | Les deux fiches à imprimer, en anglais |
| `05_CAPTURES_A_FAIRE.md` | Captures d'écran à réaliser (généré) |
| `06_RAPPORT_QA.md` | Contrôle qualité |
| `07_PROMPT_REPARATIONS.md` | Prompt Claude Code : tout ce qu'il faut réparer dans VEM |
| `_source/` | Source unique du support (modules `m00…m16.mjs`, styles, script) |

**Dans VEM** : menu latéral › Aide › « 🎓 Formation VEM » (nouvel onglet), ou « 🇬🇧 VEM Training (EN) » pour l'anglais (`src/assets/formation-en.html`, `GET /api/v1/formation?lang=en`). Réservé aux personnes connectées : le build copie le deck dans `src/assets/formation.html`, servi par `GET /api/v1/formation` (derrière `authMiddleware`) — jamais dans `public/`, qui est accessible sans mot de passe.

**Utiliser le support** :
- naviguer : ← → ou espace (glisser sur téléphone) ;
- **S** : sommaire ;
- **N** : notes de l'animateur ;
- **Ctrl + P** : PDF, une slide par page.

**Modifier le support** :
1. Éditer `_source/m*.mjs` (textes) ou `_source/fil.mjs` (projet fictif) — et la même slide dans `_source/en/m*.mjs` (anglais : mêmes `key`, libellés de l'app en français).
2. Lancer `node docs/formation/_source/build.mjs`.
3. Vérifier que la ligne « libellés (0 introuvables) » est toujours là.
