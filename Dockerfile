FROM node:22-bookworm-slim
WORKDIR /usr/src/app
RUN apt-get update -y && apt-get install -y openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]