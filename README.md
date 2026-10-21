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
s
To run all specialized UIs simultaneously on their dedicated ports:

```bash
# Option A: From project root (PowerShell)
.\start_all_ui.ps1

# Option B: From frontend directory
cd frontend
npm start
```

### Dedicated UI Port Mapping

The frontend is separated into dedicated real-world micro-frontend interfaces:

| Port | Interface | URL | Real-World Capabilities |
| :--- | :--- | :--- | :--- |
| **3001** | **Citizen Emergency SOS** | [http://localhost:3001](http://localhost:3001) | One-touch SOS distress trigger, 8 medical emergency classifications, conscious/breathing triage checklist, live GPS tracking of assigned ambulance, moving map route, interactive audio-visual CPR metronome (110 bpm), bleed control guide, and direct 108 helpline integration. |
| **3002** | **Hospital ER & Paramedic Driver** | [http://localhost:3002](http://localhost:3002) | **Paramedic MDT**: 5-stage mission stepper (En Route -> On Scene -> Loaded -> Handover), continuous GPS broadcast with movement simulation, pre-hospital vitals telemetry uplink (HR, BP, SpO2, GCS), Green Corridor preemption request.<br>**Hospital ER Console**: Real-time incoming trauma patient board with live vitals, emergency bed management (ICU, Trauma Bays 1 & 2), and local emergency request acceptance. |
| **3003** | **Command Center & Analytics** | [http://localhost:3003](http://localhost:3003) | Tactical city map with all active emergencies, ambulances, and trauma centers; 1-click nearest ambulance auto-dispatch engine; municipal Green Corridor traffic signal preemption switchboard; 24-hour demand heat curve & category analytics; searchable mission history audit logs with CSV export. |
| **3000** | **Master Mission Control Hub** | [http://localhost:3000](http://localhost:3000) | Central launcher and architecture overview linking directly to all 3 operational portals with live port health monitoring. |

Every UI also includes a top **Port Navigation Banner** allowing one-click switching or side-by-side multi-window presentation for demonstrations. All `/api/*` requests across all ports are automatically proxied to the backend at `http://localhost:5000`.

### Native Expo apps

Run `npm run android` or `npm run ios` from `frontend/` to open the native Expo app. Choose **Patient Emergency Scanner** or **Driver Portal Scanner** to get the role-specific QR scanner, then scan a QR code containing the backend URL (for example, `http://192.168.1.10:5000`) or enter it manually. The existing web UI ports remain unchanged.
The native driver mission screen can send patient vitals to the assigned hospital ER; the hospital console refreshes the latest report automatically.

### Pre-Configured Demo Credentials

- **Citizen Emergency (:3001)**: No login required (instant access)
- **Paramedic Driver (:3002)**: Vehicle `GJ-01-EM-1080` / Phone `9999999999` (One-click auto-fill provided)
- **Hospital ER Staff (:3002)**: Hospital `City Emergency Trauma Center` / Phone `02652223344` (One-click auto-fill provided)
- **Command Center Admin (:3003)**: Email `admin@local` / Password `admin` (One-click auto-fill provided)

Notes:
- The `Call 108` button is a `tel:108` link and works offline.
- The scaffold uses EF Core and a SQL schema in `sql/schema.sql` as reference.
