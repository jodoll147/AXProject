# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS frontend
WORKDIR /source/app/frontend
COPY app/frontend/package.json app/frontend/pnpm-lock.yaml ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile
COPY app/frontend/ ./
COPY work/ /source/work/
RUN pnpm build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /source
COPY app/backend/AxBackend.csproj app/backend/
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    dotnet restore app/backend/AxBackend.csproj
COPY app/backend/ app/backend/
RUN dotnet publish app/backend/AxBackend.csproj -c Release --no-restore -o /publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app/app/backend
COPY --from=backend /publish/ ./
COPY --from=frontend /source/app/frontend/dist/ ./wwwroot/
RUN mkdir -p /var/lib/ax/keys && chown -R "$APP_UID":"$APP_UID" /var/lib/ax
ENV ASPNETCORE_URLS=http://+:8080 \
    AX_STATE_PATH=/var/lib/ax/app-state.json \
    AX_KEY_DIR=/var/lib/ax/keys
VOLUME ["/var/lib/ax"]
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "AxBackend.dll"]
