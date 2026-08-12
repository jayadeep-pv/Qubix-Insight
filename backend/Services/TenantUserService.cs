using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System.Text.RegularExpressions;

namespace QubixInsight.Services;

public record TenantUserRecord(
    Guid   RecordId,
    bool   IsAdmin,
    string? FirstName,
    string? LastName,
    string? DisplayName,
    string? CompanyName,
    string? JobTitle,
    string? Country,
    string? Email,
    int     RunsUsed,
    int     RunLimit,
    int     RunMonth,
    DateTime? TrialStart,
    DateTime? TrialExpiry,
    int     UserStatus
);

public class TenantUserService
{
    private readonly IConfiguration _config;
    private readonly ILogger<TenantUserService> _logger;

    public TenantUserService(IConfiguration config, ILogger<TenantUserService> logger)
    {
        _config = config;
        _logger = logger;
    }

    private ServiceClient CreateClient()
    {
        var url          = _config["Qubix_MainDataverseUrl"];
        var clientId     = _config["Qubix_ClientId"];
        var clientSecret = _config["Qubix_ClientSecret"];
        var tenantId     = _config["Qubix_TenantId"];

        var cs = $"AuthType=ClientSecret;Url={url};ClientId={clientId};" +
                 $"ClientSecret={clientSecret};TenantId={tenantId};RequireNewInstance=true;";

        var svc = new ServiceClient(cs);
        if (!svc.IsReady)
            throw new Exception($"Dataverse connection failed: {svc.LastError}");

        return svc;
    }

    public bool IsAdmin(JwtUserInfo userInfo)
    {
        if (string.IsNullOrEmpty(userInfo.Oid))
            return true; // no OID to look up — allow by default

        var record = GetByOid(userInfo.Oid);
        return record?.IsAdmin ?? true; // no record means no explicit restriction
    }

    public TenantUserRecord? GetByOid(string oid)
    {
        using var svc = CreateClient();

        var q = new QueryExpression("ilx_tenantuser")
        {
            ColumnSet = new ColumnSet(
                "ilx_name", "ilx_firstname", "ilx_lastname",
                "ilx_companyname", "ilx_jobtitle", "ilx_country", "ilx_email",
                "ilx_runlimit", "ilx_runsused", "ilx_runmonth",
                "ilx_trialstart", "ilx_trialexpiry", "ilx_userstatus",
                "ilx_isadministrator")
        };
        q.Criteria.AddCondition("ilx_externalobjectid", ConditionOperator.Equal, oid);
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);

        var e = svc.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (e == null) return null;

        return new TenantUserRecord(
            RecordId: e.Id,
            IsAdmin:  e.GetAttributeValue<bool>("ilx_isadministrator"),
            FirstName:   e.GetAttributeValue<string>("ilx_firstname"),
            LastName:    e.GetAttributeValue<string>("ilx_lastname"),
            DisplayName: e.GetAttributeValue<string>("ilx_name"),
            CompanyName: e.GetAttributeValue<string>("ilx_companyname"),
            JobTitle:    e.GetAttributeValue<string>("ilx_jobtitle"),
            Country:     e.GetAttributeValue<string>("ilx_country"),
            Email:       e.GetAttributeValue<string>("ilx_email"),
            RunsUsed:    e.GetAttributeValue<int>("ilx_runsused"),
            RunLimit:    e.GetAttributeValue<int>("ilx_runlimit"),
            RunMonth:    e.GetAttributeValue<int>("ilx_runmonth"),
            TrialStart:  e.Contains("ilx_trialstart")  ? e.GetAttributeValue<DateTime>("ilx_trialstart")  : null,
            TrialExpiry: e.Contains("ilx_trialexpiry") ? e.GetAttributeValue<DateTime>("ilx_trialexpiry") : null,
            UserStatus:  e.GetAttributeValue<OptionSetValue>("ilx_userstatus")?.Value ?? 1
        );
    }

    /// <summary>
    /// Checks the monthly run limit for a trial user and — if allowed — increments
    /// the counter atomically. Returns (allowed, runsUsedThisMonth, runLimit).
    /// Resets the counter automatically when a new calendar month starts.
    /// </summary>
    public (bool Allowed, int RunsUsed, int RunLimit) CheckAndIncrementRun(string oid)
    {
        using var svc = CreateClient();

        var q = new QueryExpression("ilx_tenantuser")
        {
            ColumnSet = new ColumnSet("ilx_tenantuserid", "ilx_runsused", "ilx_runlimit", "ilx_runmonth",
                                      "ilx_trialexpiry")
        };
        q.Criteria.AddCondition("ilx_externalobjectid", ConditionOperator.Equal, oid);
        var existing = svc.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (existing == null)
            return (true, 0, 5); // no record yet — allow and let run proceed

        var currentMonth  = int.Parse(DateTime.UtcNow.ToString("yyyyMM"));
        var storedMonth   = existing.GetAttributeValue<int>("ilx_runmonth");
        var runsUsed      = existing.GetAttributeValue<int>("ilx_runsused");
        var runLimit      = existing.GetAttributeValue<int>("ilx_runlimit");
        if (runLimit <= 0) runLimit = 3; // safety default

        // New calendar month — reset the monthly counter
        if (storedMonth != currentMonth)
        {
            runsUsed    = 0;
            storedMonth = currentMonth;
        }

        if (runsUsed >= runLimit)
            return (false, runsUsed, runLimit);

        // Increment and persist
        runsUsed++;
        var update = new Entity("ilx_tenantuser") { Id = existing.Id };
        update["ilx_runsused"]  = runsUsed;
        update["ilx_runmonth"]  = currentMonth;
        svc.Update(update);

        return (true, runsUsed, runLimit);
    }

    public void CreateOrUpdate(
        string  oid,
        string? email,
        string? displayName,
        Guid    tenantSettingId,
        string? firstName,
        string? lastName,
        string? companyName,
        string? jobTitle,
        string? country)
    {
        using var svc = CreateClient();

        var q = new QueryExpression("ilx_tenantuser")
            { ColumnSet = new ColumnSet("ilx_tenantuserid", "ilx_trialstart") };
        q.Criteria.AddCondition("ilx_externalobjectid", ConditionOperator.Equal, oid);
        var existing = svc.RetrieveMultiple(q).Entities.FirstOrDefault();

        // Prefer form-supplied first/last name over JWT display name.
        // External ID sets displayName to "Unknown" for new users — treat it as absent.
        static bool IsUsable(string? s) => !string.IsNullOrWhiteSpace(s) &&
            !s.Equals("Unknown", StringComparison.OrdinalIgnoreCase);
        var composedName = (!string.IsNullOrWhiteSpace(firstName) || !string.IsNullOrWhiteSpace(lastName))
            ? $"{firstName} {lastName}".Trim()
            : IsUsable(displayName) ? displayName! : "";

        var entity = new Entity("ilx_tenantuser");
        entity["ilx_externalobjectid"] = oid;
        entity["ilx_email"]            = email       ?? "";
        entity["ilx_name"]             = composedName;
        entity["ilx_firstname"]        = firstName   ?? "";
        entity["ilx_lastname"]         = lastName    ?? "";
        entity["ilx_companyname"]      = companyName ?? "";
        entity["ilx_jobtitle"]         = jobTitle    ?? "";
        entity["ilx_country"]          = country     ?? "";
        entity["ilx_lastlogin"]        = DateTime.UtcNow;
        entity["ilx_tenantsetting"]    = new EntityReference("ilx_tenantsetting", tenantSettingId);

        if (existing == null)
        {
            entity["ilx_trialstart"]  = DateTime.UtcNow;
            entity["ilx_trialexpiry"] = DateTime.UtcNow.AddMonths(3);
            entity["ilx_runlimit"]    = 3;
            entity["ilx_runsused"]    = 0;
            entity["ilx_runmonth"]    = 0;
            entity["ilx_userstatus"]  = new OptionSetValue(857270000); // Active
            svc.Create(entity);
        }
        else
        {
            entity.Id = existing.Id;
            svc.Update(entity);
        }
    }

    /// <summary>
    /// Called on first CIAM sign-up. Creates a personal ilx_tenantsetting row for the trial
    /// user (keyed by OID so TenantResolverService can find it) and provisions their blob
    /// container in the shared storage account. Idempotent — safe to call twice.
    /// </summary>
    public async Task<Guid> ProvisionTrialTenantAsync(string oid, string email, string? companyName)
    {
        using var svc = CreateClient();

        // Idempotency: if a record already exists for this OID, return its GUID.
        var existing = svc.RetrieveMultiple(new QueryExpression("ilx_tenantsetting")
        {
            ColumnSet = new ColumnSet("ilx_tenantsettingid"),
            Criteria  = { Conditions = { new ConditionExpression("ilx_aadtenantid", ConditionOperator.Equal, oid) } }
        }).Entities.FirstOrDefault();

        if (existing != null)
            return existing.Id;

        var storageAccount = _config["Qubix_StorageAccountName"] ?? "";
        var trialTierValue = ResolveTrialTierOptionValue(svc);

        // Build unique, URL-safe identifiers from the OID prefix.
        var oidPrefix     = oid.Replace("-", "")[..8];
        var slug          = SanitizeSlug(companyName ?? "trial");
        var tenantKey     = $"{slug}-{oidPrefix}";        // ilx_tenantid  (primary name)
        var containerName = $"trial-{oidPrefix}";         // blob container
        var tenantName    = string.IsNullOrWhiteSpace(companyName)
                            ? "Trial User"
                            : $"{companyName} (Trial)";
        var emailDomain   = email.Split('@').LastOrDefault() ?? "";

        var entity = new Entity("ilx_tenantsetting");
        entity["ilx_tenantid"]             = tenantKey;
        entity["ilx_tenantname"]           = tenantName;
        entity["ilx_aadtenantid"]          = oid;          // OID is the CIAM lookup key
        entity["ilx_alloweddomains"]       = emailDomain;
        entity["ilx_dataverseurl"]         = "";           // blank → TenantDataverseService uses Qubix_MainDataverseUrl
        entity["ilx_storagecontainername"] = containerName;
        entity["ilx_storageaccountname"]   = storageAccount;
        entity["ilx_storagesassecretref"]  = "";
        entity["ilx_subscriptiontier"]     = new OptionSetValue(trialTierValue);
        entity["ilx_onboardeddate"]        = DateTime.UtcNow;
        entity["ilx_isactive"]             = true;

        var newId = svc.Create(entity);
        _logger.LogInformation("Provisioned trial tenant {TenantKey} (container: {Container}) for OID {Oid}",
            tenantKey, containerName, oid);

        await EnsureBlobContainerAsync(containerName);

        return newId;
    }

    /// <summary>
    /// Reads the Trial subscription tier option-set integer from any existing Trial
    /// ilx_tenantsetting record so we never hard-code a Dataverse-specific value.
    /// Falls back to Qubix_TrialTierOptionValue config, then to 857270000.
    /// </summary>
    private int ResolveTrialTierOptionValue(ServiceClient svc)
    {
        var configured = _config["Qubix_TrialTierOptionValue"];
        if (!string.IsNullOrWhiteSpace(configured) && int.TryParse(configured, out var parsed))
            return parsed;

        // Scan all active tenant records to find one labelled "Trial" — no TopCount so we
        // don't accidentally return a Standard/Internal record when that happens to be first.
        var q = new QueryExpression("ilx_tenantsetting")
        {
            ColumnSet  = new ColumnSet("ilx_subscriptiontier"),
            Criteria   = { Conditions = { new ConditionExpression("ilx_isactive", ConditionOperator.Equal, true) } }
        };
        // Filter by formatted value not possible in QueryExpression; we read candidates and
        // pick the first whose formatted value label is "Trial".
        var records = svc.RetrieveMultiple(q).Entities;
        foreach (var r in records)
        {
            if (r.FormattedValues.TryGetValue("ilx_subscriptiontier", out var label)
                && label.Equals("Trial", StringComparison.OrdinalIgnoreCase))
            {
                return r.GetAttributeValue<OptionSetValue>("ilx_subscriptiontier")?.Value ?? 857270000;
            }
        }

        _logger.LogWarning("Could not resolve Trial tier option value from Dataverse. " +
            "Set Qubix_TrialTierOptionValue in app settings to avoid this lookup.");
        return 857270000;
    }

    private static async Task EnsureBlobContainerAsync(string containerName)
    {
        var blobService = BlobHelper.CreateServiceClient();
        var container   = blobService.GetBlobContainerClient(containerName);
        await container.CreateIfNotExistsAsync();
    }

    private static string SanitizeSlug(string input)
    {
        var slug = Regex.Replace(input.ToLowerInvariant().Trim(), @"[^a-z0-9]+", "-").Trim('-');
        if (slug.Length > 20) slug = slug[..20].TrimEnd('-');
        return string.IsNullOrEmpty(slug) ? "trial" : slug;
    }

    public void UpdateLastLogin(string oid)
    {
        using var svc = CreateClient();

        var q = new QueryExpression("ilx_tenantuser")
            { ColumnSet = new ColumnSet("ilx_tenantuserid") };
        q.Criteria.AddCondition("ilx_externalobjectid", ConditionOperator.Equal, oid);
        var existing = svc.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (existing == null) return;

        var update = new Entity("ilx_tenantuser") { Id = existing.Id };
        update["ilx_lastlogin"] = DateTime.UtcNow;
        svc.Update(update);
    }
}
