using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateTenantSettings
{
    private readonly ILogger<UpdateTenantSettings> _logger;
    private readonly IConfiguration _config;

    public UpdateTenantSettings(ILogger<UpdateTenantSettings> logger, IConfiguration config)
    {
        _logger = logger;
        _config = config;
    }

    [Function("UpdateTenantSettings")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "UpdateTenantSettings")]
        HttpRequestData req)
    {
        var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

        if (string.IsNullOrWhiteSpace(aadTenantId))
        {
            var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        try
        {
            var body = await JsonSerializer.DeserializeAsync<JsonElement>(
                req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            using var service = ConnectToMasterDataverse();

            var query = new QueryExpression("ilx_tenantsetting") { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("ilx_aadtenantid", ConditionOperator.Equal, aadTenantId);

            var existing = service.RetrieveMultiple(query).Entities.FirstOrDefault();

            if (existing == null)
            {
                var notFound = req.CreateResponse(HttpStatusCode.NotFound);
                await notFound.WriteStringAsync("Tenant settings not found.");
                return notFound;
            }

            var entity = new Entity("ilx_tenantsetting", existing.Id);

            if (body.TryGetProperty("tenantName",         out var v1)) entity["ilx_tenantname"]          = v1.GetString() ?? "";
            if (body.TryGetProperty("allowedDomains",     out var v2)) entity["ilx_alloweddomains"]      = v2.GetString() ?? "";
            if (body.TryGetProperty("dataverseUrl",       out var v3)) entity["ilx_dataverseurl"]        = v3.GetString() ?? "";
            if (body.TryGetProperty("blobContainerName",  out var v4)) entity["ilx_storagecontainername"]= v4.GetString() ?? "";
            if (body.TryGetProperty("storageAccountName", out var v5)) entity["ilx_storageaccountname"]  = v5.GetString() ?? "";
            if (body.TryGetProperty("storageSasSecretRef",out var v6)) entity["ilx_storagesassecretref"] = v6.GetString() ?? "";
            if (body.TryGetProperty("isActive",           out var v7)) entity["ilx_isactive"]            = v7.GetBoolean();
            // subscriptionTier is an OptionSet managed by the platform — not editable here

            service.Update(entity);

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteStringAsync("Settings updated successfully.");
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "UpdateTenantSettings failed");
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.Message);
            return error;
        }
    }

    private ServiceClient ConnectToMasterDataverse()
    {
        var url    = _config["MainDataverseUrl"] ?? throw new Exception("MainDataverseUrl not configured.");
        var cid    = _config["CLIENT_ID"]         ?? throw new Exception("CLIENT_ID not configured.");
        var secret = _config["CLIENT_SECRET"]     ?? throw new Exception("CLIENT_SECRET not configured.");
        var tid    = _config["TENANT_ID"]          ?? throw new Exception("TENANT_ID not configured.");

        var cs  = $"AuthType=ClientSecret;Url={url};ClientId={cid};ClientSecret={secret};TenantId={tid};RequireNewInstance=true;";
        var svc = new ServiceClient(cs);

        if (!svc.IsReady)
            throw new Exception($"Master Dataverse connection failed: {svc.LastError}");

        return svc;
    }
}

