using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddCategoryHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ParentCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Categories_Categories_ParentCategoryId",
                        column: x => x.ParentCategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Categories_ParentCategoryId_Name",
                table: "Categories",
                columns: new[] { "ParentCategoryId", "Name" },
                unique: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "ReferenceImages",
                type: "uuid",
                nullable: true);

            // Preserve any pre-existing string categories: each distinct value becomes
            // a root Category row, and ReferenceImages.CategoryId is back-filled.
            migrationBuilder.Sql(@"
                WITH inserted AS (
                    INSERT INTO ""Categories"" (""Id"", ""Name"", ""ParentCategoryId"", ""CreatedAt"")
                    SELECT gen_random_uuid(), d.""Category"", NULL, NOW()
                      FROM (SELECT DISTINCT ""Category"" FROM ""ReferenceImages"" WHERE ""Category"" IS NOT NULL) d
                    RETURNING ""Id"", ""Name""
                )
                UPDATE ""ReferenceImages"" r
                   SET ""CategoryId"" = i.""Id""
                  FROM inserted i
                 WHERE r.""Category"" = i.""Name"";
            ");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "ReferenceImages");

            migrationBuilder.CreateIndex(
                name: "IX_ReferenceImages_CategoryId",
                table: "ReferenceImages",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_ReferenceImages_Categories_CategoryId",
                table: "ReferenceImages",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "ReferenceImages",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            // Best-effort restore of the string column from the (possibly hierarchical) Categories tree.
            // Uses just the leaf Name — parent breadcrumb is intentionally lost on rollback.
            migrationBuilder.Sql(@"
                UPDATE ""ReferenceImages"" r
                   SET ""Category"" = c.""Name""
                  FROM ""Categories"" c
                 WHERE r.""CategoryId"" = c.""Id"";
            ");

            migrationBuilder.DropForeignKey(
                name: "FK_ReferenceImages_Categories_CategoryId",
                table: "ReferenceImages");

            migrationBuilder.DropIndex(
                name: "IX_ReferenceImages_CategoryId",
                table: "ReferenceImages");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "ReferenceImages");

            migrationBuilder.DropTable(
                name: "Categories");
        }
    }
}
