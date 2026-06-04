using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;
using Microsoft.Crm.Sdk.Messages;
using QubixInsight.Services;

public class UpdateDocumentType
{
   
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;
    private readonly ILogger<UpdateDocumentType> _logger;
    public UpdateDocumentType(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService,
        ILogger<UpdateDocumentType> logger)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
        _logger = logger;
    }

    [Function("UpdateDocumentType")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "UpdateDocumentType/{id}")]
        HttpRequestData req,
        string id)
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

            _logger.LogInformation($"Updating DocumentType {id}");

            var body = await new StreamReader(req.Body).ReadToEndAsync();

            _logger.LogInformation($"Request Body: {body}");

            var data = JsonSerializer.Deserialize<Dictionary<string, object>>(body);

            if (!data.ContainsKey("name"))
                throw new Exception("Name field missing");

            Guid recordId = Guid.Parse(id);

            /* =========================
               UPDATE NORMAL FIELDS
            ========================= */

            var entity = new Entity("ilx_documenttype", recordId);

            entity["ilx_name"] = data["name"].ToString();

            if (data.ContainsKey("description"))
                entity["ilx_description"] = data["description"]?.ToString();

            if (data.ContainsKey("baseAiPrompt"))
                entity["ilx_baseaiprompt"] = data["baseAiPrompt"]?.ToString();

            if (data.ContainsKey("enableCompare"))
                entity["ilx_enablecompare"] = bool.Parse(data["enableCompare"].ToString());

            if (data.ContainsKey("enableScoring"))
                entity["ilx_enablescoring"] = bool.Parse(data["enableScoring"].ToString());

            if (data.ContainsKey("enableSummarise"))
                entity["ilx_enablesummarise"] = bool.Parse(data["enableSummarise"].ToString());

            service.Update(entity);

            /* =========================
               UPDATE ACTIVE / INACTIVE
            ========================= */

            if (data.ContainsKey("isActive"))
            {
                bool isActive = bool.Parse(data["isActive"].ToString());

                var state = isActive ? 0 : 1;

                var setStateRequest = new SetStateRequest
                {
                    EntityMoniker = new EntityReference("ilx_documenttype", recordId),
                    State = new OptionSetValue(state),
                    Status = new OptionSetValue(isActive ? 1 : 2)
                };

                service.Execute(setStateRequest);
            }

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteStringAsync("Updated");

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
