# rebuild 2026-06-02
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --legacy-peer-deps
COPY tsconfig.json ./
COPY src ./src/
COPY public ./public/
# (supprimé) RUN npx prisma db pull --force || true
# ^ Cette ligne écrasait schema.prisma avec la base à chaque build.
#   schema.prisma est désormais la source de vérité.
RUN npx prisma generate && npm run build
EXPOSE 3000
# Au démarrage : on synchronise d'abord la BD avec le schema.prisma
# (ajoute/retire les colonnes nécessaires), PUIS on lance le serveur.
# --accept-data-loss permet à Prisma de modifier la structure sans
# demander de confirmation interactive (impossible en prod).
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]