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

# Копируем исходники фронтенда из папки web
COPY web/ .

# Запускаем сборку
RUN npm test
RUN npm run build

# Stage 2: Serve
FROM nginx:stable-alpine

# Копируем конфиг nginx
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранные файлы
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
