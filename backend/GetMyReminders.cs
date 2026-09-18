using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetMyReminders
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetMyReminders(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetMyReminders")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
        {
            var userInfo = JwtTenantExtractor.GetUserInfo(req);

            if (userInfo is null || string.IsNullOrWhiteSpace(userInfo.TenantId) || string.IsNullOrWhiteSpace(userInfo.Email))
            {
                var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine user from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(userInfo.TenantId);
            using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            var queryParams = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
            var runIdString = queryParams["runId"];
            Guid? runId = Guid.TryParse(runIdString, out var parsedRunId) ? parsedRunId : null;

            var query = new QueryExpression("ilx_userreminder")
            {
                ColumnSet = new ColumnSet(
                    "ilx_reminderid",
                    "ilx_analysisresult",
                    "ilx_reminderdate",
                    "ilx_offsetdays",
                    "ilx_snoozeduntil",
                    "ilx_notificationstatus",
                    "statecode",
                    "createdon")
            };

            query.Criteria.AddCondition("ilx_useremail", ConditionOperator.Equal, userInfo.Email);
            query.AddOrder("ilx_reminderdate", OrderType.Ascending);

            // Values are joined through the analysis result they were pinned from —
            // that row already carries the extracted value, page, polygon and confidence
            // (see GetComparisonRunResults), plus it's the tenant-scoping anchor since
            // ilx_userreminder itself has no ilx_tenantid column.
            var resultLink = query.AddLink(
                "ilx_analysisresult",
                "ilx_analysisresult",
                "ilx_analysisresultid",
                JoinOperator.Inner);

            resultLink.EntityAlias = "ar";
            resultLink.Columns = new ColumnSet(
                "ilx_normalisedvalue",
                "ilx_pagenumber",
                "ilx_coordinates",
                "ilx_confidencescore",
                "ilx_risklevel",
                "ilx_templateattribute",
                "ilx_analysisdocument",
                "ilx_analysisrun");

            resultLink.LinkCriteria.AddCondition("ilx_tenantid", ConditionOperator.Equal, tenant.TenantRecordId.ToString());

            if (runId.HasValue)
                resultLink.LinkCriteria.AddCondition("ilx_analysisrun", ConditionOperator.Equal, runId.Value);

            var attrLink = resultLink.AddLink(
                "ilx_templateattribute",
                "ilx_templateattribute",
                "ilx_templateattributeid",
                JoinOperator.LeftOuter);
            attrLink.EntityAlias = "attr";
            attrLink.Columns = new ColumnSet("ilx_name", "ilx_displayname");

            var docLink = resultLink.AddLink(
                "ilx_analysisdocument",
                "ilx_analysisdocument",
                "ilx_analysisdocumentid",
                JoinOperator.LeftOuter);
            docLink.EntityAlias = "doc";
            docLink.Columns = new ColumnSet("ilx_documentname");

            var entities = service.RetrieveMultiple(query).Entities;

            string? Aliased(Entity e, string key) =>
                e.Contains(key) ? ((AliasedValue)e[key]).Value?.ToString() : null;

            var items = entities.Select(e => new
            {
                id = e.Id,
                title = e.GetAttributeValue<string>("ilx_reminderid"),
                analysisResultId = e.GetAttributeValue<EntityReference>("ilx_analysisresult")?.Id,
                value = Aliased(e, "ar.ilx_normalisedvalue"),
                reminderDate = e.GetAttributeValue<DateTime?>("ilx_reminderdate"),
                offsetDays = e.GetAttributeValue<int?>("ilx_offsetdays"),
                snoozedUntil = e.GetAttributeValue<DateTime?>("ilx_snoozeduntil"),
                isActive = e.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0,
                pageNumber = e.Contains("ar.ilx_pagenumber") ? (int?)((AliasedValue)e["ar.ilx_pagenumber"]).Value : null,
                coordinates = Aliased(e, "ar.ilx_coordinates"),
                confidenceScore = e.Contains("ar.ilx_confidencescore") ? (decimal?)((AliasedValue)e["ar.ilx_confidencescore"]).Value : null,
                riskLevel = Aliased(e, "ar.ilx_risklevel"),
                runId = e.Contains("ar.ilx_analysisrun") ? ((AliasedValue)e["ar.ilx_analysisrun"]).Value is EntityReference runRef ? runRef.Id : (Guid?)null : null,
                documentId = e.Contains("ar.ilx_analysisdocument") ? ((AliasedValue)e["ar.ilx_analysisdocument"]).Value is EntityReference docRef ? docRef.Id : (Guid?)null : null,
                documentName = Aliased(e, "doc.ilx_documentname"),
                attributeId = e.Contains("ar.ilx_templateattribute") ? ((AliasedValue)e["ar.ilx_templateattribute"]).Value is EntityReference attrRef ? attrRef.Id : (Guid?)null : null,
                attributeName = Aliased(e, "attr.ilx_displayname") ?? Aliased(e, "attr.ilx_name"),
                createdOn = e.GetAttributeValue<DateTime?>("createdon")
            }).ToList();

            // Resolve each run's display name (the insight/comparison's own name, same
            // preference order the rest of the app uses: insight name, then run number)
            // via two extra lookups rather than a third level of nested joins — keeps
            // this query from depending on a guessed relationship depth.
            var runNameMap = new Dictionary<Guid, string?>();
            var runIds = items.Where(i => i.runId.HasValue).Select(i => i.runId!.Value).Distinct().ToList();

            if (runIds.Count > 0)
            {
                var runQuery = new QueryExpression("ilx_analysisrun")
                {
                    ColumnSet = new ColumnSet("ilx_runid", "ilx_analysis")
                };
                runQuery.Criteria.AddCondition("ilx_analysisrunid", ConditionOperator.In, runIds.Cast<object>().ToArray());

                var runEntities = service.RetrieveMultiple(runQuery).Entities;

                var comparisonRefsByRun = runEntities.ToDictionary(
                    r => r.Id,
                    r => r.GetAttributeValue<EntityReference>("ilx_analysis"));
                var runNumberByRun = runEntities.ToDictionary(
                    r => r.Id,
                    r => r.GetAttributeValue<string>("ilx_runid"));

                var comparisonNameMap = new Dictionary<Guid, string?>();
                var comparisonRefs = comparisonRefsByRun.Values.Where(r => r != null).Cast<EntityReference>().ToList();

                foreach (var group in comparisonRefs.GroupBy(r => r.LogicalName))
                {
                    var ids = group.Select(r => r.Id).Distinct().ToArray();
                    var comparisonQuery = new QueryExpression(group.Key)
                    {
                        ColumnSet = new ColumnSet("ilx_name")
                    };
                    comparisonQuery.Criteria.AddCondition($"{group.Key}id", ConditionOperator.In, ids.Cast<object>().ToArray());

                    foreach (var c in service.RetrieveMultiple(comparisonQuery).Entities)
                        comparisonNameMap[c.Id] = c.GetAttributeValue<string>("ilx_name");
                }

                foreach (var rid in runIds)
                {
                    var comparisonRef = comparisonRefsByRun.TryGetValue(rid, out var cRef) ? cRef : null;
                    var insightName = comparisonRef != null && comparisonNameMap.TryGetValue(comparisonRef.Id, out var n) ? n : null;
                    runNumberByRun.TryGetValue(rid, out var runNumber);
                    runNameMap[rid] = !string.IsNullOrWhiteSpace(insightName) ? insightName : runNumber;
                }
            }

            var finalItems = items.Select(i => new
            {
                i.id,
                i.title,
                i.analysisResultId,
                i.value,
                i.reminderDate,
                i.offsetDays,
                i.snoozedUntil,
                i.isActive,
                i.pageNumber,
                i.coordinates,
                i.confidenceScore,
                i.riskLevel,
                i.runId,
                runName = i.runId.HasValue && runNameMap.TryGetValue(i.runId.Value, out var rn) ? rn : null,
                i.documentId,
                i.documentName,
                i.attributeId,
                i.attributeName,
                i.createdOn
            }).ToList();

            response.StatusCode = HttpStatusCode.OK;
            await response.WriteStringAsync(JsonSerializer.Serialize(finalItems));
            return response;
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;

            await response.WriteStringAsync(JsonSerializer.Serialize(new
            {
                error = ex.Message
            }));

            return response;
        }
    }
}
