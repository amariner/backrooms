FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

# Copy only the inputs needed by Vite; never package local credentials or tests.
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM nginx:stable-alpine AS runtime

ENV PORT=8080 \
    NGINX_ENVSUBST_FILTER="^PORT$"

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/backrooms

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

# Keep the official entrypoint: it substitutes PORT into the Nginx template.
CMD ["nginx", "-g", "daemon off;"]
