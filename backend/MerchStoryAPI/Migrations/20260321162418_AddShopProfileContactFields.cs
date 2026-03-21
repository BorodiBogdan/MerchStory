using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddShopProfileContactFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Addresses",
                table: "ShopProfiles",
                type: "text",
                nullable: false,
                defaultValue: string.Empty);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "ShopProfiles",
                type: "text",
                nullable: false,
                defaultValue: string.Empty);

            migrationBuilder.AddColumn<string>(
                name: "FacebookHandle",
                table: "ShopProfiles",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstagramHandle",
                table: "ShopProfiles",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhoneNumber",
                table: "ShopProfiles",
                type: "text",
                nullable: false,
                defaultValue: string.Empty);

            migrationBuilder.AddColumn<string>(
                name: "TikTokHandle",
                table: "ShopProfiles",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Addresses",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "FacebookHandle",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "InstagramHandle",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "PhoneNumber",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "TikTokHandle",
                table: "ShopProfiles");
        }
    }
}
