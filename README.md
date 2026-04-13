# minibook

`minibook` is a local-first PDF reader. PDFs stay on the device, and only reading progress is synced through Google Drive.

The app now has two parts:
- `web/`: the React + Vite frontend
- `server/`: a local Express server that handles Google OAuth, refresh tokens, and Drive API access

This keeps the UX bundled into one local app while moving refresh-token handling out of the browser.

## Repo Layout

- `web/`: React + Vite SPA
- `server/`: local Express server for OAuth and Drive
- `mobile/`: future Expo app
- `packages/shared-types`: shared TypeScript types
- `packages/sync-core`: sync and progress logic

## Requirements

- Node.js 20+ recommended
- npm
- Chrome or Edge recommended for folder access testing

## Install

From the repo root:

```bash
npm install
```

## Server Environment

Create:

`server/.env.local`

You can copy from:

`server/.env.example`

Required values:

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
PORT=3000
```

Notes:
- `server/.env.local` is gitignored.
- The browser no longer needs `VITE_GOOGLE_CLIENT_ID`.
- The Google client secret now belongs on the local server only, not in the frontend.

## Google Cloud Setup

Create a Google OAuth 2.0 **Web application** client.

You need:
- Google Drive API enabled
- an OAuth client ID
- a client secret
- an authorized redirect URI:
  - `http://localhost:3000/api/auth/callback`

Important:
- this is now server-side OAuth code flow
- the callback must point to the Express server
- if you previously configured browser-only GIS origins for the old flow, those are no longer the important part for auth

## Development

Run the local server:

```bash
npm run dev:server
```

In another terminal, run the frontend:

```bash
npm run dev:web
```

Development URLs:
- frontend: `http://localhost:5173`
- local server: `http://localhost:3000`

How dev works:
- Vite serves the frontend
- Vite proxies `/api/*` requests to the Express server
- the frontend can call `/api/...` without caring about ports

No nginx is needed.

## Bundled Local Run

To build the SPA and serve it from Express:

```bash
npm run start:app
```

What this does:
1. builds the Vite app into `web/dist`
2. starts the Express server
3. Express serves both:
   - the built frontend
   - the `/api/*` routes

In this mode, the app runs from:

`http://localhost:3000`

## Current Behavior

- PDFs are stored locally in the browser
- progress is saved locally first
- Google OAuth and Drive access now run through the local server
- refresh tokens are stored locally on disk at:
  - `.local-auth/google-oauth.json`
- the server refreshes access tokens when needed
- Google Drive stores progress under:
  - `/minibook/progress/<book_id>/<device_id>.json`

## Commands

Frontend dev:

```bash
npm run dev:web
```

Server dev:

```bash
npm run dev:server
```

Frontend build:

```bash
npm run build:web
```

Bundled local app:

```bash
npm run start:app
```

Server-only run against an already built frontend:

```bash
npm run start:server
```

## Manual Testing

### Local Reader

1. Run `npm run dev:server`
2. Run `npm run dev:web`
3. Open `http://localhost:5173`
4. Import PDFs
5. Open a book and verify local progress restore still works

### Google Sign-In

1. Go to `/settings`
2. Click `Sign in with Google`
3. Complete the Google consent flow
4. Verify settings and the sidebar show connected state

### Drive Sync

1. Open a book
2. Move to a page with saved progress
3. Click `Sync Now`
4. Verify Drive contains:
   - `minibook`
   - `progress`
   - `<book_id>`
   - `<device_id>.json`

### Refresh Token Flow

1. Sign in once
2. Confirm `.local-auth/google-oauth.json` exists
3. Click `Sync Now`
4. Close and reopen the app
5. Confirm you do not need to re-consent every time
6. Confirm syncing still works

## Important Caveat

This is still a local server process, even though it is bundled into one app architecture. That is what allows the app to use OAuth code flow and store refresh tokens locally instead of relying on browser-only access tokens.
