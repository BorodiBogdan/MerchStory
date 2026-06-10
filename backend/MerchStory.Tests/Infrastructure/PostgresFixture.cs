using MerchStoryAPI.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace MerchStory.Tests.Infrastructure;

// Collection fixture that owns a single throwaway PostgreSQL instance (with the pgvector
// extension) for the whole test run. The integration suite runs against this real database:
// EF Core migrations are applied for real, and pgvector / relational behaviour is exercised
// exactly as in production. Only external services (AI providers, blob storage) are stubbed.
//
// To keep per-test isolation cheap, migrations are applied once to a template database and
// each test gets its own database cloned from that template (CREATE DATABASE ... TEMPLATE),
// which is far faster than re-running every migration per test.
public sealed class PostgresFixture : IAsyncLifetime
{
    private const string TemplateDb = "merchstory_template";

    private readonly PostgreSqlContainer container = new PostgreSqlBuilder()
        .WithImage("pgvector/pgvector:pg18")
        .WithDatabase("postgres")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private string adminConnectionString = string.Empty;

    public async Task InitializeAsync()
    {
        await this.container.StartAsync();
        this.adminConnectionString = this.container.GetConnectionString();

        await ExecuteAsync(this.adminConnectionString, $"CREATE DATABASE \"{TemplateDb}\";");

        // Apply every migration once against the template, then release all connections so the
        // template can be used as a CREATE DATABASE source (Postgres forbids cloning a database
        // that has active sessions).
        string templateConnection = WithDatabase(this.adminConnectionString, TemplateDb, pooling: false);
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(templateConnection, o => o.UseVector())
            .Options;
        await using (var ctx = new AppDbContext(options))
        {
            await ctx.Database.MigrateAsync();
        }

        NpgsqlConnection.ClearAllPools();
    }

    public async Task DisposeAsync()
    {
        await this.container.DisposeAsync();
    }

    // Clones a fresh, fully-migrated database from the template and returns a connection string
    // to it. Each test class instance (one per test method) calls this for a clean schema.
    public string CreateDatabase()
    {
        string dbName = "test_" + Guid.NewGuid().ToString("N");
        ExecuteAsync(this.adminConnectionString, $"CREATE DATABASE \"{dbName}\" TEMPLATE \"{TemplateDb}\";")
            .GetAwaiter().GetResult();
        return WithDatabase(this.adminConnectionString, dbName);
    }

    private static async Task ExecuteAsync(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static string WithDatabase(string connectionString, string database, bool pooling = true)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Database = database,
            Pooling = pooling,
        };
        return builder.ConnectionString;
    }
}

// Marker type that ties the "Postgres" collection to the shared container fixture. Named
// without a "Collection" suffix to satisfy CA1711; xUnit matches on the attribute's name.
[CollectionDefinition("Postgres")]
public sealed class PostgresCollectionMarker : ICollectionFixture<PostgresFixture>
{
}
