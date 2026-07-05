# Serene — Deployment Guide

Three deployables: **backend API** (Docker), **mobile web** (static/PWA via Docker),
and **native iOS/Android** (EAS). All were build-verified.

---

## 1. Backend API (production)

```bash
cd backend
export JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
export POSTGRES_PASSWORD='<a-strong-password>'
export CORS_ORIGINS='https://app.serene.example'   # explicit, never *
export GEMINI_API_KEY='<your free Google AI Studio key>'   # and/or OPENROUTER_API_KEY
docker compose -f docker-compose.prod.yml up -d --build
```

The prod stack: `ENVIRONMENT=production` (fails fast on a weak JWT secret, mock billing,
or `CORS=*`), no `--reload`, no source mount, DB not exposed to the host, non-root
container, `restart: unless-stopped`. Put it behind a TLS-terminating reverse proxy
(Caddy/Traefik/nginx) and point your domain at `:8000` (override with `API_PORT`).

> Schema note: the app creates tables on first boot (`create_all`, no migrations yet).
> If you change models later, run a migration or reset the volume (`down -v`) in dev.

## 2. Mobile — Web build (PWA / static hosting)

Static bundle (deploy `dist/` to Netlify, Vercel, S3+CloudFront, GitHub Pages, …):
```bash
cd app-mobile
EXPO_PUBLIC_API_URL=https://api.serene.example npx expo export --platform web
# → app-mobile/dist/  (index.html + /_expo bundle + /assets fonts)
```

Or ship the self-contained **nginx image** (built & verified here):
```bash
docker build -t serene-mobile-web \
  --build-arg EXPO_PUBLIC_API_URL=https://api.serene.example ./app-mobile
docker run -p 8080:80 serene-mobile-web      # → http://localhost:8080
```
The API URL is baked in at build time, so rebuild per environment.

## 3. Mobile — Native iOS/Android (EAS)

Native builds (incl. real AdMob + RevenueCat, which need a custom dev build) use EAS —
config in `app-mobile/eas.json`:
```bash
cd app-mobile
npm i -g eas-cli && eas login
# enable the optional native modules for ads/IAP:
npx expo install react-native-google-mobile-ads react-native-purchases
eas build --profile production --platform all      # .aab / .ipa
eas submit --profile production --platform all     # to Play / App Store
```
Set per-profile env in `eas.json` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_REVENUECAT_KEY`,
`EXPO_PUBLIC_ADMOB_*`, `EXPO_PUBLIC_MONETIZATION`). Keep backend `MONETIZATION_MODE` in sync.

---

## Local full-stack test (what was run to verify this)
```bash
cd backend && cp .env.example .env       # add GEMINI_API_KEY for live chat
API_PORT=8010 docker compose up -d --build
# API:  http://localhost:8010/health  ·  docs: /docs
docker build -t serene-mobile-web --build-arg EXPO_PUBLIC_API_URL=http://localhost:8010 ./app-mobile
docker run -d -p 19006:80 serene-mobile-web
# Web app: http://localhost:19006
```

## Pre-launch checklist (see `backend/SECURITY.md`)
- [x] Prod fail-fast on weak JWT secret · mock billing off · explicit CORS · non-root container
- [ ] Rate limiting on `/auth` and `/chat`; refresh tokens
- [ ] Account deletion / data export (RGPD); encrypt chat & mood at rest
- [ ] Clinician review of crisis detection
- [ ] A real `GEMINI_API_KEY` or `OPENROUTER_API_KEY` (chat returns 503 without one)
