# BVM-4CP31
FINAL YEAR PROJECT

## Smart Emergency Response & Ambulance Dispatch System

Project scaffold for a college project combining a React frontend, .NET Minimal API backend and SQL Server database. The system provides a no-login emergency request flow (Get GPS + Call 108) and a dispatcher/admin flow for assigning ambulances.

Phases:
- Phase 1: Emergency page, POST /api/emergency, save requests
- Phase 2: Admin dashboard, ambulance management, assignment
- Phase 3: Nearest ambulance calc, hospital management, tracking

Quick start (development)

Backend (requires .NET 8; SQL Server is optional for local Development):

```bash
cd backend
dotnet restore
dotnet build
# SQL Server migrations are applied on startup. Development falls back to
# an in-memory database if SQL Server is unavailable.
dotnet run
```

For local runs, set `ASPNETCORE_ENVIRONMENT=Development` first (`$env:ASPNETCORE_ENVIRONMENT='Development'` in PowerShell or `export ASPNETCORE_ENVIRONMENT=Development` in Bash).
Production runs must configure a private `Jwt:Key` of at least 32 bytes; the development signing-key fallback is disabled outside Development.

There are no default administrator, hospital, or driver passwords. Before the first run, configure the initial administrator in the environment. PowerShell example:

```powershell
$env:BootstrapAdmin__Email = 'admin@example.com'
$secure = Read-Host 'Bootstrap admin password' -AsSecureString
$env:BootstrapAdmin__Password = [System.Net.NetworkCredential]::new('', $secure).Password
```

The bootstrap password must be 12–128 characters. The first administrator is created only when no administrator exists. The Admin UI requires a password when creating a hospital, and a hospital requires one when adding a driver. Existing hospital and driver records keep their data after migration but have no password until an administrator or owning hospital sets one using the password endpoints in [docs/API.md](docs/API.md).

Frontend (requires Node 18+):

Run the unified frontend on one UI port:

```bash
# From project root (PowerShell)
.\start_all_ui.ps1

# Or from frontend directory
cd frontend
npm run build
npm run start:web
```

The unified frontend is available at [http://localhost:3000](http://localhost:3000). It opens on the citizen emergency page without login. The top-right Login button accepts Admin, Hospital, or Ambulance Driver credentials and opens the matching role dashboard. Frontend API requests are proxied to the backend at `http://localhost:5000`.

### Native Expo apps

To view the native app on an Android phone, start the backend in one terminal, then run `npm start` from `frontend/`. Expo starts in LAN mode and displays a QR code. Scan that code with **Expo Go** on a phone connected to the same Wi-Fi as the computer. The app starts on the emergency request screen; use **Sign in** in the top-right corner to open the shared login for Admin, Hospital, and Driver accounts. Sign in with the registered email or phone and password to open the matching native dashboard. The dashboards support emergency dispatch/acceptance, ambulance fleet management, driver mission status, live GPS sharing, and patient vitals.

The app uses `EXPO_PUBLIC_API_URL` when configured; otherwise it uses the Expo host address on port 5000. The Android phone must be able to reach the backend over the network. Use the app's **Config** option only if you need to scan or enter a backend URL manually; that is separate from the Expo Go QR code.

### Login provisioning

- **Citizen Emergency**: No login required (default landing page)
- **Paramedic Driver**: Vehicle, registered phone, and separately configured password
- **Hospital ER Staff**: Registered phone and separately configured password
- **Command Center Admin**: Bootstrap administrator credentials configured in the environment

Notes:
- The `Call 108` button is a `tel:108` link and works offline.
- The scaffold uses EF Core and a SQL schema in `sql/schema.sql` as reference.
