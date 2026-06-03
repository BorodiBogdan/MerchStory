using System.Runtime.CompilerServices;

namespace MerchStory.Tests;

// Pins every integration-test host to the "Testing" environment BEFORE any
// WebApplicationFactory builds its host. This is what keeps the suite offline:
//
//   - Program.cs skips Azure Key Vault under "Testing", so host startup never
//     calls DefaultAzureCredential (no identity on CI -> startup failure -> the
//     whole suite goes red).
//   - appsettings.Development.json (the real Postgres connection string and dev
//     Blob Storage URI) is gitignored and not loaded outside Development, so test
//     config carries no real DB/Azure endpoints. Tests substitute an in-memory
//     DbContext and an in-memory IBlobStorage instead.
//
// A [ModuleInitializer] runs exactly once, at assembly load, ahead of any test.
internal static class TestEnvironment
{
    [ModuleInitializer]
    internal static void UseTestingEnvironment() =>
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
}
