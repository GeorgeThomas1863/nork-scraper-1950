FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

RUN mkdir -p /data/pics && chown node:node /data/pics

USER node
CMD ["node", "app.js"]
