using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;
using QubixInsight.Services;

public class CreateDocumentType
{
     private readonly ILogger<CreateDocumentType> _logger;

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public CreateDocumentType(
        ILogger<CreateDocumentType> logger,
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _logger = logger;
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    [Function("CreateDocumentType")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "CreateDocumentType")]
        HttpRequestData req)
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

            var body = await new StreamReader(req.Body).ReadToEndAsync();

            _logger.LogInformation($"CreateDocumentType Request: {body}");

            var data = JsonSerializer.Deserialize<Dictionary<string, object>>(body);

            if (!data.ContainsKey("name"))
                throw new Exception("Name field is required");

            var entity = new Entity("ilx_documenttype");

            /* =========================
               NAME
            ========================= */

            entity["ilx_name"] = data["name"].ToString();

            /* =========================
               DESCRIPTION
            ========================= */

            if (data.ContainsKey("description"))
            {
                entity["ilx_description"] = data["description"]?.ToString();
            }

            if (data.ContainsKey("baseAiPrompt"))
                entity["ilx_baseaiprompt"] = data["baseAiPrompt"]?.ToString();

            if (data.ContainsKey("enableCompare"))
                entity["ilx_enablecompare"] = bool.Parse(data["enableCompare"].ToString());

            if (data.ContainsKey("enableScoring"))
                entity["ilx_enablescoring"] = bool.Parse(data["enableScoring"].ToString());

            if (data.ContainsKey("enableSummarise"))
                entity["ilx_enablesummarise"] = bool.Parse(data["enableSummarise"].ToString());

            /* =========================
               ACTIVE / INACTIVE
            ========================= */

            if (data.ContainsKey("isActive"))
            {
                bool isActive = bool.Parse(data["isActive"].ToString());

                entity["statecode"] = new OptionSetValue(isActive ? 0 : 1);
            }
            else
            {
                // default = Active
                entity["statecode"] = new OptionSetValue(0);
            }

            entity["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            var id = service.Create(entity);

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteStringAsync(id.ToString());

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex.ToString());

            var response = req.CreateResponse(HttpStatusCode.InternalServerError);
            await response.WriteStringAsync(ex.Message);

            return response;
        }
    }
}
