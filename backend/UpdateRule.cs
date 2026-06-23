using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateRule
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;
    private readonly TenantUserService _tenantUserService;

    public UpdateRule(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService,
        TenantUserService tenantUserService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
        _tenantUserService = tenantUserService;
    }

    public class UpdateRuleRequest
    {
        public Guid Id { get; set; }

        public string Name { get; set; }

        public string AdvisoryText { get; set; }

        public Guid TemplateId { get; set; }

        public Guid TemplateAttributeId { get; set; }

        public int? ComparisonDirection { get; set; }

        public int? ImpactCategory { get; set; }

        public int? Severity { get; set; }

        public int? Weight { get; set; }

        public bool IsActive { get; set; }
    }

    [Function("UpdateRule")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
        {

            var userInfo = JwtTenantExtractor.GetUserInfo(req);

            if (userInfo is null || string.IsNullOrWhiteSpace(userInfo.TenantId))
            {
                var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            if (!_tenantUserService.IsAdmin(userInfo))
            {
                var forbidden = req.CreateResponse(HttpStatusCode.Forbidden);
                await forbidden.WriteStringAsync("Admin access required.");
                return forbidden;
            }

            var tenant = _tenantResolver.ResolveTenant(userInfo.TenantId);

            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            var body = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<UpdateRuleRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || data.Id == Guid.Empty)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Valid Id is required.");
                return response;
            }

            if (string.IsNullOrWhiteSpace(data.Name))
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Rule name is required.");
                return response;
            }

            if (data.TemplateId == Guid.Empty)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Template is required.");
                return response;
            }

            if (data.TemplateAttributeId == Guid.Empty)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Template attribute is required.");
                return response;
            }         
            

            var entity = new Entity("ilx_analysisrule", data.Id);

            entity["ilx_name"] = data.Name;

            entity["ilx_advisorytext"] = data.AdvisoryText;

            entity["ilx_analysistemplate"] =
                new EntityReference("ilx_analysistemplate", data.TemplateId);

            entity["ilx_templateattribute"] =
                new EntityReference("ilx_templateattribute", data.TemplateAttributeId);

            if (data.ComparisonDirection.HasValue)
                entity["ilx_analysisdirection"] =
                    new OptionSetValue(data.ComparisonDirection.Value);

            if (data.ImpactCategory.HasValue)
                entity["ilx_impactcategory"] =
                    new OptionSetValue(data.ImpactCategory.Value);

            if (data.Severity.HasValue)
                entity["ilx_severity"] =
                    new OptionSetValue(data.Severity.Value);

            if (data.Weight.HasValue)
                entity["ilx_weight"] = data.Weight.Value;

            entity["statecode"] = new OptionSetValue(data.IsActive ? 0 : 1);

            service.Update(entity);

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(JsonSerializer.Serialize(new
            {
                id = data.Id,
                message = "Rule updated successfully."
            }));

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
