# ====================================================================================
# Dockerfile — POVOD backend (Node.js + Express)
# ====================================================================================
#   - Две стадии: в первой TypeScript компилируется, во вторую попадает только
#     результат и production-зависимости. Раньше образ нёс исходники и запускал
#     их через tsx, то есть компилировал заново при каждом старте контейнера.
#   - Non-root: процесс работает от пользователя node.
#   - PERSIST=false: контейнер stateless, данные сеются при старте.
# ====================================================================================

ARG NODE_VERSION=22
ARG REGISTRY=""

# ------------------------------------------------------------------ сборка
FROM ${REGISTRY}node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# Сначала только манифесты — для кеша слоя установки зависимостей.
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# --------------------------------------------------------------- исполнение
FROM ${REGISTRY}node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PERSIST=false
ENV PORT=8080
ENV HOST=0.0.0.0

COPY package.json package-lock.json* ./
# Без dev-зависимостей: компилятор и тестовый раннер в образе не нужны.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health | grep -q '"status"' || exit 1

CMD ["node", "dist/index.js"]
