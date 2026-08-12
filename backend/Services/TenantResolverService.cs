using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Models;
using Microsoft.Xrm.Sdk;

namespace QubixInsight.Services;

public class TenantResolverService
{
    private readonly IMemoryCache _cache;
    private readonly ServiceClient _masterService;
    private readonly HashSet<string> _internalTenantKeys;

    // Tenant settings rarely change — cache for 30 minutes to avoid repeated Dataverse roundtrips
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(30);

    public TenantResolverService(IConfiguration config, IMemoryCache cache)
    {
        _cache = cache;

        // Comma-separated list of tenant keys that bypass trial restrictions but see sample data.
        // Example app setting: Qubix_InternalTenantKeys = css-4a181735,dev-abc12345
        var internalKeys = config["Qubix_InternalTenantKeys"] ?? "";
        _internalTenantKeys = new HashSet<string>(
            internalKeys.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            StringComparer.OrdinalIgnoreCase);

        var url          = config["Qubix_MainDataverseUrl"];
        var clientId     = config["Qubix_ClientId"];
        var clientSecret = config["Qubix_ClientSecret"];
        var tenantId     = config["Qubix_TenantId"];

        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("Qubix_MainDataverseUrl is not configured.");

        // Create the connection once at startup and reuse across all requests.
        // RequireNewInstance is intentionally omitted so the SDK can pool the connection.
        var connectionString =
            $"AuthType=ClientSecret;" +
            $"Url={url};" +
            $"ClientId={clientId};" +
            $"ClientSecret={clientSecret};" +
            $"TenantId={tenantId};";

        _masterService = new ServiceClient(connectionString);
    }

    /// <summary>
    /// Resolves tenant settings from the AAD tenant ID extracted from the validated JWT tid claim.
    /// Lookup is performed against ilx_aadtenantid in the master Dataverse environment.
    /// Results are cached per aadTenantId for 30 minutes.
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

    /// <summary>
    /// Returns the blob container name for the sys-sample tenant, used when trial users
    /// view sample documents whose blobs live in the sample tenant's container.
    /// Result is cached. Returns empty string if no sys-sample record exists.
    /// </summary>
    public string ResolveSampleContainerName()
    {
        const string cacheKey = "tenant:sys-sample:container";

        if (_cache.TryGetValue(cacheKey, out string? cached))
            return cached ?? "";

        if (!_masterService.IsReady)
            return "";

        var query = new QueryExpression("ilx_tenantsetting")
        {
            ColumnSet = new ColumnSet("ilx_storagecontainername"),
            TopCount  = 1
        };
        query.Criteria.AddCondition("ilx_tenantname", ConditionOperator.Equal, TenantQueryHelper.SampleTenantId);

        var result = _masterService.RetrieveMultiple(query).Entities.FirstOrDefault();
        var container = result?.GetAttributeValue<string>("ilx_storagecontainername") ?? "";

        _cache.Set(cacheKey, container, CacheTtl);
        return container;
    }

    private TenantSettings LookupFromDataverse(string aadTenantId)
    {
        if (!_masterService.IsReady)
            throw new Exception($"Unable to connect to master Dataverse: {_masterService.LastError}");

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

        var result = _masterService.RetrieveMultiple(query).Entities.FirstOrDefault();

        if (result == null)
            throw new Exception($"Tenant not found or inactive for AAD tenant: {aadTenantId}");

        var tierLabel = result.FormattedValues.TryGetValue("ilx_subscriptiontier", out var lbl) ? lbl : "";

        var tenantKey = result.GetAttributeValue<string>("ilx_tenantid") ?? "";

        return new TenantSettings
        {
            TenantRecordId     = result.Id,
            TenantKey          = tenantKey,
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
            IsTrial            = tierLabel.Equals("Trial", StringComparison.OrdinalIgnoreCase),
            IsInternal         = _internalTenantKeys.Contains(tenantKey)
        };
    }
}
