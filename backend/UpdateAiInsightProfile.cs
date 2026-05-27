using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateAiInsightProfile
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public UpdateAiInsightProfile(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class Request
    {
        public Guid Id { get; set; }

        public string ProfileName { get; set; }

        public string ProfileCode { get; set; }

        public int? ProfileStatus { get; set; }

        public string Prompt { get; set; }

        public int? DisplayOrder { get; set; }

        public int? Statecode { get; set; }
    }

    [Function("UpdateAiInsightProfile")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "put")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
        {
            var body = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<Request>(
                body,
                new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

            if (data == null || data.Id == Guid.Empty)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Id is required.");
                return response;
            }

            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);
            using var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            var entity = new Entity("ilx_aiinsightprofile");

            // IMPORTANT
            entity.Id = data.Id;

            entity["ilx_name"] = data.ProfileName;

            entity["ilx_profilecode"] = data.ProfileCode;

            entity["ilx_prompt"] = data.Prompt;

            if (data.DisplayOrder.HasValue)
                entity["ilx_displayorder"] = data.DisplayOrder.Value;

            if (data.ProfileStatus.HasValue)
                entity["ilx_profilestatus"] =
                    new OptionSetValue(data.ProfileStatus.Value);

            if (data.Statecode.HasValue)
                entity["statecode"] =
                    new OptionSetValue(data.Statecode.Value);

            service.Update(entity);

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync("Updated");

        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;
            await response.WriteStringAsync(ex.Message);
        }

        return response;
    }
}
