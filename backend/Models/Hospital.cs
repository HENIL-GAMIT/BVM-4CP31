namespace backend.Models;

public class Hospital
{
    public int HospitalId { get; set; }
    public string? HospitalName { get; set; }
    public string? Address { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? ContactNumber { get; set; }
    public string? Status { get; set; }
}
