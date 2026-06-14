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
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
