FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 3008
CMD ["node", "server.js"]

