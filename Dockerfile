FROM node:alpine3.22

RUN apk update && apk add --no-cache \
    netcat-openbsd \
    && rm -rf /tmp/* /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY src/ ./src/

EXPOSE 8000

CMD ["npm", "start"]
