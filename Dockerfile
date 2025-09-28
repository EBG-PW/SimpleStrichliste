# Dockerfile
FROM node:22-bookworm-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create storage directory for persistence (will be mounted over)
RUN mkdir -p /app/storage

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "index.js"]