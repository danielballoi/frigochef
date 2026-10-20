# ---- STAGE 1: build ----
# Stessa immagine Node che hai usato per il backend
FROM node:22-alpine AS build

WORKDIR /app


COPY package.json package-lock.json ./

RUN npm ci 

# Ora copia il resto del codice sorgente del frontend
COPY . .

# Comando che compila React/Vite (controlla "scripts" nel package.json del frontend)
RUN npm run build

# ---- STAGE 2: immagine finale, solo Nginx ----
FROM nginx:alpine

# Copia SOLO il risultato della build dalla fase precedente (non tutto il resto)
COPY --from=build /app/dist /usr/share/nginx/html

# Copia la tua configurazione Nginx (quella con location /api e try_files)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080