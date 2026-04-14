# Mobile App

This is the Expo-based mobile client for `minibook`.

## Current scope

This first mobile pass includes:

- local-only library shell
- mobile settings shell
- PDF import into app-local storage
- SQLite metadata/progress storage
- shared `BookRecord` / `ProgressRecord` / sync-core reuse
- reader shell with local progress save/restore plumbing

The actual native PDF surface is intentionally still a placeholder in this first pass. The next mobile pass will replace it with `react-native-pdf` inside a custom Expo development build.

## Run in development

From the repo root:

```bash
npm run dev:mobile
```

Or from `mobile/`:

```bash
npx expo start --dev-client
```

## Important note about Expo Go

The real mobile PDF viewer will require native modules, so this app is meant to run in a custom Expo development build, not plain Expo Go.

Typical flow:

1. Install dependencies
2. Build a development client
3. Run `npx expo start --dev-client`
4. Open the project on a simulator/emulator/device

## Next mobile step

Replace the placeholder reader surface with the native `react-native-pdf` viewer and validate:

- local PDF rendering
- vertical reading
- page jump
- fit-to-width behavior
- text selection
- link behavior
