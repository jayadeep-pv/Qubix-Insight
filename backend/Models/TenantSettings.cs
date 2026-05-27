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
}
