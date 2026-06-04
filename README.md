# Social Media Monitor

A Windows-friendly social media monitoring app for Douyin, Xiaohongshu, and Videohao.

## What it does

- Account onboarding via QR login, public monitoring, and desktop-assisted capture
- Video and post collection into MySQL
- Frontend dashboard for accounts, videos, and sync status
- Production deployment with the frontend served by the backend

## Quick start

Use the local development launcher:

```bat
start-local.bat
```

This starts:

- Backend on `http://127.0.0.1:3000`
- Frontend on `http://127.0.0.1:5173`

## Production package

Create the deployment bundle with:

```powershell
powershell -ExecutionPolicy Bypass -File .\package-release.ps1
```

The resulting ZIP is written to `release/social-media-monitor.zip`.

## Deployment guide

See [DEPLOYMENT.md](./DEPLOYMENT.md).
