# Smoke test for Smart Dispatch API
# Run after starting backend: dotnet run --project backend

$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5000'
$headers = @{ 'Content-Type' = 'application/json' }

Write-Host "Logging in as admin..."
$loginBody = @{ Email='admin@local'; Password='admin' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body $loginBody -Headers $headers
$headers['Authorization'] = "Bearer $($login.token)"
Write-Host "Admin authentication succeeded."

Write-Host "Creating hospital..."
$hBody = @{ HospitalName='City Hospital'; Address='Station Road'; Latitude=22.31; Longitude=73.19; ContactNumber='0123456789'; Status='Open' } | ConvertTo-Json
$h = Invoke-RestMethod -Uri "$base/api/hospitals" -Method Post -Body $hBody -Headers $headers
Write-Host "Hospital created:" $h.hospitalId

Write-Host "Creating ambulance..."
$ambBody = @{ HospitalId=$h.hospitalId; VehicleNumber='GJ-01-TST-9999'; DriverName='Smoke Test Driver'; DriverPhone='9999990001'; Type='Basic'; Latitude=22.307; Longitude=73.181; Status='Available' } | ConvertTo-Json
$amb = Invoke-RestMethod -Uri "$base/api/ambulances" -Method Post -Body $ambBody -Headers $headers
Write-Host "Ambulance created:" $amb.ambulanceId

Write-Host "Submitting emergency request..."
$reqBody = @{ PatientName='Test Patient'; PatientPhone='9876543210'; EmergencyType='Accident'; Priority='Critical'; Latitude=22.3072; Longitude=73.1812; Address='Near Station' } | ConvertTo-Json
$req = Invoke-RestMethod -Uri "$base/api/emergency" -Method Post -Body $reqBody -Headers $headers
Write-Host "Request created:" $req.requestId

Write-Host "Finding nearest ambulance..."
$nearest = Invoke-RestMethod -Uri "$base/api/ambulances/nearest?lat=22.3072&lng=73.1812" -Method Get
Write-Host "Nearest ambulance:" $nearest.ambulanceId

Write-Host "Creating dispatch and dispatch call..."
$dispBody = @{ RequestId = $req.requestId; AmbulanceId = $nearest.ambulanceId; HospitalId = $h.hospitalId } | ConvertTo-Json
$disp = Invoke-RestMethod -Uri "$base/api/dispatch" -Method Post -Body $dispBody -Headers $headers
Write-Host "Dispatch created:" $disp.dispatchId

Write-Host "Sending patient vitals from the assigned driver..."
$driverLoginBody = @{ Phone=$nearest.driverPhone; VehicleNumber=$nearest.vehicleNumber } | ConvertTo-Json
$driverLogin = Invoke-RestMethod -Uri "$base/api/auth/driver-login" -Method Post -Body $driverLoginBody -Headers $headers
$driverHeaders = @{ 'Content-Type'='application/json'; Authorization="Bearer $($driverLogin.token)" }
$vitalsBody = @{ HeartRate=108; BloodPressure='128/84'; Spo2=95 } | ConvertTo-Json
$vitals = Invoke-RestMethod -Uri "$base/api/dispatch/$($disp.dispatchId)/vitals" -Method Post -Body $vitalsBody -Headers $driverHeaders
Write-Host "Vitals saved for dispatch:" $vitals.dispatchId

Write-Host "Verifying hospital ER can read vitals..."
$hospitalLoginBody = @{ Phone=$h.contactNumber; HospitalName=$h.hospitalName } | ConvertTo-Json
$hospitalLogin = Invoke-RestMethod -Uri "$base/api/auth/hospital-login" -Method Post -Body $hospitalLoginBody -Headers $headers
$hospitalHeaders = @{ Authorization="Bearer $($hospitalLogin.token)" }
$receivedVitals = Invoke-RestMethod -Uri "$base/api/dispatch/$($disp.dispatchId)/vitals" -Method Get -Headers $hospitalHeaders
if ($receivedVitals.heartRate -ne 108 -or $receivedVitals.bloodPressure -ne '128/84' -or $receivedVitals.spo2 -ne 95) {
    throw "Hospital ER did not receive the submitted vitals."
}
Write-Host "Hospital ER received heart rate, blood pressure, and SpO2."

Write-Host "Verifying anonymous emergency listing is rejected..."
$anonymousAccepted = $false
try {
    Invoke-RestMethod -Uri "$base/api/emergency" -Method Get
    $anonymousAccepted = $true
} catch {}
if ($anonymousAccepted) {
    throw "Anonymous access to the emergency list was accepted."
}
$hospitalListAccepted = $false
try {
    Invoke-RestMethod -Uri "$base/api/emergency" -Method Get -Headers $hospitalHeaders
    $hospitalListAccepted = $true
} catch {}
if ($hospitalListAccepted) {
    throw "Hospital access to the admin-only emergency list was accepted."
}

Write-Host "Logging dispatch call to 9313771258..."
$callBody = @{ DispatchId = $disp.dispatchId; PhoneNumber = '9313771258'; Note = 'Automated verification call from smoke test' } | ConvertTo-Json
$call = Invoke-RestMethod -Uri "$base/api/call" -Method Post -Body $callBody -Headers $headers
Write-Host "Call logged id:" $call.callLogId

Write-Host "Listing dispatches..."
Invoke-RestMethod -Uri "$base/api/dispatch" -Method Get -Headers $headers | ConvertTo-Json -Depth 5 | Write-Host

Write-Host "Smoke test completed."
