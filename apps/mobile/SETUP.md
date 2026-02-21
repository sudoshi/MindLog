# MindLog Mobile App — Setup

## Moving COPE-new into the monorepo

The patient mobile app is based on the COPE-new Expo boilerplate at:
`/Users/sudoshi/GitHub/ProjectCOPE/COPE-new/`

To complete the monorepo integration, copy the following from COPE-new into `apps/mobile/`:

```bash
# From the monorepo root:
cp -r /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/app ./apps/mobile/
cp -r /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/assets ./apps/mobile/
cp -r /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/components ./apps/mobile/
cp -r /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/constants ./apps/mobile/
cp -r /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/hooks ./apps/mobile/
cp -r /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/scripts ./apps/mobile/
cp /Users/sudoshi/GitHub/ProjectCOPE/COPE-new/expo-env.d.ts ./apps/mobile/
```

**Do NOT copy** `node_modules/`, `package.json`, `tsconfig.json`, `app.json`, or `yarn.lock` —
these are replaced by the versions in `apps/mobile/`.

## After copying files

```bash
# Install dependencies (from monorepo root)
npm install

# Verify TypeScript
npm run typecheck --filter=@mindlog/mobile

# Start in development
cd apps/mobile && npx expo start
```

## Required native dependencies (install after copying)

Run inside `apps/mobile/`:

```bash
npx expo install @nozbe/watermelondb expo-secure-store expo-local-authentication expo-build-properties
```

Then rebuild native modules:

```bash
npx expo run:ios
# or
npx expo run:android
```

## Key changes from COPE-new

| Setting | COPE-new | MindLog |
|---|---|---|
| App name | `COPE-new` | `MindLog` |
| Slug | `COPE-new` | `mindlog` |
| Bundle ID (iOS) | `com.anonymous.COPE-new` | `com.mindlog.app` |
| Android package | — | `com.mindlog.app` |
| URL scheme | `myapp` | `mindlog` |
| Splash background | `#ffffff` | `#0c0f18` |
| New dependencies | — | WatermelonDB, expo-secure-store, expo-local-authentication |

## Offline sync (WatermelonDB)

WatermelonDB requires native build configuration. See Phase 2 implementation notes.
The offline-first architecture:
- All patient check-in data is written locally first (WatermelonDB/SQLite)
- Background sync to API when network is available
- Conflict resolution: last-write-wins per `entry_date` (one entry per day constraint)
