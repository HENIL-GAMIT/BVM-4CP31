namespace backend.Models;

public class PatientVitals
{
    public int DispatchId { get; set; }
    public int HeartRate { get; set; }
    public string BloodPressure { get; set; } = string.Empty;
    public int Spo2 { get; set; }
    public DateTime RecordedAt { get; set; }
}
