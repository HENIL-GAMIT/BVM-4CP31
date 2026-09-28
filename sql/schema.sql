-- SQL Server schema for Smart Emergency Dispatch

CREATE TABLE Users (
    UserId INT IDENTITY PRIMARY KEY,
    HospitalId INT NULL,
    Name NVARCHAR(200),
    Phone NVARCHAR(50),
    Email NVARCHAR(200),
    PasswordHash NVARCHAR(500),
    Role NVARCHAR(50)
);

CREATE TABLE Ambulances (
    AmbulanceId INT IDENTITY PRIMARY KEY,
    HospitalId INT NULL,
    VehicleNumber NVARCHAR(50),
    DriverName NVARCHAR(200),
    DriverPhone NVARCHAR(50),
    Type NVARCHAR(50),
    Latitude FLOAT,
    Longitude FLOAT,
    Status NVARCHAR(50)
);

CREATE TABLE Hospitals (
    HospitalId INT IDENTITY PRIMARY KEY,
    HospitalName NVARCHAR(200),
    Address NVARCHAR(500),
    Latitude FLOAT,
    Longitude FLOAT,
    ContactNumber NVARCHAR(50),
    Status NVARCHAR(50)
);

ALTER TABLE Ambulances
    ADD CONSTRAINT FK_Ambulances_Hospitals
    FOREIGN KEY (HospitalId) REFERENCES Hospitals(HospitalId)
    ON DELETE SET NULL;

CREATE TABLE EmergencyRequests (
    RequestId INT IDENTITY PRIMARY KEY,
    PatientName NVARCHAR(200),
    PatientPhone NVARCHAR(50),
    EmergencyType NVARCHAR(100),
    Priority NVARCHAR(50),
    Latitude FLOAT,
    Longitude FLOAT,
    Address NVARCHAR(500),
    RequestTime DATETIME2,
    Status NVARCHAR(50)
);

CREATE TABLE Dispatches (
    DispatchId INT IDENTITY PRIMARY KEY,
    RequestId INT REFERENCES EmergencyRequests(RequestId),
    AmbulanceId INT REFERENCES Ambulances(AmbulanceId),
    HospitalId INT REFERENCES Hospitals(HospitalId),
    AssignedTime DATETIME2,
    ArrivalTime DATETIME2 NULL,
    CompletionTime DATETIME2 NULL,
    Status NVARCHAR(50)
);
