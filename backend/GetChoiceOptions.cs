using System.Linq;
using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class GetChoiceOptions
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public GetChoiceOptions(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("GetChoiceOptions")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {

        var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

        if (string.IsNullOrWhiteSpace(aadTenantId))
        {
            var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        var tenant = _tenantResolver.ResolveTenant(aadTenantId);

        var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

        var query = System.Web.HttpUtility.ParseQueryString(req.Url.Query);

        var entity = query["entity"];
        var field = query["field"];

        if (string.IsNullOrWhiteSpace(entity) || string.IsNullOrWhiteSpace(field))
        {
            var bad = req.CreateResponse(HttpStatusCode.BadRequest);
            await bad.WriteStringAsync("Missing entity or field parameter.");
            return bad;
        }
       
        var request = new RetrieveAttributeRequest
        {
            EntityLogicalName = entity,
            LogicalName = field,
            RetrieveAsIfPublished = true
        };

        var response = (RetrieveAttributeResponse)service.Execute(request);

        var picklist = (PicklistAttributeMetadata)response.AttributeMetadata;

        var result = picklist.OptionSet.Options.Select(o => new
        {
            value = o.Value,
            label = o.Label?.UserLocalizedLabel?.Label
        });

        var httpResponse = req.CreateResponse(HttpStatusCode.OK);

        await httpResponse.WriteAsJsonAsync(result);

        return httpResponse;
    }
}