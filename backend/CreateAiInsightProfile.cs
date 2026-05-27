using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class CreateAiInsightProfile
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public CreateAiInsightProfile(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class Request
    {
        public string ProfileName { get; set; }
        public string ProfileCode { get; set; }
        public int? ProfileStatus { get; set; }
        public string Prompt { get; set; }
        public int? DisplayOrder { get; set; }
    }

    [Function("CreateAiInsightProfile")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
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

            // Read request body
            var body = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<Request>(
                body,
                new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

            // Validation
            if (data == null || string.IsNullOrWhiteSpace(data.ProfileName))
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("ProfileName is required.");
                return response;
            }
           

            var entity = new Entity("ilx_aiinsightprofile");

            entity["ilx_name"] = data.ProfileName;

            if (!string.IsNullOrWhiteSpace(data.ProfileCode))
                entity["ilx_profilecode"] = data.ProfileCode;

            if (!string.IsNullOrWhiteSpace(data.Prompt))
                entity["ilx_prompt"] = data.Prompt;

            if (data.DisplayOrder.HasValue)
                entity["ilx_displayorder"] = data.DisplayOrder.Value;

            if (data.ProfileStatus.HasValue)
                entity["ilx_profilestatus"] =
                    new OptionSetValue(data.ProfileStatus.Value);

            entity["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            var id = service.Create(entity);

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(JsonSerializer.Serialize(new
            {
                id = id
            }));
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;
            await response.WriteStringAsync(ex.Message);
        }

        return response;
    }
}
