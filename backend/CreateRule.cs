using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class CreateRule
{

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public CreateRule(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class CreateRuleRequest
    {
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

    [Function("CreateRule")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
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

            var body = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<CreateRuleRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Invalid request.");
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

            var connectionString = Environment.GetEnvironmentVariable("DataverseConnection");
           

            var entity = new Entity("ilx_analysisrule");

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
            entity["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            var id = service.Create(entity);

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(JsonSerializer.Serialize(new
            {
                id = id,
                message = "Rule created successfully."
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
