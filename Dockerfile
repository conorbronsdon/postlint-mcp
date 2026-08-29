# postlint-mcp — stdio MCP server for social post limit checks
# Build:  docker build -t postlint-mcp .
# Run:    docker run -i --rm postlint-mcp

# Pin the multi-architecture base for reproducible MCP Catalog builds.
# Dependabot checks the Node 22 / Alpine 3.24 tag weekly for a new digest.
FROM node:22-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:22-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
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
