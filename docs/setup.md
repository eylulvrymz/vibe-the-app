# Setup

## Requirements

- Python 3.11+
- Node.js 20+
- Java JDK 17+ or the portable JDK downloaded by `scripts/ensure-java-tools.ps1`

## Backend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ensure-java-tools.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-backend.ps1
```

The backend listens on:

```text
http://localhost:8080
```

The SQLite database is created at:

```text
.build\vibe.db
```

## Frontend

```powershell
cd apps\frontend
cmd /c npm install
cmd /c npm run dev
```

## Python Algorithms

```powershell
python -m unittest discover -s services\algorithms-python\tests
```
