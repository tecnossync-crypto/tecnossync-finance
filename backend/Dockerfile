FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
ENV PORT=4100 UPLOAD_DIR=/data/uploads
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4100/api/health || exit 1
CMD ["node", "src/index.js"]
