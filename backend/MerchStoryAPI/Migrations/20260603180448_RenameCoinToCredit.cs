using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MerchStoryAPI.Migrations
{
    /// <inheritdoc />
    public partial class RenameCoinToCredit : Migration
    {
        // Pure rename of the wallet schema (column, table, indexes, PK/FK constraints).
        // EF scaffolds a drop+create for the table rename, which would destroy all
        // transaction history — replaced here with RenameTable/RenameIndex plus
        // ALTER ... RENAME CONSTRAINT so existing balances and rows are preserved.

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "CoinBalance",
                table: "AspNetUsers",
                newName: "CreditBalance");

            migrationBuilder.RenameTable(
                name: "CoinTransactions",
                newName: "CreditTransactions");

            migrationBuilder.RenameIndex(
                name: "IX_CoinTransactions_RelatedGeneratedImageId",
                table: "CreditTransactions",
                newName: "IX_CreditTransactions_RelatedGeneratedImageId");

            migrationBuilder.RenameIndex(
                name: "IX_CoinTransactions_UserId_CreatedAt",
                table: "CreditTransactions",
                newName: "IX_CreditTransactions_UserId_CreatedAt");

            migrationBuilder.Sql(
                "ALTER TABLE \"CreditTransactions\" RENAME CONSTRAINT \"PK_CoinTransactions\" TO \"PK_CreditTransactions\";");
            migrationBuilder.Sql(
                "ALTER TABLE \"CreditTransactions\" RENAME CONSTRAINT \"FK_CoinTransactions_AspNetUsers_UserId\" TO \"FK_CreditTransactions_AspNetUsers_UserId\";");
            migrationBuilder.Sql(
                "ALTER TABLE \"CreditTransactions\" RENAME CONSTRAINT \"FK_CoinTransactions_GeneratedImages_RelatedGeneratedImageId\" TO \"FK_CreditTransactions_GeneratedImages_RelatedGeneratedImageId\";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE \"CreditTransactions\" RENAME CONSTRAINT \"PK_CreditTransactions\" TO \"PK_CoinTransactions\";");
            migrationBuilder.Sql(
                "ALTER TABLE \"CreditTransactions\" RENAME CONSTRAINT \"FK_CreditTransactions_AspNetUsers_UserId\" TO \"FK_CoinTransactions_AspNetUsers_UserId\";");
            migrationBuilder.Sql(
                "ALTER TABLE \"CreditTransactions\" RENAME CONSTRAINT \"FK_CreditTransactions_GeneratedImages_RelatedGeneratedImageId\" TO \"FK_CoinTransactions_GeneratedImages_RelatedGeneratedImageId\";");

            migrationBuilder.RenameIndex(
                name: "IX_CreditTransactions_UserId_CreatedAt",
                table: "CreditTransactions",
                newName: "IX_CoinTransactions_UserId_CreatedAt");

            migrationBuilder.RenameIndex(
                name: "IX_CreditTransactions_RelatedGeneratedImageId",
                table: "CreditTransactions",
                newName: "IX_CoinTransactions_RelatedGeneratedImageId");

            migrationBuilder.RenameTable(
                name: "CreditTransactions",
                newName: "CoinTransactions");

            migrationBuilder.RenameColumn(
                name: "CreditBalance",
                table: "AspNetUsers",
                newName: "CoinBalance");
        }
    }
}
