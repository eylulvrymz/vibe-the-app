# Vibe

Vibe is a music-based social web app for posting songs, moods, captions, likes, follows, profile activity, and trending music posts.

The project is organized as a web-first app that can later be wrapped for Android with Capacitor or another PWA-to-native path.

## Project Structure

```text
apps/frontend              React PWA interface
apps/backend-java          Java HTTP API, auth, SQLite persistence
services/algorithms-python Python algorithms adapted from coursework
data                       SQLite schema and seed reference
docs                       Instructor progress notes and screenshots
scripts                    Local setup/run helpers
```

## Quick Start

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ensure-java-tools.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-backend.ps1
```

In another terminal:

```powershell
cd apps\frontend
cmd /c npm install
cmd /c npm run dev
```

Open the frontend URL shown by Vite. The backend defaults to `http://localhost:8080`.

Demo users are seeded with the password:

```text
vibe1234
```

Try `luna`, `mika`, or `nova`.

## Course Algorithm Reuse

The Python algorithm service adapts ideas from `Advanced-Algorithms-Programming-T27`:

- BST user lookup and friend-of-friend recommendations.
- Max-heap trending feed ranking.

See `docs/algorithm-notes.md` for attribution and complexity notes.
