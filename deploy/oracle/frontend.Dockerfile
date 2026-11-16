FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# Use the Oracle Nginx reverse proxy. Never compile an old Render API URL.
ENV REACT_APP_BACKEND_URL="" CI=false NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/oracle/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
