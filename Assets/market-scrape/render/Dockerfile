FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
RUN npm init -y >/dev/null && npm i playwright-core@1.64.1 --omit=dev --no-audit --no-fund
COPY server.mjs .
USER pwuser
CMD ["node","server.mjs"]
