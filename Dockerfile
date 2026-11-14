FROM node:20.19-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:20.19-alpine AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:20.19-alpine AS production-dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20.19-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libreoffice ttf-dejavu ttf-liberation font-noto \
  && soffice --version

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --chown=node:node package*.json ./

RUN mkdir -p uploads && chown node:node uploads

USER node

EXPOSE 3000

CMD ["npm", "start"]
