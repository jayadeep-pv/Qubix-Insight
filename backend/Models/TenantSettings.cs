namespace QubixInsight.Models;

public class TenantSettings
{
    // Dataverse record GUID of the ilx_tenantsetting row — used as the
    // EntityReference value for ilx_tenantid on all other tables.
    public Guid TenantRecordId { get; set; }

    // Internal business key (ilx_tenantid — primary name column)
    public string TenantKey { get; set; } = "";

    public string TenantName { get; set; } = "";

    // Azure AD tenant GUID — runtime lookup key extracted from JWT tid claim
    public string AadTenantId { get; set; } = "";

    // Permitted email domains e.g. "contoso.com,contoso.co.uk"
    public string AllowedDomains { get; set; } = "";

    // Tenant's Dataverse environment URL
    public string DataverseUrl { get; set; } = "";

    // Blob storage
    public string BlobContainerName { get; set; } = "";
    public string StorageAccountName { get; set; } = "";

    // Key Vault secret name that holds the SAS token / connection string
    public string StorageSasSecretRef { get; set; } = "";

    // Subscription tier e.g. Trial / Standard / Enterprise
    public string SubscriptionTier { get; set; } = "";

    public DateTime? OnboardedDate { get; set; }

    public bool IsActive { get; set; } = true;

    // True when the tenant's subscription tier is "Trial" — enforced in backend endpoints
    // and surfaced to the frontend via GetCurrentUser
    public bool IsTrial { get; set; } = false;

    // True when the tenant key appears in Qubix_InternalTenantKeys app setting.
    // Internal accounts see sys-sample data like trial users but bypass all mode/run restrictions.
    public bool IsInternal { get; set; } = false;

    // True when sys-sample shared records should be included in Dataverse queries.
    public bool NeedsSampleData => IsTrial || IsInternal;
}
