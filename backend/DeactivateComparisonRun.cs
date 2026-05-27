using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class DeactivateComparisonRun
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public DeactivateComparisonRun(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("DeactivateComparisonRun")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "put", Route = "DeactivateComparisonRun/{id}")]
        HttpRequestData req,
        string id)
    {
        try
        {
            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var tenant  = _tenantResolver.ResolveTenant(aadTenantId);
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            if (!Guid.TryParse(id, out var recordId))
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid record id.");
                return bad;
            }

            // Read activate query param (?activate=true to reactivate)
            var activate = req.Query["activate"]?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;

            var setStateRequest = new SetStateRequest
            {
                EntityMoniker = new EntityReference("ilx_analysisrun", recordId),
                State  = new OptionSetValue(activate ? 0 : 1),
                Status = new OptionSetValue(activate ? 1 : 2)
            };

            service.Execute(setStateRequest);

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(new { success = true, isActive = activate });
            return response;
        }
        catch (Exception ex)
        {
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync(ex.Message);
            return error;
        }
    }
}

