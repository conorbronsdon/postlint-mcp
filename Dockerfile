# postlint-mcp — stdio MCP server for social post limit checks
# Build:  docker build -t postlint-mcp .
# Run:    docker run -i --rm postlint-mcp

# Pin the multi-architecture base for reproducible MCP Catalog builds.
# Dependabot checks the pinned node/alpine tag weekly for a new digest.
FROM node:26-alpine3.24@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:26-alpine3.24@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist

# No environment variables and no network access are needed at runtime. Grapheme
# counting requires full ICU, which the official node images ship by default —
# a slim ICU build would silently under-count Bluesky posts, so the server
# refuses to start without Intl.Segmenter.

USER node
CMD ["node", "dist/index.js"]
