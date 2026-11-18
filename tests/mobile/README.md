# Contrôle téléphone / tablette (VEM)

Outil de vérification utilisé pour l'audit du 11.11.2026 (`docs/mobile/AUDIT_Mobile_Tablette.md`)
et à relancer après chaque correction de mise en page : il ouvre VEM comme sur un iPhone 14, un
Pixel 7, un petit Android (360 px), un iPad en portrait et en paysage, et un ordinateur, puis mesure
pour chaque page, onglet de projet et fenêtre principale :

- **le débordement horizontal** (la page est plus large que l'écran → elle glisse de côté sur
  iPhone, se dézoome sur Android et la barre du bas sort de l'écran) — doit être **0** partout ;
- **les boutons d'action cachés** (Sauvegarder / Envoyer / Créer… recouverts par la barre du bas,
  le bouton 🤖 ou coupés à droite une fois la fenêtre défilée en bas) — doit être **vide** ;
- les cibles tactiles de moins de 32 px (indicatif).

Il écrit `tests/mobile/out/resume.txt`, `out/report.json` et une capture par écran
(`out/` n'est pas versionné).

## Lancer en local (base jetable, jamais la base Railway)

```bash
# 1. Postgres jetable (exemple Linux ; sur Mac : Postgres.app ou brew)
mkdir -p /var/tmp/vempg && chown postgres /var/tmp/vempg
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/vempg/data -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/vempg/data -o '-p 5433 -k /var/tmp/vempg' -l /var/tmp/vempg/log start"
psql -h /var/tmp/vempg -p 5433 -U postgres -c "create database vem;"

# 2. Schéma + données de démo + données « téléphone » (dates autour d'aujourd'hui, nom de projet très long…)
export DATABASE_URL="postgresql://postgres@localhost:5433/vem?host=/var/tmp/vempg"
npm install
npx prisma db push --skip-generate
npx ts-node --transpile-only prisma/seed.ts
psql -h /var/tmp/vempg -p 5433 -U postgres -d vem -f tests/mobile/fixtures.sql

# 3. Serveur
JWT_SECRET=local-test PORT=3000 npx ts-node-dev --transpile-only src/index.ts &

# 4. Contrôle (Playwright + Chromium déjà installés dans l'environnement Claude Code ;
#    ailleurs : npm i -D playwright && npx playwright install chromium)
node tests/mobile/audit.mjs                        # 6 appareils, ≈ 10 min
node tests/mobile/audit.mjs iphone14,ipad-portrait # seulement ceux-là
```

## Ce que l'outil ne voit pas

C'est Chromium en émulation, pas Safari. Restent à vérifier **sur un vrai iPhone, un vrai iPad et
un vrai Android** (liste de contrôle dans `docs/mobile/PROMPT_Refonte_Mobile_Tablette.md`, § Recette) :
défilement rapide à l'inertie, barre d'outils de Safari qui se replie, clavier qui couvre les
champs, geste retour (bord gauche iOS / retour Android), appareil photo, téléchargement des PDF.
