using Microsoft.Extensions.Configuration;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace QubixInsight.Services;

public record TenantUserRecord(
    Guid   RecordId,
    string? FirstName,
    string? LastName,
    string? DisplayName,
    string? CompanyName,
    string? JobTitle,
    string? Country,
    string? Email,
    int     RunsUsed,
    int     RunLimit,
    DateTime? TrialStart,
    DateTime? TrialExpiry,
    int     UserStatus
);

public class TenantUserService
{
    private readonly IConfiguration _config;

    public TenantUserService(IConfiguration config)
    {
        _config = config;
    }

    private ServiceClient CreateClient()
    {
        var url          = _config["MainDataverseUrl"];
        var clientId     = _config["CLIENT_ID"];
        var clientSecret = _config["CLIENT_SECRET"];
        var tenantId     = _config["TENANT_ID"];

        var cs = $"AuthType=ClientSecret;Url={url};ClientId={clientId};" +
                 $"ClientSecret={clientSecret};TenantId={tenantId};RequireNewInstance=true;";

        var svc = new ServiceClient(cs);
        if (!svc.IsReady)
            throw new Exception($"Dataverse connection failed: {svc.LastError}");

        return svc;
    }

    public TenantUserRecord? GetByOid(string oid)
    {
        using var svc = CreateClient();

        var q = new QueryExpression("ilx_tenantuser")
        {
            ColumnSet = new ColumnSet(
                "ilx_name", "ilx_firstname", "ilx_lastname",
                "ilx_companyname", "ilx_jobtitle", "ilx_country", "ilx_email",
                "ilx_runlimit", "ilx_runsused",
                "ilx_trialstart", "ilx_trialexpiry", "ilx_userstatus")
        };
        q.Criteria.AddCondition("ilx_externalobjectid", ConditionOperator.Equal, oid);
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);

        var e = svc.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (e == null) return null;

        return new TenantUserRecord(
            RecordId:    e.Id,
            FirstName:   e.GetAttributeValue<string>("ilx_firstname"),
            LastName:    e.GetAttributeValue<string>("ilx_lastname"),
            DisplayName: e.GetAttributeValue<string>("ilx_name"),
            CompanyName: e.GetAttributeValue<string>("ilx_companyname"),
            JobTitle:    e.GetAttributeValue<string>("ilx_jobtitle"),
            Country:     e.GetAttributeValue<string>("ilx_country"),
            Email:       e.GetAttributeValue<string>("ilx_email"),
            RunsUsed:    e.GetAttributeValue<int>("ilx_runsused"),
            RunLimit:    e.GetAttributeValue<int>("ilx_runlimit"),
            TrialStart:  e.Contains("ilx_trialstart")  ? e.GetAttributeValue<DateTime>("ilx_trialstart")  : null,
            TrialExpiry: e.Contains("ilx_trialexpiry") ? e.GetAttributeValue<DateTime>("ilx_trialexpiry") : null,
            UserStatus:  e.GetAttributeValue<OptionSetValue>("ilx_userstatus")?.Value ?? 1
        );
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

        var composedName = !string.IsNullOrWhiteSpace(displayName)
            ? displayName
            : $"{firstName} {lastName}".Trim();

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
            entity["ilx_trialexpiry"] = DateTime.UtcNow.AddDays(30);
            entity["ilx_runlimit"]    = 5;
            entity["ilx_runsused"]    = 0;
            entity["ilx_userstatus"]  = new OptionSetValue(1); // Active
            svc.Create(entity);
        }
        else
        {
            entity.Id = existing.Id;
            svc.Update(entity);
        }
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
