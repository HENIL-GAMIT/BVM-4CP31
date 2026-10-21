namespace backend.Models;

public class PatientVitalsRequest
{
    public int HeartRate { get; set; }
    public string? BloodPressure { get; set; }
    public int Spo2 { get; set; }
}
