# rebuild 2026-06-02

# ── Étape 1 : module Plans Viewbox (React + TypeScript, sources dans plans/) → public/plans ──
# Étape séparée (Node 22, requis par Vite 8) : ses dépendances ne vont pas dans l'image finale.
FROM node:22-alpine AS plans-build
WORKDIR /build/plans
COPY plans/package*.json ./
RUN npm ci
COPY plans ./
RUN npm run build

# ── Étape 2 : backend VEM ──
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY src ./src/
COPY public ./public/
COPY --from=plans-build /build/public/plans ./public/plans/
# (supprimé) RUN npx prisma db pull --force || true
# ^ Cette ligne écrasait schema.prisma avec la base à chaque build.
#   schema.prisma est désormais la source de vérité.
RUN npx prisma generate && npm run build
EXPOSE 3000
# Au démarrage : on synchronise d'abord la BD avec le schema.prisma
# (ajoute/retire les colonnes nécessaires), PUIS on lance le serveur.
# --accept-data-loss permet à Prisma de modifier la structure sans
# demander de confirmation interactive (impossible en prod).
# NB : sur Railway, railway.toml (startCommand) remplace cette commande par
# "node dist/index.js" — les nouvelles tables sont créées par src/utils/migrations.ts.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
