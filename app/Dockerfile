FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 8081 19000 19001
CMD ["npx", "expo", "start", "--lan"]
