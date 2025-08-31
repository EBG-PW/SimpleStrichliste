# ---- Stage 1: Build ----
FROM node:22 AS builder

WORKDIR /usr/src/app
COPY package*.json ./

RUN npm ci

COPY . .

# ---- Stage 2: Production ----
FROM node:22-slim

# Set the working directory
WORKDIR /usr/src/app

# Set the node environment to production
ENV NODE_ENV=production

# Copy the built node_modules from the 'builder' stage.
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy the application code from the 'builder' stage.
COPY --from=builder /usr/src/app .

# Install only the production dependencies.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    npm rebuild better-sqlite3 megahash && \
    apt-get purge -y --auto-remove python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Define volumes for persistent data.
VOLUME ["/usr/src/app/storage"]

EXPOSE 3000

# The command to start your application.
CMD [ "node", "./index.js" ]

