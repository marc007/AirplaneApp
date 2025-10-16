# syntax=docker/dockerfile:1
FROM node:20-bullseye-slim AS dependencies

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate

FROM dependencies AS build

RUN npm run build && npm prune --omit=dev

FROM node:20-bullseye-slim AS production

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=dependencies /usr/src/app/prisma ./prisma

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
