using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDispatch.Migrations
{
    /// <inheritdoc />
    public partial class AddLoginPasswordHashes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "Hospitals",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "Ambulances",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "Hospitals");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "Ambulances");
        }
    }
}
