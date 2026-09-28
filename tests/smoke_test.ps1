# Smoke test for Smart Dispatch API
# Run after starting backend: dotnet run --project backend

$base = 'http://localhost:5000'
$headers = @{ 'Content-Type' = 'application/json' }

Write-Host "Logging in as admin..."
$loginBody = @{ Email='admin@local'; Password='admin' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body $loginBody -Headers $headers
$headers['Authorization'] = "Bearer $($login.token)"
Write-Host "Admin authentication succeeded."

Write-Host "Creating hospital..."
$hBody = @{ HospitalName='Demo Hospital'; Address='Demo Address'; Latitude=22.31; Longitude=73.19; ContactNumber='0123456789'; Status='Open' } | ConvertTo-Json
$h = Invoke-RestMethod -Uri "$base/api/hospitals" -Method Post -Body $hBody -Headers $headers
Write-Host "Hospital created:" $h.hospitalId

Write-Host "Creating ambulance..."
$ambBody = @{ HospitalId=$h.hospitalId; VehicleNumber='GJ-01-DEM'; DriverName='Demo Driver'; DriverPhone='9999999999'; Type='Basic'; Latitude=22.307; Longitude=73.181; Status='Available' } | ConvertTo-Json
$amb = Invoke-RestMethod -Uri "$base/api/ambulances" -Method Post -Body $ambBody -Headers $headers
Write-Host "Ambulance created:" $amb.ambulanceId

Write-Host "Submitting emergency request..."
$reqBody = @{ PatientName='Test Patient'; PatientPhone='9876543210'; EmergencyType='Accident'; Priority='Critical'; Latitude=22.3072; Longitude=73.1812; Address='Near demo' } | ConvertTo-Json
$req = Invoke-RestMethod -Uri "$base/api/emergency" -Method Post -Body $reqBody -Headers $headers
Write-Host "Request created:" $req.requestId

Write-Host "Finding nearest ambulance..."
$nearest = Invoke-RestMethod -Uri "$base/api/ambulances/nearest?lat=22.3072&lng=73.1812" -Method Get
Write-Host "Nearest ambulance:" $nearest.ambulanceId

Write-Host "Creating dispatch and demo call..."
$dispBody = @{ RequestId = $req.requestId; AmbulanceId = $nearest.ambulanceId; HospitalId = $h.hospitalId } | ConvertTo-Json
$disp = Invoke-RestMethod -Uri "$base/api/dispatch" -Method Post -Body $dispBody -Headers $headers
Write-Host "Dispatch created:" $disp.dispatchId

Write-Host "Logging demo call to 9313771258..."
$callBody = @{ DispatchId = $disp.dispatchId; PhoneNumber = '9313771258'; Note = 'Demo call from smoke test' } | ConvertTo-Json
$call = Invoke-RestMethod -Uri "$base/api/call" -Method Post -Body $callBody -Headers $headers
Write-Host "Call logged id:" $call.callLogId

Write-Host "Listing dispatches..."
Invoke-RestMethod -Uri "$base/api/dispatch" -Method Get -Headers $headers | ConvertTo-Json -Depth 5 | Write-Host

Write-Host "Smoke test completed."
