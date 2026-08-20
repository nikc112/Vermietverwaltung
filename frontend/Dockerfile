FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx-unprivileged statt nginx: derselbe nginx, aber als Benutzer 101 statt
# root und auf Port 8080 statt 80. Der unprivilegierte Port ist kein Zufall --
# nur fuer Ports unter 1024 braucht ein Prozess ueberhaupt Wurzelrechte, und
# ohne diesen Bedarf laesst sich dem Container jede Capability entziehen.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
