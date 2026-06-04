using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace QubixInsight.Services;

public class GraphService
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<GraphService> _logger;

    public GraphService(IConfiguration config, IHttpClientFactory http, ILogger<GraphService> logger)
    {
        _config = config;
        _http = http;
        _logger = logger;
    }

    /// <summary>
    /// Updates the External ID user's displayName, givenName and surname in
    /// Microsoft Graph so the MSAL account picker shows the real name instead
    /// of "unknown" after sign-up.
    /// </summary>
    public async Task UpdateExternalIdUserAsync(string oid, string givenName, string surname)
    {
        var tenantId    = _config["Qubix_ExtIdTenantId"];
        var clientId    = _config["Qubix_ExtIdClientId"];
        var clientSecret = _config["Qubix_ExtIdClientSecret"];

        if (string.IsNullOrWhiteSpace(tenantId) ||
            string.IsNullOrWhiteSpace(clientId) ||
            string.IsNullOrWhiteSpace(clientSecret))
        {
            _logger.LogWarning("[Graph] Qubix_ExtIdTenantId/ClientId/ClientSecret not configured — skipping display name update.");
            return;
        }

        var displayName = $"{givenName} {surname}".Trim();
        if (string.IsNullOrWhiteSpace(displayName)) return;

        var client = _http.CreateClient();

        // 1. Acquire token via client_credentials for the External ID tenant
        var tokenUrl = $"https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";
        var tokenResp = await client.PostAsync(tokenUrl, new FormUrlEncodedContent(
            new Dictionary<string, string>
            {
                ["grant_type"]    = "client_credentials",
                ["client_id"]     = clientId,
                ["client_secret"] = clientSecret,
                ["scope"]         = "https://graph.microsoft.com/.default",
            }));

        if (!tokenResp.IsSuccessStatusCode)
        {
            _logger.LogWarning("[Graph] Token request failed: {Status}", tokenResp.StatusCode);
            return;
        }

        using var tokenDoc = JsonDocument.Parse(await tokenResp.Content.ReadAsStringAsync());
        var accessToken = tokenDoc.RootElement.GetProperty("access_token").GetString();

        // 2. PATCH the user profile
        var patchReq = new HttpRequestMessage(HttpMethod.Patch,
            $"https://graph.microsoft.com/v1.0/users/{oid}");
        patchReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        patchReq.Content = new StringContent(
            JsonSerializer.Serialize(new { displayName, givenName, surname }),
            Encoding.UTF8, "application/json");

        var patchResp = await client.SendAsync(patchReq);

        if (!patchResp.IsSuccessStatusCode)
            _logger.LogWarning("[Graph] PATCH users/{Oid} failed: {Status} {Body}",
                oid, patchResp.StatusCode, await patchResp.Content.ReadAsStringAsync());
        else
            _logger.LogInformation("[Graph] Updated display name for user {Oid} to '{Name}'", oid, displayName);
    }
}
