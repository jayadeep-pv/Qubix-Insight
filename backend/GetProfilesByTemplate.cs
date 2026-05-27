using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetProfilesByTemplate
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetProfilesByTemplate(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetProfilesByTemplate")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
        {
            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var templateId = System.Web.HttpUtility.ParseQueryString(req.Url.Query)["templateId"];

            if (string.IsNullOrWhiteSpace(templateId) || !Guid.TryParse(templateId, out var templateGuid))
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("templateId is required.");
                return response;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            // Query the junction table, joining to the profile for name
            var query = new QueryExpression("ilx_templateaiprofile")
            {
                ColumnSet = new ColumnSet(
                    "ilx_templateaiprofileid",
                    "ilx_aiinsightprofile",
                    "ilx_isdefault",
                    "ilx_displayorder"
                )
            };

            query.Criteria.AddCondition("ilx_analysistemplate", ConditionOperator.Equal, templateGuid);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);

            // Join to profile to get name
            var profileLink = query.AddLink(
                "ilx_aiinsightprofile",
                "ilx_aiinsightprofile",
                "ilx_aiinsightprofileid",
                JoinOperator.Inner);
            profileLink.Columns = new ColumnSet("ilx_name");
            profileLink.EntityAlias = "profile";

            // Only return profiles that are still active
            profileLink.LinkCriteria.AddCondition("statecode", ConditionOperator.Equal, 0);

            query.AddOrder("ilx_displayorder", OrderType.Ascending);

            var results = service.RetrieveMultiple(query);

            var profiles = results.Entities.Select(e =>
            {
                var profileRef = e.GetAttributeValue<EntityReference>("ilx_aiinsightprofile");
                var profileName = e.GetAttributeValue<AliasedValue>("profile.ilx_name")?.Value as string;

                return new
                {
                    id = e.Id,
                    profileId = profileRef?.Id,
                    profileName = profileName ?? "",
                    isDefault = e.GetAttributeValue<bool>("ilx_isdefault"),
                    displayOrder = e.GetAttributeValue<int?>("ilx_displayorder")
                };
            });

            response.StatusCode = HttpStatusCode.OK;
            response.Headers.Add("Content-Type", "application/json");
            await response.WriteStringAsync(JsonSerializer.Serialize(profiles));
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;
            await response.WriteStringAsync(ex.Message);
        }

        return response;
    }
}

