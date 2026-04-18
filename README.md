# minibook

`minibook` is a local-first PDF reader. PDFs stay on the device, and only reading progress is synced through Google Drive.

The app now has three parts:
- `web/`: the React + Vite frontend
- `server/`: a local Express server that handles Google OAuth, refresh tokens, and Drive API access
- `mobile/`: Expo app with a local-first Android/iOS reader and native Google OAuth setup in progress

This keeps the UX bundled into one local app while moving refresh-token handling out of the browser.

## Repo Layout

- `web/`: React + Vite SPA
- `server/`: local Express server for OAuth and Drive
- `mobile/`: Expo mobile app
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

## Mobile OAuth Setup

The mobile app uses native Google OAuth clients, not the local Express server OAuth flow.

Current mobile identifiers:
- Android package: `com.jaide.minibook`
- iOS bundle identifier: `com.jaide.minibook`
- App scheme: `minibook`

Create:

`mobile/.env`

You can copy from:

`mobile/.env.example`

Required values:

```env
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_android_oauth_client_id_here
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_oauth_client_id_here
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.your_ios_reversed_client_id_here
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_oauth_client_id_here
EXPO_PUBLIC_GOOGLE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive.file
```

Notes:
- these client IDs are public identifiers, not secrets
- mobile does not need a Google client secret in the app
- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is the reversed iOS client ID used by the native config plugin
- `mobile/.env` is gitignored

### Google Cloud Clients For Mobile

Create separate OAuth clients in Google Cloud for each platform:

1. Android client
- type: `Android`
- package name: `com.jaide.minibook`
- SHA-1: from your current Android signing config

2. iOS client
- type: `iOS`
- bundle ID: `com.jaide.minibook`

3. Web client
- type: `Web application`
- used by native Google Sign-In to provide `webClientId`
- needed for `idToken` and server-auth-code / offline-access style behavior

Do not reuse one mobile client for both platforms. You should end up with Android, iOS, and Web OAuth client IDs in the same Google Cloud project.

### Android SHA-1

For the current Expo Android dev build:

```powershell
cd mobile\android
.\gradlew signingReport
```

Use the `SHA1` value from the debug variant you are actually running.

### iOS URL Scheme

The native Expo config plugin for `@react-native-google-signin/google-signin` needs the iOS reversed client ID:

- example form: `com.googleusercontent.apps.1234567890-abcdef`

Get it from the iOS OAuth client in Google Cloud and place it in:

```env
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=...
```

### Mobile Auth Flow

Mobile auth no longer uses the broken browser custom-scheme OAuth path.

Instead:
- Android and iOS use native Google Sign-In
- the app stores session metadata locally in secure storage
- when the app needs Drive access later, it asks the native Google SDK for fresh access tokens

This is separate from the web callback:

- web/server callback: `http://localhost:3000/api/auth/callback`
- mobile sign-in: native Google Sign-In SDK flow

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

## Mobile Development

Install workspace dependencies from the repo root:

```bash
npm install
```

Then run the Expo dev client:

```bash
npm run dev:mobile
```

For Android native rebuilds after dependency/config changes:

```bash
cd mobile
npx expo run:android
```

Mobile auth requires:
- the app installed as a dev build
- `mobile/.env` populated
- Google Cloud Android/iOS OAuth clients created first
- a native rebuild after adding the Google Sign-In package or changing the config plugin

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

### Mobile Google Sign-In

1. Create the Android, iOS, and Web OAuth clients in Google Cloud
2. Fill in `mobile/.env`
3. Rebuild the native app:
   ```powershell
   cd mobile
   npx expo run:android
   ```
4. Run the mobile dev client
4. Open mobile Settings
5. Tap `Sign in with Google`
6. Complete the native Google sign-in flow
7. Confirm Settings shows the connected Google account

## Important Caveat

This is still a local server process, even though it is bundled into one app architecture. That is what allows the app to use OAuth code flow and store refresh tokens locally instead of relying on browser-only access tokens.
