using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using backend.Data;
using backend.Models;
using backend.Services;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://0.0.0.0:5000");

// Configuration and services
var defaultConn = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(defaultConn)) defaultConn = "Server=.\\SQLEXPRESS;Database=SmartDispatchDb;Trusted_Connection=True;TrustServerCertificate=True;";

// Try using SQL Server; if it is not available, fall back to InMemory DB for local development
var useInMemory = false;
try
{
    using var testConn = new SqlConnection(defaultConn);
    testConn.Open();
    testConn.Close();
}
catch
{
    useInMemory = true;
}

Console.WriteLine($"Default DB connection: {defaultConn}");
Console.WriteLine($"Using InMemory provider: {useInMemory}");

if (!useInMemory)
{
    builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(defaultConn));
}
else
{
    builder.Services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase("SmartDispatchInMemory"));
}
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin()));

// JWT Auth
var jwtSection = builder.Configuration.GetSection("Jwt");
var key = jwtSection.GetValue<string>("Key");
if (string.IsNullOrWhiteSpace(key))
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Jwt:Key must be configured outside Development.");
    key = "DevFallbackJwtKey_ChangeMe_2026_very_long_fallback_key_change_this_to_secret_!";
}
if (Encoding.UTF8.GetByteCount(key) < 32)
    throw new InvalidOperationException("Jwt:Key must contain at least 32 bytes.");
var issuer = jwtSection.GetValue<string>("Issuer");
if (string.IsNullOrWhiteSpace(issuer)) issuer = "SmartDispatch";
var audience = jwtSection.GetValue<string>("Audience");
if (string.IsNullOrWhiteSpace(audience)) audience = "SmartDispatchUsers";
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = issuer,
        ValidAudience = audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key))
    };
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    options.AddPolicy("DriverOnly", policy => policy.RequireRole("Driver"));
    options.AddPolicy("HospitalOnly", policy => policy.RequireRole("Hospital"));
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "SmartDispatch API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: 'Bearer {token}'",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "SmartDispatch API v1");
    options.RoutePrefix = "swagger";
});

// Apply schema changes and provision the initial administrator from private configuration.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // If using real SQL Server, attempt migrations. If using InMemory, skip migrations.
    if (!useInMemory)
    {
        try
        {
            Console.WriteLine("Using SQL Server provider. Attempting migrations...");
            db.Database.Migrate();
        }
        catch (Exception ex)
        {
            Console.WriteLine("Database migrate failed: " + ex.Message);
            throw new InvalidOperationException("Database migration failed; the backend cannot safely start.", ex);
        }
    }
    else
    {
        Console.WriteLine("SQL Server unavailable. Using InMemory provider for development.");
    }

    try
    {
        var legacyDefaultAdmins = db.Users
            .Where(user => user.Role == "Admin" && (user.Email == "admin@local" || user.Email == "admin"))
            .ToList()
            .Where(user => AuthUtils.VerifyPassword("admin", user.PasswordHash ?? ""))
            .ToList();
        if (legacyDefaultAdmins.Count > 0)
        {
            db.Users.RemoveRange(legacyDefaultAdmins);
            db.SaveChanges();
            Console.WriteLine("Removed legacy default admin accounts.");
        }

        var bootstrapEmail = builder.Configuration["BootstrapAdmin:Email"]?.Trim();
        var bootstrapPassword = builder.Configuration["BootstrapAdmin:Password"];
        if (string.IsNullOrWhiteSpace(bootstrapEmail) != string.IsNullOrWhiteSpace(bootstrapPassword))
            throw new InvalidOperationException("Configure both BootstrapAdmin:Email and BootstrapAdmin:Password to provision an administrator.");
        if (!string.IsNullOrWhiteSpace(bootstrapEmail) &&
            !db.Users.Any(user => user.Role == "Admin"))
        {
            if (bootstrapPassword is null || !AuthUtils.IsValidPassword(bootstrapPassword))
                throw new InvalidOperationException("BootstrapAdmin:Password must contain between 12 and 128 characters.");
            if (db.Users.Any(user => user.Email == bootstrapEmail))
                throw new InvalidOperationException("BootstrapAdmin:Email is already assigned to another account.");

            db.Users.Add(new User
            {
                Name = builder.Configuration["BootstrapAdmin:Name"] ?? "Administrator",
                Email = bootstrapEmail.Trim(),
                Phone = builder.Configuration["BootstrapAdmin:Phone"],
                Role = "Admin",
                PasswordHash = AuthUtils.HashPassword(bootstrapPassword)
            });
            db.SaveChanges();
            Console.WriteLine("Provisioned initial administrator from configured bootstrap credentials.");
        }

        if (!db.Hospitals.Any())
        {
            var defaultHospital = new Hospital
            {
                HospitalName = "City Emergency Trauma Center",
                Address = "Station Road, Vadodara",
                Latitude = 22.3100,
                Longitude = 73.1900,
                ContactNumber = "02652223344",
                Status = "Open",
                PasswordHash = AuthUtils.HashPassword("1234567890")
            };
            db.Hospitals.Add(defaultHospital);
            db.SaveChanges();

            var defaultAmbulance = new Ambulance
            {
                HospitalId = defaultHospital.HospitalId,
                VehicleNumber = "GJ-01-EM-1080",
                DriverName = "Ramesh Kumar",
                DriverPhone = "9999999999",
                Type = "Advanced Life Support",
                Latitude = 22.3080,
                Longitude = 73.1810,
                Status = "Available",
                PasswordHash = AuthUtils.HashPassword("9876543210")
            };
            db.Ambulances.Add(defaultAmbulance);
            db.SaveChanges();
            Console.WriteLine("Seeded default hospital and ambulance.");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("Seeding failed: " + ex.Message);
        throw;
    }
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// Emergency endpoints
app.MapGet("/api/emergency", async (AppDbContext db) => await db.EmergencyRequests.ToListAsync())
    .RequireAuthorization("AdminOnly");

app.MapGet("/api/emergency/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var request = await db.EmergencyRequests.FindAsync(id);
    if (request == null) return Results.NotFound();
    if (user.FindFirstValue(ClaimTypes.Role) == "Admin") return Results.Ok(request);

    var dispatch = await db.Dispatches.FirstOrDefaultAsync(item => item.RequestId == id);
    if (dispatch == null || !CanAccessDispatch(dispatch, user)) return Results.Forbid();
    return Results.Ok(request);
}).RequireAuthorization();

app.MapPost("/api/emergency", async (EmergencyRequest request, AppDbContext db) =>
{
    if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180 || (request.Latitude == 0 && request.Longitude == 0))
        return Results.BadRequest("A valid patient location is required");
    request.RequestTime = DateTime.UtcNow;
    request.Status = "Pending";
    request.RequestToken = Guid.NewGuid().ToString("N");
    db.EmergencyRequests.Add(request);
    await db.SaveChangesAsync();
    return Results.Created($"/api/emergency/{request.RequestId}", request);
});

app.MapPost("/api/emergency/lookup", async (EmergencyLookupRequest req, AppDbContext db) =>
{
    if (req.RequestId <= 0 || string.IsNullOrWhiteSpace(req.Phone))
        return Results.BadRequest("A valid Request ID and Phone number are required");

    var phoneClean = req.Phone.Trim();
    var emergency = await db.EmergencyRequests.FindAsync(req.RequestId);
    if (emergency == null) return Results.NotFound("Emergency request not found");

    var patientPhone = (emergency.PatientPhone ?? "").Trim();
    if (!patientPhone.Equals(phoneClean, StringComparison.OrdinalIgnoreCase) &&
        !patientPhone.EndsWith(phoneClean) &&
        !phoneClean.EndsWith(patientPhone))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(new
    {
        requestId = emergency.RequestId,
        requestToken = emergency.RequestToken,
        status = emergency.Status,
        patientName = emergency.PatientName,
        requestTime = emergency.RequestTime
    });
});

// Ambulance endpoints
app.MapGet("/api/ambulances", async (AppDbContext db) =>
    await db.Ambulances.ToListAsync()).RequireAuthorization("AdminOnly");
app.MapGet("/api/ambulances/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var ambulance = await db.Ambulances.FindAsync(id);
    if (ambulance == null) return Results.NotFound();
    var role = user.FindFirstValue(ClaimTypes.Role);
    var canView = role == "Admin" ||
        (role == "Hospital" && user.FindFirstValue("hospitalId") == ambulance.HospitalId?.ToString()) ||
        (role == "Driver" && user.FindFirstValue("ambulanceId") == ambulance.AmbulanceId.ToString());
    return canView ? Results.Ok(ambulance) : Results.Forbid();
}).RequireAuthorization();

app.MapGet("/api/hospitals/{hospitalId:int}/ambulances", async (int hospitalId, ClaimsPrincipal user, AppDbContext db) =>
{
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role != "Admin" && (role != "Hospital" || user.FindFirstValue("hospitalId") != hospitalId.ToString()))
        return Results.Forbid();
    return Results.Ok(await db.Ambulances.Where(a => a.HospitalId == hospitalId).ToListAsync());
}).RequireAuthorization();

app.MapPost("/api/ambulances", async (AmbulanceCreateRequest request, ClaimsPrincipal user, AppDbContext db) =>
{
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (!AuthUtils.IsValidPassword(request.Password))
        return Results.BadRequest("Password must contain between 12 and 128 characters");
    if (request.HospitalId is null || !await db.Hospitals.AnyAsync(h => h.HospitalId == request.HospitalId))
        return Results.BadRequest("A valid HospitalId is required");
    if (role != "Admin" && (role != "Hospital" || user.FindFirstValue("hospitalId") != request.HospitalId.ToString()))
        return Results.Forbid();
    var ambulance = new Ambulance
    {
        HospitalId = request.HospitalId,
        VehicleNumber = request.VehicleNumber,
        DriverName = request.DriverName,
        DriverPhone = request.DriverPhone,
        PasswordHash = AuthUtils.HashPassword(request.Password!),
        Type = request.Type,
        Latitude = request.Latitude,
        Longitude = request.Longitude,
        Status = request.Status
    };
    db.Ambulances.Add(ambulance);
    await db.SaveChangesAsync();
    return Results.Created($"/api/ambulances/{ambulance.AmbulanceId}", ambulance);
}).RequireAuthorization();

app.MapPut("/api/ambulances/{id}", async (int id, Ambulance updated, ClaimsPrincipal user, AppDbContext db) =>
{
    var amb = await db.Ambulances.FindAsync(id);
    if (amb == null) return Results.NotFound();
    if (updated.HospitalId is null || !await db.Hospitals.AnyAsync(h => h.HospitalId == updated.HospitalId))
        return Results.BadRequest("A valid HospitalId is required");
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role != "Admin" && (role != "Hospital" || user.FindFirstValue("hospitalId") != amb.HospitalId?.ToString() || updated.HospitalId != amb.HospitalId))
        return Results.Forbid();
    amb.HospitalId = updated.HospitalId;
    amb.VehicleNumber = updated.VehicleNumber;
    amb.DriverName = updated.DriverName;
    amb.DriverPhone = updated.DriverPhone;
    amb.Type = updated.Type;
    amb.Latitude = updated.Latitude;
    amb.Longitude = updated.Longitude;
    amb.Status = updated.Status;
    await db.SaveChangesAsync();
    return Results.Ok(amb);
}).RequireAuthorization();

app.MapDelete("/api/ambulances/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var ambulance = await db.Ambulances.FindAsync(id);
    if (ambulance == null) return Results.NotFound();
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role != "Admin" && (role != "Hospital" || user.FindFirstValue("hospitalId") != ambulance.HospitalId?.ToString()))
        return Results.Forbid();
    if (await db.Dispatches.AnyAsync(d => d.AmbulanceId == id && d.Status != "Completed"))
        return Results.Conflict("This ambulance has an active dispatch");
    db.Ambulances.Remove(ambulance);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization();

// Public hospital directory responses intentionally omit contact details and password hashes.
app.MapGet("/api/hospitals", async (AppDbContext db) =>
    Results.Ok(await db.Hospitals.Select(h => new
    {
        h.HospitalId,
        h.HospitalName,
        h.Address,
        h.Latitude,
        h.Longitude,
        h.Status
    }).ToListAsync()));
app.MapGet("/api/hospitals/{id:int}", async (int id, AppDbContext db) =>
    await db.Hospitals.Where(h => h.HospitalId == id).Select(h => new
    {
        h.HospitalId,
        h.HospitalName,
        h.Address,
        h.Latitude,
        h.Longitude,
        h.Status
    }).FirstOrDefaultAsync() is { } hospital ? Results.Ok(hospital) : Results.NotFound());
app.MapGet("/api/hospitals/managed", async (AppDbContext db) =>
    await db.Hospitals.ToListAsync()).RequireAuthorization("AdminOnly");
app.MapPost("/api/hospitals", async (HospitalCreateRequest request, AppDbContext db) =>
{
    if (!AuthUtils.IsValidPassword(request.Password))
        return Results.BadRequest("Password must contain between 12 and 128 characters");
    if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180 || (request.Latitude == 0 && request.Longitude == 0))
        return Results.BadRequest("A valid hospital location is required");
    var h = new Hospital
    {
        HospitalName = request.HospitalName,
        Address = request.Address,
        Latitude = request.Latitude,
        Longitude = request.Longitude,
        ContactNumber = request.ContactNumber,
        PasswordHash = AuthUtils.HashPassword(request.Password!),
        Status = request.Status
    };
    db.Hospitals.Add(h);
    await db.SaveChangesAsync();
    return Results.Created($"/api/hospitals/{h.HospitalId}", h);
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/hospitals/{id:int}/password", async (int id, PasswordRequest request, AppDbContext db) =>
{
    if (!AuthUtils.IsValidPassword(request.Password))
        return Results.BadRequest("Password must contain between 12 and 128 characters");
    var hospital = await db.Hospitals.FindAsync(id);
    if (hospital == null) return Results.NotFound();
    hospital.PasswordHash = AuthUtils.HashPassword(request.Password!);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/ambulances/{id:int}/password", async (int id, PasswordRequest request, ClaimsPrincipal user, AppDbContext db) =>
{
    if (!AuthUtils.IsValidPassword(request.Password))
        return Results.BadRequest("Password must contain between 12 and 128 characters");
    var ambulance = await db.Ambulances.FindAsync(id);
    if (ambulance == null) return Results.NotFound();
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role != "Admin" &&
        (role != "Hospital" || user.FindFirstValue("hospitalId") != ambulance.HospitalId?.ToString()))
        return Results.Forbid();
    ambulance.PasswordHash = AuthUtils.HashPassword(request.Password!);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization();

app.MapDelete("/api/hospitals/{id:int}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var hospital = await db.Hospitals.FindAsync(id);
    if (hospital == null) return Results.NotFound();

    if (await db.Dispatches.AnyAsync(d => d.HospitalId == id && d.Status != "Completed"))
    {
        return Results.Conflict("Cannot delete hospital with active emergency dispatches");
    }

    var ambulances = await db.Ambulances.Where(a => a.HospitalId == id).ToListAsync();
    foreach (var amb in ambulances)
    {
        if (!await db.Dispatches.AnyAsync(d => d.AmbulanceId == amb.AmbulanceId && d.Status != "Completed"))
        {
            db.Ambulances.Remove(amb);
        }
        else
        {
            amb.HospitalId = null;
        }
    }

    db.Hospitals.Remove(hospital);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("AdminOnly");

// Dispatch
app.MapGet("/api/dispatch", async (AppDbContext db) => await db.Dispatches.ToListAsync()).RequireAuthorization("AdminOnly");

app.MapPost("/api/dispatch", async (Dispatch dispatch, AppDbContext db) =>
{
    var ambulance = await db.Ambulances.FindAsync(dispatch.AmbulanceId);
    var hospital = await db.Hospitals.FindAsync(dispatch.HospitalId);
    if (ambulance == null || hospital == null) return Results.BadRequest("Ambulance and hospital must exist");
    if (ambulance.HospitalId != dispatch.HospitalId) return Results.BadRequest("Ambulance is managed by another hospital");
    dispatch.AssignedTime = DateTime.UtcNow;
    dispatch.Status = "Assigned";
    db.Dispatches.Add(dispatch);
    var amb = ambulance;
    if (amb != null) amb.Status = "Assigned";
    var req = await db.EmergencyRequests.FindAsync(dispatch.RequestId);
    if (req != null) req.Status = "Assigned";
    await db.SaveChangesAsync();
    return Results.Ok(dispatch);
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/dispatch/{id}", async (int id, Dispatch updated, ClaimsPrincipal user, AppDbContext db) =>
{
    var d = await db.Dispatches.FindAsync(id);
    if (d == null) return Results.NotFound();
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role is not ("Admin" or "Driver" or "Hospital")) return Results.Forbid();
    if (role == "Driver" && d.AmbulanceId.ToString() != user.FindFirstValue("ambulanceId")) return Results.Forbid();
    if (role == "Hospital" && d.HospitalId.ToString() != user.FindFirstValue("hospitalId")) return Results.Forbid();
    
    var newStatus = updated.Status ?? d.Status;
    d.Status = newStatus;
    
    if (newStatus == "Arrived" && d.ArrivalTime == null)
    {
        d.ArrivalTime = DateTime.UtcNow;
    }
    else if (newStatus == "Completed" && d.CompletionTime == null)
    {
        d.CompletionTime = DateTime.UtcNow;
    }
    else
    {
        d.ArrivalTime = updated.ArrivalTime ?? d.ArrivalTime;
        d.CompletionTime = updated.CompletionTime ?? d.CompletionTime;
    }

    var req = await db.EmergencyRequests.FindAsync(d.RequestId);
    var amb = await db.Ambulances.FindAsync(d.AmbulanceId);

    if (newStatus == "En Route")
    {
        if (req != null) req.Status = "Ambulance En Route";
        if (amb != null) amb.Status = "En Route";
    }
    else if (newStatus == "Arrived")
    {
        if (req != null) req.Status = "Ambulance Arrived";
        if (amb != null) amb.Status = "At Scene";
    }
    else if (newStatus == "Transporting")
    {
        if (req != null) req.Status = "Transporting to Hospital";
        if (amb != null) amb.Status = "Transporting";
    }
    else if (newStatus == "Completed")
    {
        if (req != null) req.Status = "Completed";
        if (amb != null) amb.Status = "Available";
    }

    await db.SaveChangesAsync();
    return Results.Ok(d);
}).RequireAuthorization();

static bool CanAccessDispatch(Dispatch dispatch, ClaimsPrincipal user)
{
    var role = user.FindFirstValue(ClaimTypes.Role);
    return role == "Admin" ||
        (role == "Driver" && user.FindFirstValue("ambulanceId") == dispatch.AmbulanceId.ToString()) ||
        (role == "Hospital" && user.FindFirstValue("hospitalId") == dispatch.HospitalId.ToString());
}

static bool IsValidBloodPressure(string? value)
{
    var parts = value?.Split('/');
    return parts is { Length: 2 } &&
        int.TryParse(parts[0].Trim(), out var systolic) &&
        int.TryParse(parts[1].Trim(), out var diastolic) &&
        systolic is >= 30 and <= 300 &&
        diastolic is >= 20 and <= 200;
}

app.MapPost("/api/dispatch/{dispatchId:int}/vitals", async (int dispatchId, PatientVitalsRequest request, ClaimsPrincipal user, AppDbContext db) =>
{
    if (user.FindFirstValue(ClaimTypes.Role) != "Driver")
        return Results.Forbid();

    var dispatch = await db.Dispatches.FindAsync(dispatchId);
    if (dispatch == null) return Results.NotFound("Dispatch not found");
    if (!CanAccessDispatch(dispatch, user)) return Results.Forbid();
    if (dispatch.Status == "Completed") return Results.Conflict("Cannot update vitals for a completed dispatch");
    if (request.HeartRate is < 1 or > 300 || request.Spo2 is < 0 or > 100 || !IsValidBloodPressure(request.BloodPressure))
        return Results.BadRequest("Enter a valid heart rate, blood pressure, and SpO2 value");

    var report = await db.PatientVitals.FindAsync(dispatchId);
    if (report == null)
    {
        report = new PatientVitals { DispatchId = dispatchId };
        db.PatientVitals.Add(report);
    }

    report.HeartRate = request.HeartRate;
    report.BloodPressure = request.BloodPressure!.Trim();
    report.Spo2 = request.Spo2;
    report.RecordedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(report);
}).RequireAuthorization("DriverOnly");

app.MapGet("/api/dispatch/{dispatchId:int}/vitals", async (int dispatchId, ClaimsPrincipal user, AppDbContext db) =>
{
    var dispatch = await db.Dispatches.FindAsync(dispatchId);
    if (dispatch == null) return Results.NotFound("Dispatch not found");
    if (!CanAccessDispatch(dispatch, user)) return Results.Forbid();

    var report = await db.PatientVitals.FindAsync(dispatchId);
    return report == null ? Results.NotFound() : Results.Ok(report);
}).RequireAuthorization();

// Nearest ambulance
static double Distance(double lat1, double lon1, double lat2, double lon2)
{
    var R = 6371e3; // metres
    var phi1 = lat1 * Math.PI / 180.0;
    var phi2 = lat2 * Math.PI / 180.0;
    var deltaPhi = (lat2 - lat1) * Math.PI / 180.0;
    var deltaLambda = (lon2 - lon1) * Math.PI / 180.0;
    var a = Math.Sin(deltaPhi/2) * Math.Sin(deltaPhi/2) + Math.Cos(phi1) * Math.Cos(phi2) * Math.Sin(deltaLambda/2) * Math.Sin(deltaLambda/2);
    var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1-a));
    var d = R * c;
    return d; // meters
}

app.MapGet("/api/ambulances/nearest", async (double lat, double lng, AppDbContext db) =>
{
    var ambulances = await db.Ambulances.Where(a => a.Status == "Available").ToListAsync();
    var nearest = ambulances.OrderBy(a => Distance(lat, lng, a.Latitude, a.Longitude)).FirstOrDefault();
    return nearest is not null
        ? Results.Ok(new
        {
            nearest.AmbulanceId,
            nearest.HospitalId,
            nearest.VehicleNumber,
            nearest.DriverName,
            nearest.Type,
            nearest.Latitude,
            nearest.Longitude,
            nearest.Status
        })
        : Results.NotFound();
});

// Nearest hospital endpoint
app.MapGet("/api/hospitals/nearest", async (double lat, double lng, AppDbContext db) =>
{
    var hospitals = await db.Hospitals.ToListAsync();
    var nearest = hospitals.OrderBy(h => Distance(lat, lng, h.Latitude, h.Longitude)).FirstOrDefault();
    return nearest is not null
        ? Results.Ok(new
        {
            nearest.HospitalId,
            nearest.HospitalName,
            nearest.Address,
            nearest.Latitude,
            nearest.Longitude,
            nearest.Status
        })
        : Results.NotFound();
});

// Hospitals receive nearby pending requests and accept one to start dispatch.
app.MapGet("/api/emergency/available-for-hospital/{hospitalId}", async (int hospitalId, ClaimsPrincipal user, AppDbContext db) =>
{
    if (user.FindFirstValue(ClaimTypes.Role) != "Hospital" ||
        user.FindFirstValue("hospitalId") != hospitalId.ToString())
        return Results.Forbid();

    var hospital = await db.Hospitals.FindAsync(hospitalId);
    if (hospital == null) return Results.NotFound("Hospital not found");

    var openHospitals = await db.Hospitals
        .Where(h => h.Status == null || h.Status == "Open")
        .ToListAsync();
    var requests = await db.EmergencyRequests
        .Where(r => r.Status == "Pending")
        .ToListAsync();

    var nearestRequests = requests.Where(request =>
    {
        var nearestHospital = openHospitals
            .OrderBy(h => Distance(request.Latitude, request.Longitude, h.Latitude, h.Longitude))
            .FirstOrDefault();
        return nearestHospital?.HospitalId == hospital.HospitalId;
    });

    return Results.Ok(nearestRequests.OrderBy(r => Distance(hospital.Latitude, hospital.Longitude, r.Latitude, r.Longitude)));
}).RequireAuthorization("HospitalOnly");

app.MapPost("/api/emergency/{requestId}/accept", async (int requestId, int hospitalId, int? ambulanceId, ClaimsPrincipal user, AppDbContext db) =>
{
    if (user.FindFirstValue(ClaimTypes.Role) != "Hospital" || user.FindFirstValue("hospitalId") != hospitalId.ToString()) return Results.Forbid();
    var request = await db.EmergencyRequests.FindAsync(requestId);
    var hospital = await db.Hospitals.FindAsync(hospitalId);
    if (request == null || hospital == null) return Results.NotFound();
    if (request.Status != "Pending") return Results.Conflict("Request is already being handled");

    var availableAmbulances = await db.Ambulances
        .Where(a => a.Status == "Available" && a.HospitalId == hospital.HospitalId)
        .ToListAsync();
    var nearestAmbulance = ambulanceId.HasValue
        ? availableAmbulances.FirstOrDefault(a => a.AmbulanceId == ambulanceId.Value)
        : availableAmbulances.OrderBy(a => Distance(request.Latitude, request.Longitude, a.Latitude, a.Longitude)).FirstOrDefault();
    if (nearestAmbulance == null) return Results.Conflict("No ambulance is available");

    var dispatch = new Dispatch
    {
        RequestId = request.RequestId,
        HospitalId = hospital.HospitalId,
        AmbulanceId = nearestAmbulance.AmbulanceId,
        AssignedTime = DateTime.UtcNow,
        Status = "Accepted"
    };
    db.Dispatches.Add(dispatch);
    request.Status = "Accepted by Hospital";
    nearestAmbulance.Status = "Assigned";
    await db.SaveChangesAsync();

    return Results.Ok(dispatch);
}).RequireAuthorization("HospitalOnly");

// Drivers publish their current GPS position for all active dashboards.
app.MapPut("/api/ambulances/{id}/location", async (int id, double latitude, double longitude, ClaimsPrincipal user, AppDbContext db) =>
{
    if (user.FindFirstValue(ClaimTypes.Role) != "Driver" || user.FindFirstValue("ambulanceId") != id.ToString()) return Results.Forbid();
    if (latitude is < -90 or > 90 || longitude is < -180 or > 180) return Results.BadRequest("Invalid coordinates");
    var ambulance = await db.Ambulances.FindAsync(id);
    if (ambulance == null) return Results.NotFound();
    ambulance.Latitude = latitude;
    ambulance.Longitude = longitude;
    await db.SaveChangesAsync();
    return Results.Ok(ambulance);
}).RequireAuthorization("DriverOnly");

// Get dispatches assigned to a specific ambulance
app.MapGet("/api/dispatch/ambulance/{ambulanceId}", async (int ambulanceId, ClaimsPrincipal user, AppDbContext db) =>
{
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role != "Admin" && (role != "Driver" || user.FindFirstValue("ambulanceId") != ambulanceId.ToString())) return Results.Forbid();
    var list = await db.Dispatches.Where(d => d.AmbulanceId == ambulanceId).ToListAsync();
    return Results.Ok(list);
}).RequireAuthorization();

// Get dispatches assigned to a specific hospital
app.MapGet("/api/dispatch/hospital/{hospitalId}", async (int hospitalId, ClaimsPrincipal user, AppDbContext db) =>
{
    var role = user.FindFirstValue(ClaimTypes.Role);
    if (role != "Admin" && (role != "Hospital" || user.FindFirstValue("hospitalId") != hospitalId.ToString())) return Results.Forbid();
    var list = await db.Dispatches.Where(d => d.HospitalId == hospitalId).ToListAsync();
    return Results.Ok(list);
}).RequireAuthorization();

// Get dispatch by request id for the requester or an authenticated operations role.
app.MapGet("/api/dispatch/request/{requestId}", async (int requestId, string? token, HttpRequest httpRequest, ClaimsPrincipal user, AppDbContext db) =>
{
    var request = await db.EmergencyRequests.FindAsync(requestId);
    if (request == null) return Results.NotFound();
    var requestToken = httpRequest.Headers["X-Request-Token"].FirstOrDefault() ?? token;
    var isRequester = !string.IsNullOrWhiteSpace(requestToken) && requestToken == request.RequestToken;
    var d = await db.Dispatches.FirstOrDefaultAsync(x => x.RequestId == requestId);
    if (!isRequester && (d == null || !CanAccessDispatch(d, user))) return Results.Forbid();
    return d is not null ? Results.Ok(d) : Results.NotFound();
});

// Return the complete live tracking payload only to the requester or operations staff.
app.MapGet("/api/tracking/request/{requestId}", async (int requestId, string? token, HttpRequest httpRequest, ClaimsPrincipal user, AppDbContext db) =>
{
    var request = await db.EmergencyRequests.FindAsync(requestId);
    if (request == null) return Results.NotFound();
    var role = user.FindFirstValue(ClaimTypes.Role);
    var requestToken = httpRequest.Headers["X-Request-Token"].FirstOrDefault() ?? token;
    var isRequester = !string.IsNullOrWhiteSpace(requestToken) && requestToken == request.RequestToken;
    var dispatch = await db.Dispatches.FirstOrDefaultAsync(x => x.RequestId == requestId);
    if (!isRequester && role != "Admin" && (dispatch == null || !CanAccessDispatch(dispatch, user)))
        return Results.Forbid();
    if (dispatch == null)
    {
        return Results.Ok(new
        {
            request = new
            {
                request.RequestId,
                request.PatientName,
                request.PatientPhone,
                request.EmergencyType,
                request.Priority,
                request.Latitude,
                request.Longitude,
                request.Address,
                request.RequestTime,
                request.Status
            },
            dispatch = (Dispatch?)null,
            ambulance = (Ambulance?)null,
            hospital = (Hospital?)null,
            step = "Pending",
            message = "Emergency request received. Waiting for the nearest hospital to accept and assign an ambulance."
        });
    }

    var ambulance = await db.Ambulances.FindAsync(dispatch.AmbulanceId);
    var hospital = await db.Hospitals.FindAsync(dispatch.HospitalId);
    return Results.Ok(new
    {
        request = new
        {
            request.RequestId,
            request.PatientName,
            request.PatientPhone,
            request.EmergencyType,
            request.Priority,
            request.Latitude,
            request.Longitude,
            request.Address,
            request.RequestTime,
            request.Status
        },
        dispatch,
        ambulance,
        hospital,
        step = dispatch.Status ?? request.Status,
        message = "Ambulance dispatched"
    });
});

// call logs listing (admin)
app.MapGet("/api/calls", async (AppDbContext db) => await db.CallLogs.ToListAsync()).RequireAuthorization("AdminOnly");

// Debug: dump core tables (admin)
app.MapGet("/api/debug/dump", async (AppDbContext db) =>
{
    var data = new {
        users = await db.Users.Select(user => new { user.UserId, user.Name, user.Email, user.Phone, user.Role }).ToListAsync(),
        ambulances = await db.Ambulances.ToListAsync(),
        hospitals = await db.Hospitals.ToListAsync(),
        emergencies = await db.EmergencyRequests.ToListAsync(),
        dispatches = await db.Dispatches.ToListAsync(),
        calls = await db.CallLogs.ToListAsync()
    };
    return Results.Ok(data);
}).RequireAuthorization("AdminOnly");

// Admin overview for testing and monitoring
app.MapGet("/api/admin/summary", async (AppDbContext db) =>
{
    var summary = new
    {
        totalUsers = await db.Users.CountAsync(),
        totalAmbulances = await db.Ambulances.CountAsync(),
        totalHospitals = await db.Hospitals.CountAsync(),
        totalEmergencyRequests = await db.EmergencyRequests.CountAsync(),
        totalDispatches = await db.Dispatches.CountAsync(),
        totalCalls = await db.CallLogs.CountAsync()
    };
    return Results.Ok(summary);
}).RequireAuthorization("AdminOnly");

// Dev helper: create an admin user (development only)
app.MapPost("/api/debug/create-admin", async (UserCreateRequest req, AppDbContext db) =>
{
    if (req.Password is null || !AuthUtils.IsValidPassword(req.Password))
        return Results.BadRequest("Password must contain between 12 and 128 characters");
    try
    {
        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == req.Email || u.Phone == req.Phone);
        if (existing != null) return Results.Conflict("User exists");
        var user = new User { Name = req.Name, Email = req.Email, Phone = req.Phone, Role = "Admin", PasswordHash = AuthUtils.HashPassword(req.Password) };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        Console.WriteLine($"Created user: {user.UserId} {user.Email} {user.Role}");
        return Results.Ok(new { user.UserId, user.Email, user.Phone, user.Role });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Create-admin failed: {ex}");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});
//.RequireAuthorization("AdminOnly");

// Auth: login
app.MapPost("/api/auth/login", async (LoginRequest login, AppDbContext db) =>
{
    try
    {
        var identifier = login.Email; // frontend sends identifier in Email field
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == identifier || u.Phone == identifier || u.Name == identifier);
        if (user == null) return Results.Unauthorized();
        if (user.Role != "Admin") return Results.Forbid();
        if (!AuthUtils.VerifyPassword(login.Password ?? "", user.PasswordHash ?? "")) return Results.Unauthorized();
        var claims = new Dictionary<string, string> { { ClaimTypes.Name, user.Name ?? "" }, { ClaimTypes.Role, user.Role ?? "" }, { "userId", user.UserId.ToString() } };
        var token = AuthUtils.GenerateJwt(key ?? string.Empty, issuer ?? string.Empty, audience ?? string.Empty, claims, expiresMinutes: 240);
        return Results.Ok(new { token, role = user.Role });
    }
    catch (Exception ex)
    {
        Console.WriteLine("Login error: " + ex);
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

// Driver login requires an independently provisioned password in addition to identifying details.
app.MapPost("/api/auth/driver-login", async (DriverLoginRequest req, AppDbContext db) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(req.Phone) || string.IsNullOrWhiteSpace(req.VehicleNumber) || string.IsNullOrEmpty(req.Password))
            return Results.BadRequest("Phone, VehicleNumber, and password are required");
        var amb = await db.Ambulances.FirstOrDefaultAsync(a => a.DriverPhone == req.Phone && a.VehicleNumber == req.VehicleNumber);
        if (amb == null || !AuthUtils.VerifyPassword(req.Password, amb.PasswordHash ?? ""))
            return Results.Unauthorized();
        var claims = new Dictionary<string, string> { { ClaimTypes.Name, amb.DriverName ?? amb.VehicleNumber ?? "Driver" }, { ClaimTypes.Role, "Driver" }, { "ambulanceId", amb.AmbulanceId.ToString() }, { "hospitalId", amb.HospitalId?.ToString() ?? "" } };
        var token = AuthUtils.GenerateJwt(key ?? string.Empty, issuer ?? string.Empty, audience ?? string.Empty, claims, expiresMinutes: 240);
        return Results.Ok(new { token, ambulanceId = amb.AmbulanceId });
    }
    catch (Exception ex)
    {
        Console.WriteLine("Driver login error: " + ex);
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

// Hospital login requires an independently provisioned password.
app.MapPost("/api/auth/hospital-login", async (HospitalLoginRequest req, AppDbContext db) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(req.Phone) || string.IsNullOrEmpty(req.Password))
            return Results.BadRequest("Phone and password are required");
        var h = await db.Hospitals.FirstOrDefaultAsync(hh => hh.ContactNumber == req.Phone && (string.IsNullOrWhiteSpace(req.HospitalName) || hh.HospitalName == req.HospitalName));
        if (h == null || !AuthUtils.VerifyPassword(req.Password, h.PasswordHash ?? ""))
            return Results.Unauthorized();
        var claims = new Dictionary<string, string> { { ClaimTypes.Name, h.HospitalName ?? "Hospital" }, { ClaimTypes.Role, "Hospital" }, { "hospitalId", h.HospitalId.ToString() } };
        var token = AuthUtils.GenerateJwt(key ?? string.Empty, issuer ?? string.Empty, audience ?? string.Empty, claims, expiresMinutes: 240);
        return Results.Ok(new { token, hospitalId = h.HospitalId });
    }
    catch (Exception ex)
    {
        Console.WriteLine("Hospital login error: " + ex);
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

// Log a call
app.MapPost("/api/call", async (CallLog call, AppDbContext db) =>
{
    call.Timestamp = DateTime.UtcNow;
    db.CallLogs.Add(call);
    await db.SaveChangesAsync();
    return Results.Ok(call);
}).RequireAuthorization();

app.Run();

partial class Program{}
