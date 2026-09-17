FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg nodejs npm && \
    pip install --no-cache-dir -U "yt-dlp[default]" yt-dlp-ejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
