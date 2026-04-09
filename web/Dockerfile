# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем конфиги npm из папки web
COPY web/package.json web/package-lock.json* ./
RUN npm install --legacy-peer-deps

# Копируем .env из корня в корень папки сборки
COPY .env .env

# Копируем исходники фронтенда из папки web
COPY web/ .

# Запускаем тесты и сборку
# Vite найдет .env в текущей директории (/app)
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
