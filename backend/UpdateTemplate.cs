using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Crm.Sdk.Messages;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateTemplate
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public UpdateTemplate(
    TenantResolverService tenantResolver,
    TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class UpdateTemplateRequest
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public Guid? DocumentTypeId { get; set; }
        public bool? IsDefault { get; set; }
        public string TemplateAiPrompt { get; set; }
        public JsonElement? AiOutputStyleId { get; set; }
        public string Version { get; set; }
        public bool IsActive { get; set; }
    }

    [Function("UpdateTemplate")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put")] HttpRequestData req)
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

            var data = JsonSerializer.Deserialize<UpdateTemplateRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || data.Id == Guid.Empty)
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid template update request.");
                return bad;
            }           

            /* =========================
               UPDATE NORMAL FIELDS
            ========================= */

            var entity = new Entity("ilx_analysistemplate", data.Id);

            entity["ilx_name"] = data.Name;

            if (data.DocumentTypeId.HasValue && data.DocumentTypeId.Value != Guid.Empty)
                {
                    entity["ilx_documenttype"] =
                        new EntityReference("ilx_documenttype", data.DocumentTypeId.Value);
                }

            entity["ilx_isdefault"] = data.IsDefault ?? false;

            entity["ilx_templateaiprompt"] = data.TemplateAiPrompt ?? "";

            entity["ilx_version"] = data.Version;

            if (data.AiOutputStyleId.HasValue)
            {
                int styleValue = 0;

                if (data.AiOutputStyleId.Value.ValueKind == JsonValueKind.Number)
                    styleValue = data.AiOutputStyleId.Value.GetInt32();

                else if (data.AiOutputStyleId.Value.ValueKind == JsonValueKind.String)
                    int.TryParse(data.AiOutputStyleId.Value.GetString(), out styleValue);

                if (styleValue > 0)
                {
                    entity["ilx_aioutputstyle"] = new OptionSetValue(styleValue);
                }
            }

            service.Update(entity);

            /* =========================
               UPDATE ACTIVE / INACTIVE
            ========================= */

            var setStateRequest = new SetStateRequest
            {
                EntityMoniker = new EntityReference("ilx_analysistemplate", data.Id),
                State = new OptionSetValue(data.IsActive ? 0 : 1),
                Status = new OptionSetValue(data.IsActive ? 1 : 2)
            };

            service.Execute(setStateRequest);

            var response = req.CreateResponse(HttpStatusCode.OK);

            await response.WriteAsJsonAsync(new
            {
                success = true
            });

            return response;
        }
        catch (Exception ex)
        {
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);

            var message =
                ex.InnerException != null
                ? ex.InnerException.Message
                : ex.Message;

            await error.WriteStringAsync(message);

            return error;
        }
    }
}
