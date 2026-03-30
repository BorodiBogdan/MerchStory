using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddGenerationTypeToGeneratedImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GenerationType",
                table: "GeneratedImages",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GenerationType",
                table: "GeneratedImages");
        }
    }
}
