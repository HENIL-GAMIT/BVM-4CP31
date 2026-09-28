using Microsoft.EntityFrameworkCore;
using backend.Models;

namespace backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<EmergencyRequest> EmergencyRequests => Set<EmergencyRequest>();
    public DbSet<Ambulance> Ambulances => Set<Ambulance>();
    public DbSet<Hospital> Hospitals => Set<Hospital>();
    public DbSet<Dispatch> Dispatches => Set<Dispatch>();
    public DbSet<CallLog> CallLogs => Set<CallLog>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EmergencyRequest>().HasKey(e => e.RequestId);
        modelBuilder.Entity<Ambulance>().HasKey(a => a.AmbulanceId);
        modelBuilder.Entity<Hospital>().HasKey(h => h.HospitalId);
        modelBuilder.Entity<Dispatch>().HasKey(d => d.DispatchId);
        modelBuilder.Entity<CallLog>().HasKey(c => c.CallLogId);
        modelBuilder.Entity<User>().HasKey(u => u.UserId);
        modelBuilder.Entity<Hospital>()
            .HasMany<Ambulance>()
            .WithOne()
            .HasForeignKey(a => a.HospitalId)
            .OnDelete(DeleteBehavior.SetNull);
        base.OnModelCreating(modelBuilder);
    }
}
