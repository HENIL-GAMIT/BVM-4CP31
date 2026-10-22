namespace backend.Models;

public class DriverLoginRequest
{
    public string? Phone { get; set; }
    public string? VehicleNumber { get; set; }
    public string? Password { get; set; }
}
