FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_FILE=/app/data/absensi.json
EXPOSE 3000
# Pasang volume di /app/data supaya data absensi tidak hilang saat server restart
VOLUME ["/app/data"]
CMD ["node", "server.js"]
