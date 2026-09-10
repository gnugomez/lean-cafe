# Build stage — Nuxt 4 requires Node ^22.19 (or ^24.11)
FROM node:22-slim AS build
WORKDIR /app
COPY . .
# postinstall runs patch-package (y-webrtc fix) + nuxt prepare
RUN npm ci
RUN npm run build

# Runtime stage — only the self-contained Nitro output
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
