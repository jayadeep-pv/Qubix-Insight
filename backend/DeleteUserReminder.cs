using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class DeleteUserReminder
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public DeleteUserReminder(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("DeleteUserReminder")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete")] HttpRequestData req)
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
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            var queryParams = System.Web.HttpUtility.ParseQueryString(req.Url.Query);

            if (!Guid.TryParse(queryParams["id"], out var id))
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("A valid id is required.");
                return response;
            }

            var current = service.Retrieve("ilx_userreminder", id, new ColumnSet("ilx_useremail"));
            var owner = current.GetAttributeValue<string>("ilx_useremail");

            if (!string.Equals(owner, userInfo.Email, StringComparison.OrdinalIgnoreCase))
            {
                var forbidden = req.CreateResponse(HttpStatusCode.Forbidden);
                await forbidden.WriteStringAsync("This reminder belongs to a different user.");
                return forbidden;
            }

            service.Delete("ilx_userreminder", id);

            response.StatusCode = HttpStatusCode.OK;
            await response.WriteStringAsync(JsonSerializer.Serialize(new { id, message = "Reminder removed." }));
            return response;
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;
            await response.WriteStringAsync(JsonSerializer.Serialize(new { error = ex.Message }));
            return response;
        }
    }
}
