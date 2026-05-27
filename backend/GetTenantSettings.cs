using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetTenantSettings
{
    private readonly ILogger<GetTenantSettings> _logger;
    private readonly IConfiguration _config;

    public GetTenantSettings(ILogger<GetTenantSettings> logger, IConfiguration config)
    {
        _logger = logger;
        _config = config;
    }

    [Function("GetTenantSettings")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "GetTenantSettings")]
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
            using var service = ConnectToMasterDataverse();

            var query = new QueryExpression("ilx_tenantsetting")
            {
                ColumnSet = new ColumnSet(
                    "ilx_tenantid",
                    "ilx_tenantname",
                    "ilx_aadtenantid",
                    "ilx_alloweddomains",
                    "ilx_dataverseurl",
                    "ilx_storagecontainername",
                    "ilx_storageaccountname",
                    "ilx_storagesassecretref",
                    "ilx_subscriptiontier",
                    "ilx_onboardeddate",
                    "ilx_isactive"
                )
            };

            query.Criteria.AddCondition("ilx_aadtenantid", ConditionOperator.Equal, aadTenantId);

            var entity = service.RetrieveMultiple(query).Entities.FirstOrDefault();

            if (entity == null)
            {
                var notFound = req.CreateResponse(HttpStatusCode.NotFound);
                await notFound.WriteStringAsync("Tenant settings not found.");
                return notFound;
            }

            var result = new
            {
                id                  = entity.Id,
                tenantKey           = entity.GetAttributeValue<string>("ilx_tenantid")              ?? "",
                tenantName          = entity.GetAttributeValue<string>("ilx_tenantname")            ?? "",
                aadTenantId         = entity.GetAttributeValue<string>("ilx_aadtenantid")           ?? "",
                allowedDomains      = entity.GetAttributeValue<string>("ilx_alloweddomains")        ?? "",
                dataverseUrl        = entity.GetAttributeValue<string>("ilx_dataverseurl")          ?? "",
                blobContainerName   = entity.GetAttributeValue<string>("ilx_storagecontainername")  ?? "",
                storageAccountName  = entity.GetAttributeValue<string>("ilx_storageaccountname")    ?? "",
                storageSasSecretRef = entity.GetAttributeValue<string>("ilx_storagesassecretref")   ?? "",
                // OptionSet field — read display label from FormattedValues, fall back to raw code
                subscriptionTier    = entity.FormattedValues.TryGetValue("ilx_subscriptiontier", out var tierLabel)
                    ? tierLabel
                    : entity.GetAttributeValue<Microsoft.Xrm.Sdk.OptionSetValue>("ilx_subscriptiontier")?.Value.ToString() ?? "",
                onboardedDate       = entity.GetAttributeValue<DateTime?>("ilx_onboardeddate"),
                isActive            = entity.GetAttributeValue<bool>("ilx_isactive")
            };

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteStringAsync(JsonSerializer.Serialize(result));
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "GetTenantSettings failed");
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

