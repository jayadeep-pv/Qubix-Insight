using Microsoft.Xrm.Sdk.Query;

namespace QubixInsight.Services;

public static class TenantQueryHelper
{
    /// <summary>
    /// The sentinel tenantid value used for shared sample records visible to all trial users.
    /// A real ilx_tenantsetting record with ilx_tenantid = SampleTenantId must exist in Dataverse.
    /// </summary>
    public const string SampleTenantId = "sys-sample";

    /// <summary>
    /// Filters all queries strictly to the given tenant. Use this for all write
    /// operations and for non-insight read operations.
    /// </summary>
    public static void AddTenantFilter(QueryExpression query, string tenantRecordId)
    {
        query.Criteria.AddCondition("ilx_tenantid", ConditionOperator.Equal, tenantRecordId);
    }

    /// <summary>
    /// Filters read queries for tenant's own records plus shared sample records.
    /// Use only for insight/run listing queries shown to trial users.
    /// </summary>
    public static void AddTenantFilterWithSamples(QueryExpression query, string tenantRecordId)
    {
        var filter = new FilterExpression(LogicalOperator.Or);
        filter.AddCondition("ilx_tenantid", ConditionOperator.Equal, tenantRecordId);
        filter.AddCondition("ilx_tenantid", ConditionOperator.Equal, SampleTenantId);
        query.Criteria.Filters.Add(filter);
    }

    /// <summary>
    /// Returns true if the given tenantId targets the shared sample records.
    /// Use to guard against writes to sample records.
    /// </summary>
    public static bool IsSampleTenant(string tenantId) =>
        string.Equals(tenantId, SampleTenantId, StringComparison.OrdinalIgnoreCase);
}

