using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class CreateTemplate
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public CreateTemplate(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
        {
            _tenantResolver = tenantResolver;
            _tenantDataverseService = tenantDataverseService;
        }

    public class CreateTemplateRequest
    {
        public string Name { get; set; }
        public Guid DocumentTypeId { get; set; }
        public bool IsDefault { get; set; }
        public string TemplateAiPrompt { get; set; }
        public string AiOutputStyleId { get; set; }
        public bool IsActive { get; set; }
        public string Version { get; set; }
    }

    [Function("CreateTemplate")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
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

            var requestBody = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<CreateTemplateRequest>(
                requestBody,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || string.IsNullOrWhiteSpace(data.Name))
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid request payload.");
                return bad;
            }
           

            var entity = new Entity("ilx_analysistemplate");

            entity["ilx_name"] = data.Name;
            entity["ilx_documenttype"] =
                new EntityReference("ilx_documenttype", data.DocumentTypeId);

            entity["ilx_isdefault"] = data.IsDefault;
            entity["ilx_templateaiprompt"] = data.TemplateAiPrompt;

            entity["ilx_version"] = data.Version;

            if (!string.IsNullOrEmpty(data.AiOutputStyleId))
            {
            entity["ilx_aioutputstyle"] =
                new OptionSetValue(int.Parse(data.AiOutputStyleId));
            }

            // Active / Inactive
            entity["statecode"] = data.IsActive ? new OptionSetValue(0) : new OptionSetValue(1);

            entity["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            var id = service.Create(entity);

            var response = req.CreateResponse(HttpStatusCode.OK);

            await response.WriteAsJsonAsync(new
            {
                success = true,
                id = id
            });

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
