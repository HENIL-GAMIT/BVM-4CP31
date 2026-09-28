# API Contract

Base URL: `/` (backend serves minimal API)

Endpoints

- POST `/api/emergency`
  - Body: { patientName, patientPhone, emergencyType, priority, latitude, longitude, address }
  - Response: 201 Created with saved request

- GET `/api/emergency`
  - Response: 200 OK array of EmergencyRequest

- GET `/api/emergency/{id}`
  - Response: 200 OK single EmergencyRequest or 404

- GET `/api/ambulances`
- POST `/api/ambulances`
- POST `/api/dispatch` (body: requestId, ambulanceId, hospitalId)
