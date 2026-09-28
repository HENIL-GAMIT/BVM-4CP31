namespace backend.Models;

public class CallLog
{
    public int CallLogId { get; set; }
    public int? DispatchId { get; set; }
    public string? PhoneNumber { get; set; }
    public DateTime Timestamp { get; set; }
    public string? Note { get; set; }
}
