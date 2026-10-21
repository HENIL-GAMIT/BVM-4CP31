# BVM-4CP31
FINAL YEAR PROJECT

## Smart Emergency Response & Ambulance Dispatch System

Project scaffold for a college project combining a React frontend, .NET Minimal API backend and SQL Server database. The system provides a no-login emergency request flow (Get GPS + Call 108) and a dispatcher/admin flow for assigning ambulances.

Phases:
- Phase 1: Emergency page, POST /api/emergency, save requests
- Phase 2: Admin dashboard, ambulance management, assignment
- Phase 3: Nearest ambulance calc, hospital management, tracking

Quick start (development)

Backend (requires .NET 7+ and SQL Server):

```bash
cd backend
dotnet restore
dotnet build
# configure connection string in appsettings.Development.json
dotnet ef migrations add Init
dotnet ef database update
dotnet run
```

For local runs, set `ASPNETCORE_ENVIRONMENT=Development` first (`$env:ASPNETCORE_ENVIRONMENT='Development'` in PowerShell or `export ASPNETCORE_ENVIRONMENT=Development` in Bash).
Production runs must configure a private `Jwt:Key` of at least 32 bytes; the development signing-key fallback is disabled outside Development.

Frontend (requires Node 18+):

```bash
cd frontend
npm install
npm start
```

The desktop frontend opens with `npm start` (Expo SDK 57 web) and calls the backend at `http://localhost:5000`. Start the backend in another terminal first. The backend binds to `0.0.0.0:5000` so a physical phone on the same Wi-Fi can reach it. Expo Go automatically uses the host address from the Expo development server; set `EXPO_PUBLIC_API_URL=http://<computer-lan-ip>:5000` when automatic detection is not available. Use `npm run android` or `npm run ios` for the native emergency app.

Ambulances are assigned to a hospital through `HospitalId`. Hospital dispatch accepts only ambulances managed by that hospital, and driver login tokens carry the hospital ownership.

Notes:
- The `Call 108` button is a `tel:108` link and works offline.
- The scaffold uses EF Core and a SQL schema in `sql/schema.sql` as reference.
