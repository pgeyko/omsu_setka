# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем конфиги npm из папки web
COPY web/package.json web/package-lock.json* ./
RUN npm install --legacy-peer-deps

# Передаем переменные окружения через build-args вместо копирования .env
# Это предотвращает попадание секретов в слои образа
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_CF_ANALYTICS_TOKEN
ENV VITE_CF_ANALYTICS_TOKEN=$VITE_CF_ANALYTICS_TOKEN

# Firebase Build Args
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_FIREBASE_VAPID_KEY

# Set ENV for Vite build
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID
ENV VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY

# Копируем исходники фронтенда из папки web
COPY web/ .

# Запускаем сборку
RUN npm test
RUN npm run build

# Инъекция секретов в Service Worker (который лежит в public и копируется в dist без обработки Vite)
RUN sed -i "s/VITE_FIREBASE_API_KEY/$VITE_FIREBASE_API_KEY/g" dist/firebase-messaging-sw.js && \
    sed -i "s/VITE_FIREBASE_AUTH_DOMAIN/$VITE_FIREBASE_AUTH_DOMAIN/g" dist/firebase-messaging-sw.js && \
    sed -i "s/VITE_FIREBASE_PROJECT_ID/$VITE_FIREBASE_PROJECT_ID/g" dist/firebase-messaging-sw.js && \
    sed -i "s/VITE_FIREBASE_STORAGE_BUCKET/$VITE_FIREBASE_STORAGE_BUCKET/g" dist/firebase-messaging-sw.js && \
    sed -i "s/VITE_FIREBASE_MESSAGING_SENDER_ID/$VITE_FIREBASE_MESSAGING_SENDER_ID/g" dist/firebase-messaging-sw.js && \
    sed -i "s/VITE_FIREBASE_APP_ID/$VITE_FIREBASE_APP_ID/g" dist/firebase-messaging-sw.js && \
    sed -i "s/VITE_FIREBASE_MEASUREMENT_ID/$VITE_FIREBASE_MEASUREMENT_ID/g" dist/firebase-messaging-sw.js

# Stage 2: Serve
FROM nginx:stable-alpine

# Копируем конфиг nginx
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранные файлы
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
