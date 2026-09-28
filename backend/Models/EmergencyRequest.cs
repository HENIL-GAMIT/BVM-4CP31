namespace backend.Models;

public class EmergencyRequest
{
    public int RequestId { get; set; }
    public string? PatientName { get; set; }
    public string? PatientPhone { get; set; }
    public string? EmergencyType { get; set; }
    public string? Priority { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? Address { get; set; }
    public DateTime RequestTime { get; set; }
    public string? Status { get; set; }
    public string? RequestToken { get; set; }
}
