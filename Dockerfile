FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
RUN npx playwright install --with-deps chrome

COPY --chown=node:node . .

RUN mkdir -p /data/pics /data/watch /data/watch-profile \
 && chown node:node /data/pics /data/watch /data/watch-profile

USER node
CMD ["node", "app.js"]
