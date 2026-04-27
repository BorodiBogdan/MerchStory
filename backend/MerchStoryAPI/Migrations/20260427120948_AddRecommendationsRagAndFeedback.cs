using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddRecommendationsRagAndFeedback : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "IdeaEmbeddings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    DailyRecommendationId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdeaId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    GeneratedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Embedding = table.Column<Vector>(type: "vector(768)", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaEmbeddings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IdeaEmbeddings_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaInteractions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    DailyRecommendationId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdeaId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Action = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaInteractions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IdeaInteractions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PromoPlaybookEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessDomain = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Theme = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TriggerType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Trigger = table.Column<string>(type: "text", nullable: false),
                    Tactics = table.Column<string>(type: "text", nullable: false),
                    ExampleCopy = table.Column<string>(type: "text", nullable: false),
                    Embedding = table.Column<Vector>(type: "vector(768)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromoPlaybookEntries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaEmbeddings_Embedding",
                table: "IdeaEmbeddings",
                column: "Embedding")
                .Annotation("Npgsql:IndexMethod", "hnsw")
                .Annotation("Npgsql:IndexOperators", new[] { "vector_cosine_ops" })
                .Annotation("Npgsql:StorageParameter:ef_construction", 64)
                .Annotation("Npgsql:StorageParameter:m", 16);

            migrationBuilder.CreateIndex(
                name: "IX_IdeaEmbeddings_UserId_GeneratedAtUtc",
                table: "IdeaEmbeddings",
                columns: new[] { "UserId", "GeneratedAtUtc" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaInteractions_Action",
                table: "IdeaInteractions",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaInteractions_UserId_DailyRecommendationId",
                table: "IdeaInteractions",
                columns: new[] { "UserId", "DailyRecommendationId" });

            migrationBuilder.CreateIndex(
                name: "IX_PromoPlaybookEntries_BusinessDomain",
                table: "PromoPlaybookEntries",
                column: "BusinessDomain");

            migrationBuilder.CreateIndex(
                name: "IX_PromoPlaybookEntries_BusinessDomain_Theme",
                table: "PromoPlaybookEntries",
                columns: new[] { "BusinessDomain", "Theme" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PromoPlaybookEntries_Embedding",
                table: "PromoPlaybookEntries",
                column: "Embedding")
                .Annotation("Npgsql:IndexMethod", "hnsw")
                .Annotation("Npgsql:IndexOperators", new[] { "vector_cosine_ops" })
                .Annotation("Npgsql:StorageParameter:ef_construction", 64)
                .Annotation("Npgsql:StorageParameter:m", 16);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IdeaEmbeddings");

            migrationBuilder.DropTable(
                name: "IdeaInteractions");

            migrationBuilder.DropTable(
                name: "PromoPlaybookEntries");
        }
    }
}
