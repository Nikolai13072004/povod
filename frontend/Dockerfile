# ====================================================================================
# Dockerfile - React Frontend (Vite -> nginx)
# ====================================================================================
# Для использования с frontend-сценарием:
#   ENABLE_FRONTEND=true
#   CONTAINER_PORT=80
#
# Особенности:
#   - Multi-stage build: Node.js (сборка Vite) -> nginx:alpine (раздача статики)
#   - Финальный образ содержит только nginx + dist/, Node.js в финал не попадает
#   - GitLab Dependency Proxy: ARG REGISTRY ускоряет pull базовых образов
#   - Non-root: nginx запускается от пользователя nginx
#   - nginx.conf из репозитория поддерживает client-side routing React Router
#
# ARG REGISTRY      - префикс реестра (default: пусто = Docker Hub напрямую)
# ARG NODE_VERSION  - версия Node.js
# ARG VITE_API_URL  - URL backend API, доступный в React-коде как import.meta.env.VITE_API_URL
# ====================================================================================

ARG NODE_VERSION=20
ARG REGISTRY=""

# ── Стадия 1: установка зависимостей ──────────────────────────────────────────
FROM ${REGISTRY}node:${NODE_VERSION}-alpine AS deps

WORKDIR /app

# Копируем только package.json — этого достаточно для npm install
COPY package.json ./

RUN npm install

# ── Стадия 2: сборка Vite ──────────────────────────────────────────────────────
FROM deps AS builder

ARG VITE_API_URL=""

ENV NODE_ENV=production
ENV VITE_API_URL=${VITE_API_URL}

COPY . .

# Vite: npm run build -> dist/
RUN npm run build

# ── Стадия 3: nginx для раздачи статики ───────────────────────────────────────
FROM ${REGISTRY}nginx:alpine AS final

# Non-root: меняем владельца рабочих директорий nginx
RUN mkdir -p /run /var/run /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
  && touch /run/nginx.pid \
  && touch /var/run/nginx.pid \
  && chown -R nginx:nginx /run /var/run /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

# nginx.conf с поддержкой React Router (client-side routing)
# Файл nginx.conf должен лежать рядом с Dockerfile в репозитории команды
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Собранный Vite-бандл
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/ | grep -q '<' || exit 1

CMD ["nginx", "-g", "daemon off;"]
