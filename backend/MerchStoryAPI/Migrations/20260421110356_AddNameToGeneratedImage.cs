using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddNameToGeneratedImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "GeneratedImages",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: string.Empty);

            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX \"IX_GeneratedImages_UserId_Name_ci\" " +
                "ON \"GeneratedImages\" (\"UserId\", lower(\"Name\")) " +
                "WHERE \"Name\" <> '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_GeneratedImages_UserId_Name_ci\";");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "GeneratedImages");
        }
    }
}
