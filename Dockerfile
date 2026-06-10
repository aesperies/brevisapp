# Brevis production image. Railway currently builds via nixpacks.toml; this
# image gives parity for local dev (docker-compose) and any future host.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
