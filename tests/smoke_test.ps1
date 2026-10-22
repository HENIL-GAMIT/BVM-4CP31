# Smoke test for Smart Dispatch API
# Run after starting backend: dotnet run --project backend

$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5000'
$headers = @{ 'Content-Type' = 'application/json' }

Write-Host "Logging in as admin..."
$defaultAdminAccepted = $false
$legacyAdminBody = @{ Email='admin@local'; Password='admin' } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body $legacyAdminBody -Headers $headers
    $defaultAdminAccepted = $true
} catch {}
if ($defaultAdminAccepted) {
    throw "The legacy default admin credentials were accepted."
}
$adminEmail = $env:BootstrapAdmin__Email
$adminPassword = $env:BootstrapAdmin__Password
if ([string]::IsNullOrWhiteSpace($adminEmail) -or [string]::IsNullOrWhiteSpace($adminPassword)) {
    throw "Set BootstrapAdmin__Email and BootstrapAdmin__Password before running the smoke test."
}
$loginBody = @{ Email=$adminEmail; Password=$adminPassword } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body $loginBody -Headers $headers
$headers['Authorization'] = "Bearer $($login.token)"
Write-Host "Admin authentication succeeded."

Write-Host "Creating hospital..."
$hospitalPassword = 'SmokeTest-Hospital-Password-1!'
$hBody = @{ HospitalName='City Hospital'; Address='Station Road'; Latitude=22.31; Longitude=73.19; ContactNumber='0123456789'; Password=$hospitalPassword; Status='Open' } | ConvertTo-Json
$h = Invoke-RestMethod -Uri "$base/api/hospitals" -Method Post -Body $hBody -Headers $headers
Write-Host "Hospital created:" $h.hospitalId
$hospitalPasswordReset = @{ Password=$hospitalPassword } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/api/hospitals/$($h.hospitalId)/password" -Method Put -Body $hospitalPasswordReset -Headers $headers | Out-Null

Write-Host "Creating ambulance..."
$driverPassword = 'SmokeTest-Driver-Password-1!'
$ambBody = @{ HospitalId=$h.hospitalId; VehicleNumber='GJ-01-TST-9999'; DriverName='Smoke Test Driver'; DriverPhone='9999990001'; Password=$driverPassword; Type='Basic'; Latitude=22.307; Longitude=73.181; Status='Available' } | ConvertTo-Json
$amb = Invoke-RestMethod -Uri "$base/api/ambulances" -Method Post -Body $ambBody -Headers $headers
Write-Host "Ambulance created:" $amb.ambulanceId
$driverPasswordReset = @{ Password=$driverPassword } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/api/ambulances/$($amb.ambulanceId)/password" -Method Put -Body $driverPasswordReset -Headers $headers | Out-Null

Write-Host "Submitting emergency request..."
$reqBody = @{ PatientName='Test Patient'; PatientPhone='9876543210'; EmergencyType='Accident'; Priority='Critical'; Latitude=22.3072; Longitude=73.1812; Address='Near Station' } | ConvertTo-Json
$req = Invoke-RestMethod -Uri "$base/api/emergency" -Method Post -Body $reqBody -Headers $headers
Write-Host "Request created:" $req.requestId

Write-Host "Finding nearest ambulance..."
$nearest = Invoke-RestMethod -Uri "$base/api/ambulances/nearest?lat=22.3072&lng=73.1812" -Method Get
Write-Host "Nearest ambulance:" $nearest.ambulanceId
if ($nearest.PSObject.Properties.Name -contains 'driverPhone') {
    throw "Public nearest-ambulance response exposed a driver phone number."
}
$publicHospitals = Invoke-RestMethod -Uri "$base/api/hospitals" -Method Get
if ($publicHospitals[0].PSObject.Properties.Name -contains 'contactNumber') {
    throw "Public hospital directory exposed a hospital contact number."
}
$publicHospital = Invoke-RestMethod -Uri "$base/api/hospitals/$($h.hospitalId)" -Method Get
if ($publicHospital.PSObject.Properties.Name -contains 'contactNumber') {
    throw "Public hospital details exposed a hospital contact number."
}
if ($nearest.PSObject.Properties.Name -contains 'passwordHash') {
    throw "Public nearest-ambulance response exposed a password hash."
}
$nearestHospital = Invoke-RestMethod -Uri "$base/api/hospitals/nearest?lat=22.3072&lng=73.1812" -Method Get
if ($nearestHospital.PSObject.Properties.Name -contains 'contactNumber') {
    throw "Public nearest-hospital response exposed a contact number."
}

Write-Host "Creating dispatch and dispatch call..."
$dispBody = @{ RequestId = $req.requestId; AmbulanceId = $amb.ambulanceId; HospitalId = $h.hospitalId } | ConvertTo-Json
$disp = Invoke-RestMethod -Uri "$base/api/dispatch" -Method Post -Body $dispBody -Headers $headers
Write-Host "Dispatch created:" $disp.dispatchId

Write-Host "Sending patient vitals from the assigned driver..."
$driverLoginBody = @{ Phone='9999990001'; VehicleNumber='GJ-01-TST-9999'; Password=$driverPassword } | ConvertTo-Json
$driverLogin = Invoke-RestMethod -Uri "$base/api/auth/driver-login" -Method Post -Body $driverLoginBody -Headers $headers
$driverLoginByPhoneBody = @{ Phone='9999990001'; Password=$driverPassword } | ConvertTo-Json
$driverLoginByPhone = Invoke-RestMethod -Uri "$base/api/auth/driver-login" -Method Post -Body $driverLoginByPhoneBody -Headers $headers
if ($driverLoginByPhone.ambulanceId -ne $amb.ambulanceId) {
    throw "Driver login without a vehicle number did not identify the driver's ambulance."
}
$wrongDriverLoginBody = @{ Phone='9999990001'; VehicleNumber='GJ-01-TST-9999' } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$base/api/auth/driver-login" -Method Post -Body $wrongDriverLoginBody -Headers $headers
    throw "Driver login accepted a request without a password."
} catch {
    if ($_.Exception.Message -eq "Driver login accepted a request without a password.") { throw }
}
$driverHeaders = @{ 'Content-Type'='application/json'; Authorization="Bearer $($driverLogin.token)" }
$ownAmbulance = Invoke-RestMethod -Uri "$base/api/ambulances/$($amb.ambulanceId)" -Method Get -Headers $driverHeaders
if ($ownAmbulance.ambulanceId -ne $amb.ambulanceId) {
    throw "Driver could not retrieve its own ambulance details."
}
if ($ownAmbulance.PSObject.Properties.Name -contains 'passwordHash') {
    throw "Ambulance response exposed a password hash."
}
$driverFleetAccepted = $false
try {
    Invoke-RestMethod -Uri "$base/api/ambulances" -Method Get -Headers $driverHeaders
    $driverFleetAccepted = $true
} catch {}
if ($driverFleetAccepted) {
    throw "Driver token was allowed to enumerate all ambulance contact details."
}
$vitalsBody = @{ HeartRate=108; BloodPressure='128/84'; Spo2=95 } | ConvertTo-Json
$vitals = Invoke-RestMethod -Uri "$base/api/dispatch/$($disp.dispatchId)/vitals" -Method Post -Body $vitalsBody -Headers $driverHeaders
Write-Host "Vitals saved for dispatch:" $vitals.dispatchId

Write-Host "Verifying hospital ER can read vitals..."
$hospitalLoginBody = @{ Phone='0123456789'; HospitalName='City Hospital'; Password=$hospitalPassword } | ConvertTo-Json
$hospitalLogin = Invoke-RestMethod -Uri "$base/api/auth/hospital-login" -Method Post -Body $hospitalLoginBody -Headers $headers
$wrongHospitalLoginBody = @{ Phone='0123456789'; HospitalName='City Hospital' } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$base/api/auth/hospital-login" -Method Post -Body $wrongHospitalLoginBody -Headers $headers
    throw "Hospital login accepted a request without a password."
} catch {
    if ($_.Exception.Message -eq "Hospital login accepted a request without a password.") { throw }
}
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
