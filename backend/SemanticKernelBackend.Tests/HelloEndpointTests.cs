using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace SemanticKernelBackend.Tests;

public class HelloEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient client;

    public HelloEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.client = factory.CreateClient();
    }

    [Fact]
    public async Task GetHello_ReturnsOkWithHelloWorldMessage()
    {
        var response = await this.client.GetAsync("/hello");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Hello World", body);
    }
}
