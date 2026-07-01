# Advanced Tasker — sync server image (for Railway).
#
# This builds ONLY the Node sync service in server/. It imports the tested merge
# code in src/ (pure TypeScript, no React/Expo), so both src/ and server/ are copied
# in. Railway auto-detects this Dockerfile and ignores the Expo app at the repo root.
FROM node:20-slim
WORKDIR /app

# Install server dependencies first for better layer caching.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install

# Shared pure-TS merge code, then the server itself.
COPY src ./src
COPY server ./server

WORKDIR /app/server
# Railway injects PORT; default 8080 for local `docker run`.
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
