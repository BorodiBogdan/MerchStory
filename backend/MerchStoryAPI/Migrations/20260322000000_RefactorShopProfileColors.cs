using MerchStoryAPI.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260322000000_RefactorShopProfileColors")]
    /// <inheritdoc />
    public partial class RefactorShopProfileColors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AccentColor",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "Atmosphere",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "PrimaryColor",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "SecondaryColor",
                table: "ShopProfiles");

            migrationBuilder.AddColumn<string>(
                name: "BrandColorsJson",
                table: "ShopProfiles",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "OtherDomain",
                table: "ShopProfiles",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "TargetAudience",
                table: "ShopProfiles",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300);

            migrationBuilder.AlterColumn<string>(
                name: "ShopType",
                table: "ShopProfiles",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BrandColorsJson",
                table: "ShopProfiles");

            migrationBuilder.DropColumn(
                name: "OtherDomain",
                table: "ShopProfiles");

            migrationBuilder.AddColumn<string>(
                name: "AccentColor",
                table: "ShopProfiles",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Atmosphere",
                table: "ShopProfiles",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrimaryColor",
                table: "ShopProfiles",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecondaryColor",
                table: "ShopProfiles",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "TargetAudience",
                table: "ShopProfiles",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: string.Empty,
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ShopType",
                table: "ShopProfiles",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: string.Empty,
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30,
                oldNullable: true);
        }
    }
}
