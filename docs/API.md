# API Contract

Base URL: `/` (backend serves minimal API)

Endpoints

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
