# Serves the console as static files. It talks to a gateway entirely from the
# browser — the endpoint and management key are entered at runtime — so this
# image carries no gateway configuration and no secrets.
FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app

# Dependencies first so edits to source do not invalidate the install layer.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# The console is a single-page app served read-only; running unprivileged means
# nginx cannot bind 80, so it listens on 8080 (see deploy/nginx.conf).
EXPOSE 8080
USER nginx
