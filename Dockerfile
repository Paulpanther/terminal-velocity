# Build the Vite app
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_AI_URL
ARG VITE_AI_KEY
ARG VITE_AI_MODEL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve the built assets
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
