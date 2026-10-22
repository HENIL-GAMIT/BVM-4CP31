# API Contract

Base URL: `/` (backend serves minimal API)

Endpoints

- POST `/api/auth/login`
  - Body: `{ "email": "admin@example.com", "password": "..." }`
  - The initial administrator is provisioned using `BootstrapAdmin:Email` and `BootstrapAdmin:Password`; there is no default admin password.
- POST `/api/auth/driver-login`
  - Body: `{ "phone": "...", "password": "..." }`; `vehicleNumber` is optional when the phone number identifies exactly one ambulance.
- POST `/api/auth/hospital-login`
  - Body: `{ "phone": "...", "hospitalName": "...", "password": "..." }`
- Passwords must be 12–128 characters and are stored as salted password hashes.
- POST `/api/hospitals`
  - Admin JWT required. Include a `password` when creating a hospital.
- POST `/api/ambulances`
  - Admin or owning Hospital JWT required. Include a `password` when creating a driver account.
- PUT `/api/hospitals/{id}/password`
  - Admin JWT required. Sets or resets a hospital password, including for migrated existing records.
- PUT `/api/ambulances/{id}/password`
  - Admin JWT or the owning Hospital JWT required. Sets or resets a driver password.
- GET `/api/hospitals` and GET `/api/hospitals/{id}`
  - Public directory data only; contact numbers and credential hashes are omitted.
- GET `/api/hospitals/managed`
  - Admin JWT required. Returns hospital management data including contact numbers.
- GET `/api/ambulances/nearest`
  - Public nearest-ambulance details omit driver phone numbers and credential hashes.
- GET `/api/ambulances`
  - Admin JWT required.
- GET `/api/ambulances/{id}`
  - Admin, the ambulance's owning Hospital, or its assigned Driver JWT required.

- POST `/api/emergency`
  - Body: { patientName, patientPhone, emergencyType, priority, latitude, longitude, address }
  - Response: 201 Created with saved request

- GET `/api/emergency`
  - Admin JWT required.
  - Response: 200 OK array of EmergencyRequest

- GET `/api/emergency/{id}`
  - Admin JWT, or the assigned driver's/hospital's JWT required.
  - Response: 200 OK single EmergencyRequest or 404

- GET `/api/ambulances`
- POST `/api/ambulances`
- POST `/api/dispatch` (body: requestId, ambulanceId, hospitalId)
- GET `/api/emergency/available-for-hospital/{hospitalId}`
  - Hospital JWT for the matching hospital required.
- POST `/api/emergency/{requestId}/accept?hospitalId={hospitalId}&ambulanceId={ambulanceId}`
  - Hospital JWT for the matching hospital required. `ambulanceId` is optional; when omitted, the nearest available ambulance is selected.
- POST `/api/dispatch/{dispatchId}/vitals`
  - Assigned driver JWT required.
  - Body: `{ "heartRate": 108, "bloodPressure": "128/84", "spo2": 95 }`
  - Stores the latest vitals for that dispatch and returns the saved report.
- GET `/api/dispatch/{dispatchId}/vitals`
  - Assigned hospital/driver or admin JWT required.
  - Response: latest report with `heartRate`, `bloodPressure`, `spo2`, and `recordedAt`; 404 if none has been sent.
