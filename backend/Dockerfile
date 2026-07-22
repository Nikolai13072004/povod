# ====================================================================================
# Dockerfile — POVOD backend (Node.js + Express, запуск через tsx)
# ====================================================================================
#   - Один слой зависимостей (prod), исходники монтируются как есть и исполняются tsx.
#   - Non-root: процесс работает от пользователя node.
#   - PERSIST=false: контейнер stateless, данные сеются при старте.
# ====================================================================================

ARG NODE_VERSION=20
ARG REGISTRY=""

FROM ${REGISTRY}node:${NODE_VERSION}-alpine AS base
WORKDIR /app

ENV NODE_ENV=production
ENV PERSIST=false
ENV PORT=8080
ENV HOST=0.0.0.0

# Сначала только манифест — для кеша слоя npm install
COPY package.json ./
RUN npm install --omit=dev

# Исходники
COPY . .

USER node

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health | grep -q '"status"' || exit 1

CMD ["npm", "start"]
