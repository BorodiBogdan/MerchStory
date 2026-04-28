using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddAssetTypeToGeneratedImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssetType",
                table: "GeneratedImages",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Photo");

            migrationBuilder.AddColumn<string>(
                name: "PaperSize",
                table: "GeneratedImages",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            // Backfill any rows that pre-existed with the old default ("").
            migrationBuilder.Sql(
                @"UPDATE ""GeneratedImages"" SET ""AssetType"" = 'Photo' WHERE ""AssetType"" = '' OR ""AssetType"" IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssetType",
                table: "GeneratedImages");

            migrationBuilder.DropColumn(
                name: "PaperSize",
                table: "GeneratedImages");
        }
    }
}
