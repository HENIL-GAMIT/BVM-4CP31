namespace backend.Models;

public class Dispatch
{
    public int DispatchId { get; set; }
    public int RequestId { get; set; }
    public int AmbulanceId { get; set; }
    public int HospitalId { get; set; }
    public DateTime AssignedTime { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public DateTime? CompletionTime { get; set; }
    public string? Status { get; set; }
}
