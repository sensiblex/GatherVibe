FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
