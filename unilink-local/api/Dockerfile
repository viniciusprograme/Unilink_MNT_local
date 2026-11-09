FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# pastas de escrita (viram volumes no compose); dono = usuário "node"
RUN mkdir -p /app/uploads /app/logs && chown -R node:node /app/uploads /app/logs
USER node

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "server.js"]
