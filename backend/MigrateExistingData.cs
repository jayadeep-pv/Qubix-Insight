using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

/// <summary>
/// One-time migration: stamps ilx_tenantid on every existing record that was
/// created before tenant isolation was introduced.
/// Scope: config tables only (document types, templates, attributes, rules, AI profiles).
/// </summary>
public class MigrateExistingData
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public MigrateExistingData(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    private static readonly string[] ConfigTables =
    [
        "ilx_documenttype",
        "ilx_analysistemplate",
        "ilx_templateattribute",
        "ilx_analysisrule",
        "ilx_aiinsightprofile",
    ];

    [Function("MigrateExistingData")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);
        if (string.IsNullOrWhiteSpace(aadTenantId))
        {
            var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        var tenant = _tenantResolver.ResolveTenant(aadTenantId);
        using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

        var tenantId = tenant.TenantRecordId.ToString();
        var summary = new Dictionary<string, int>();

        foreach (var table in ConfigTables)
        {
            try
            {
                // Find all records where ilx_tenantid is not yet set
                var query = new QueryExpression(table)
                {
                    ColumnSet = new ColumnSet(false)
                };

                var filter = new FilterExpression(LogicalOperator.Or);
                filter.AddCondition("ilx_tenantid", ConditionOperator.Null);
                filter.AddCondition("ilx_tenantid", ConditionOperator.Equal, "");
                query.Criteria.Filters.Add(filter);

                var records = service.RetrieveMultiple(query).Entities;
                int updated = 0;

                foreach (var record in records)
                {
                    var update = new Entity(table, record.Id);
                    update["ilx_tenantid"] = tenantId;
                    service.Update(update);
                    updated++;
                }

                summary[table] = updated;
            }
            catch (Exception ex)
            {
                summary[$"{table}_error"] = -1;
                summary[$"{table}_errorMsg_length"] = ex.Message.Length;
            }
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new
        {
            tenantId,
            tablesUpdated = summary,
            message = "Migration complete. Existing records have been stamped with the tenant ID."
        });

        return response;
    }
}

