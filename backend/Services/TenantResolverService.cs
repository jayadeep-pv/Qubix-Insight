using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Models;
using Microsoft.Xrm.Sdk;

namespace QubixInsight.Services;

public class TenantResolverService
{
    private readonly IConfiguration _config;
    private readonly IMemoryCache _cache;

    // Cache resolved settings for 5 minutes to avoid hitting Dataverse on every request
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    public TenantResolverService(IConfiguration config, IMemoryCache cache)
    {
        _config = config;
        _cache = cache;
    }

    /// <summary>
    /// Resolves tenant settings from the AAD tenant ID extracted from the validated JWT tid claim.
    /// Lookup is performed against ilx_aadtenantid in the master Dataverse environment.
    /// Results are cached per aadTenantId for 5 minutes.
    /// </summary>
    public TenantSettings ResolveTenant(string aadTenantId)
    {
        if (string.IsNullOrWhiteSpace(aadTenantId))
            throw new Exception("AAD tenant ID is missing from the token claims.");

        var cacheKey = $"tenant:{aadTenantId}";

        if (_cache.TryGetValue(cacheKey, out TenantSettings? cached) && cached != null)
            return cached;

        var settings = LookupFromDataverse(aadTenantId);

        _cache.Set(cacheKey, settings, CacheTtl);

        return settings;
    }

    private TenantSettings LookupFromDataverse(string aadTenantId)
    {
        var mainDataverseUrl = _config["MainDataverseUrl"];

        if (string.IsNullOrWhiteSpace(mainDataverseUrl))
            throw new Exception("MainDataverseUrl is not configured.");

        var clientId     = _config["CLIENT_ID"];
        var clientSecret = _config["CLIENT_SECRET"];
        var tenantId     = _config["TENANT_ID"];

        var connectionString =
            $"AuthType=ClientSecret;" +
            $"Url={mainDataverseUrl};" +
            $"ClientId={clientId};" +
            $"ClientSecret={clientSecret};" +
            $"TenantId={tenantId};" +
            $"RequireNewInstance=true;";

        using var service = new ServiceClient(connectionString);

        if (!service.IsReady)
            throw new Exception($"Unable to connect to master Dataverse: {service.LastError}");

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

        // Lookup by AAD tenant ID from JWT — never by a client-supplied header
        query.Criteria.AddCondition("ilx_aadtenantid", ConditionOperator.Equal, aadTenantId);
        query.Criteria.AddCondition("ilx_isactive",    ConditionOperator.Equal, true);

        var result = service.RetrieveMultiple(query).Entities.FirstOrDefault();

        if (result == null)
            throw new Exception($"Tenant not found or inactive for AAD tenant: {aadTenantId}");

        var tierLabel = result.FormattedValues.TryGetValue("ilx_subscriptiontier", out var lbl) ? lbl : "";

        return new TenantSettings
        {
            TenantRecordId     = result.Id,
            TenantKey          = result.GetAttributeValue<string>("ilx_tenantid")            ?? "",
            TenantName         = result.GetAttributeValue<string>("ilx_tenantname")          ?? "",
            AadTenantId        = result.GetAttributeValue<string>("ilx_aadtenantid")         ?? "",
            AllowedDomains     = result.GetAttributeValue<string>("ilx_alloweddomains")      ?? "",
            DataverseUrl       = result.GetAttributeValue<string>("ilx_dataverseurl")        ?? "",
            BlobContainerName  = result.GetAttributeValue<string>("ilx_storagecontainername") ?? "",
            StorageAccountName = result.GetAttributeValue<string>("ilx_storageaccountname")  ?? "",
            StorageSasSecretRef= result.GetAttributeValue<string>("ilx_storagesassecretref") ?? "",
            SubscriptionTier   = result.GetAttributeValue<OptionSetValue>("ilx_subscriptiontier")?.Value.ToString() ?? "",
            OnboardedDate      = result.GetAttributeValue<DateTime?>("ilx_onboardeddate"),
            IsActive           = result.GetAttributeValue<bool>("ilx_isactive"),
            IsTrial            = tierLabel.Equals("Trial", StringComparison.OrdinalIgnoreCase)
        };
    }
}
