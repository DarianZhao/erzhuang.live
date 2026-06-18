FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY scripts ./scripts
COPY src ./src

RUN mkdir -p /var/data

EXPOSE 8787
CMD ["npm", "start"]
