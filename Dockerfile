FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-pip ffmpeg

RUN pip3 install yt-dlp

COPY package.json .

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
