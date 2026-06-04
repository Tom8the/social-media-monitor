# Deployment Guide

This project now supports a production-style deployment on Windows servers.

## What to copy

Use the generated `release/social-media-monitor.zip` package, or copy the following folders/files:

- `server/src`
- `client/dist`
- `database`
- `.env.example`
- `start-production.bat`
- `start-production.ps1`

## Server requirements

- Windows Server 2019+ or Windows 10/11
- Node.js 18+
- Chrome installed on the machine
- MySQL 8.x reachable from the app server
- WeChat desktop installed if you use the Videohao/WeChat capture flow

## Setup steps

1. Unzip the release package to a permanent folder, for example `D:\apps\social-media-monitor`.
2. Create the MySQL database named `social_media_monitor`.
3. Import the SQL schema from `database/schema.sql` or `database/create_tables.sql`.
4. Create a `.env` file next to the package root by copying `.env.example`.
5. Fill in your database settings:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
6. Open PowerShell in the package root and run:

```powershell
cd D:\apps\social-media-monitor\server
npm install
npm start
```

7. Open the app at `http://127.0.0.1:3000`.

## Notes

- The backend now serves the built frontend from `client/dist` when that folder exists.
- For local development, keep using `start-local.bat`.
- For production deployment, use `start-production.bat` or `npm start` inside `server`.

## Publishing to GitHub

If you want to publish the cleaned source to GitHub, the usual flow is:

```bash
git init
git add .
git commit -m "Initial release"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

If you want a tagged release, add:

```bash
git tag v1.0.0
git push origin v1.0.0
```
