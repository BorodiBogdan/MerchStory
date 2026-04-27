using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddShopLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "ShopProfiles",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CountryCode",
                table: "ShopProfiles",
                type: "character varying(2)",
                maxLength: 2,
                nullable: false,
                defaultValue: string.Empty);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "ShopProfiles",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "ShopProfiles",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "City",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "CountryCode",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "ShopProfiles");
        }
    }
}
