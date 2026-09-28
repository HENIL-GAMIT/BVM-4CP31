namespace backend.Models;

public class Ambulance
{
    public int AmbulanceId { get; set; }
    public int? HospitalId { get; set; }
    public string? VehicleNumber { get; set; }
    public string? DriverName { get; set; }
    public string? DriverPhone { get; set; }
    public string? Type { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? Status { get; set; }
}
