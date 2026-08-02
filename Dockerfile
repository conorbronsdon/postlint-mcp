# postlint-mcp — stdio MCP server for social post limit checks
# Build:  docker build -t postlint-mcp .
# Run:    docker run -i --rm postlint-mcp

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:22-alpine
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
