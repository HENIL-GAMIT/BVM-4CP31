using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDispatch.Migrations
{
    /// <inheritdoc />
    public partial class AddRequestTrackingToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RequestToken",
                table: "EmergencyRequests",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequestToken",
                table: "EmergencyRequests");
        }
    }
}
