using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddSocialPostCache : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "FacebookLastSyncedAt",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SocialPosts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Platform = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ExternalAccountId = table.Column<string>(type: "text", nullable: false),
                    PlatformPostId = table.Column<string>(type: "text", nullable: false),
                    SourceUrl = table.Column<string>(type: "text", nullable: true),
                    Caption = table.Column<string>(type: "text", nullable: true),
                    LikesCount = table.Column<int>(type: "integer", nullable: false),
                    CommentsCount = table.Column<int>(type: "integer", nullable: false),
                    CommentsJson = table.Column<string>(type: "text", nullable: false),
                    SyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SocialPosts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SocialPosts_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SocialPosts_UserId_Platform_ExternalAccountId",
                table: "SocialPosts",
                columns: new[] { "UserId", "Platform", "ExternalAccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_SocialPosts_UserId_Platform_ExternalAccountId_PlatformPostId",
                table: "SocialPosts",
                columns: new[] { "UserId", "Platform", "ExternalAccountId", "PlatformPostId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SocialPosts");

            migrationBuilder.DropColumn(
                name: "FacebookLastSyncedAt",
                table: "AspNetUsers");
        }
    }
}
