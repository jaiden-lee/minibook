# minibook

`minibook` is a local-first PDF reader. PDFs stay on the device, and the planned sync model only uploads reading progress JSON files to Google Drive.

Current status:
- browser web app exists under `web/`
- local PDF import works
- local progress save/restore works
- optional Google sign-in and Drive sync are planned next

## Repo Layout

- `web/`: React + Vite browser app
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

## Run The Web App

From the repo root:

```bash
npm run dev:web
```

Then open the local Vite URL, usually:

```text
http://localhost:5173
```

## Build The Web App

From the repo root:

```bash
npm run build:web
```

## Environment Setup

The web app will use a local env file at:

`web/.env.local`

Create that file manually before working on Google sign-in.

Example:

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id_here
```

Notes:
- `web/.env.local` is the right place for local browser app secrets/config.
- `.env.local` is already ignored by git through the repo `.gitignore`.
- Vite only exposes variables prefixed with `VITE_` to browser code.

## Google OAuth Setup

For the browser app, create a Google OAuth 2.0 **Web application** client in Google Cloud.

You will need:
- a Google Cloud project
- Google Drive API enabled
- an OAuth 2.0 client ID for a web application
- authorized JavaScript origins including your local dev origin, usually `http://localhost:5173`

Put the **client ID** into:

`web/.env.local`

Example:

```env
VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
```

## What To Do With The Client Secret

For this browser app: do **not** put the OAuth client secret in the frontend.

Why:
- browser apps cannot keep a client secret secret
- anything shipped to the browser is visible to the user
- Google Identity Services for SPAs is designed to use the client ID only

So for the web app:
- use the **client ID**
- do **not** store the client secret in `web/.env.local`
- do **not** commit the client secret into this repo

If you create a web OAuth client in Google Cloud and it also shows a client secret, just leave it unused for this frontend-only flow.

## Current Web App Behavior

- importing PDFs stores a browser-local copy for reliability
- choosing a folder also stores a browser-local copy
- the PDF is identified by SHA-256 of its bytes
- progress is saved locally first
- Google Drive sync is not implemented yet

## Manual Testing

Basic test flow:

1. Run `npm run dev:web`
2. Import one or more PDFs
3. Open a PDF
4. Read in page-flip or scroll mode
5. Refresh and verify progress restores
6. Visit `/settings` and verify appearance changes apply globally

## Next Planned Stage

- optional Google sign-in with Google Identity Services
- Google Drive folder/file creation
- per-device progress JSON upload/download
- sync resolution on book open
