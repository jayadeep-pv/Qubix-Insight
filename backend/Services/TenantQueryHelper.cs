using Microsoft.Xrm.Sdk.Query;

namespace QubixInsight.Services;

public static class TenantQueryHelper
{
    /// <summary>
    /// Filters by tenant ID, also including legacy records where ilx_tenantid
    /// was not yet stamped (null). These will be invisible once the data migration runs.
    /// </summary>
    public static void AddTenantFilter(QueryExpression query, string tenantRecordId)
    {
        var filter = new FilterExpression(LogicalOperator.Or);
        filter.AddCondition("ilx_tenantid", ConditionOperator.Equal, tenantRecordId);
        filter.AddCondition("ilx_tenantid", ConditionOperator.Null);
        query.Criteria.Filters.Add(filter);
    }
}

