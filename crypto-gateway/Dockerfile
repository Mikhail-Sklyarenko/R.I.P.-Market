FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
RUN npm run prisma:generate

COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma prisma.config.ts ./
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
RUN npm run prisma:generate

EXPOSE 3001

CMD ["node", "dist/api/server.js"]
