using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDispatch.Migrations
{
    /// <inheritdoc />
    public partial class AddHospitalOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "HospitalId",
                table: "Users",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HospitalId",
                table: "Ambulances",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Ambulances_HospitalId",
                table: "Ambulances",
                column: "HospitalId");

            migrationBuilder.AddForeignKey(
                name: "FK_Ambulances_Hospitals_HospitalId",
                table: "Ambulances",
                column: "HospitalId",
                principalTable: "Hospitals",
                principalColumn: "HospitalId",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Ambulances_Hospitals_HospitalId",
                table: "Ambulances");

            migrationBuilder.DropIndex(
                name: "IX_Ambulances_HospitalId",
                table: "Ambulances");

            migrationBuilder.DropColumn(
                name: "HospitalId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "HospitalId",
                table: "Ambulances");
        }
    }
}
