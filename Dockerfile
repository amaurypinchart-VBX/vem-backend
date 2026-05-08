FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src/
COPY public ./public/

RUN npx prisma generate --no-engine && npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
