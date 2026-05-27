using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Crm.Sdk.Messages;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateTemplateAttribute
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;
   
    public UpdateTemplateAttribute(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }
    public class UpdateTemplateAttributeRequest
    {
        public Guid Id { get; set; }
        public Guid? TemplateId { get; set; }

        public string Name { get; set; }
        public string DisplayName { get; set; }
        public string AttributeKey { get; set; }
        public string AiExtractionHint { get; set; }

        public int? Category { get; set; }
        public int? ExpectedDataType { get; set; }
        public int? UsageMode { get; set; }
        public int? DisplayOrder { get; set; }

        public bool? IsMandatory { get; set; }

        public bool IsActive { get; set; }   // required for activate/deactivate
    }

    [Function("UpdateTemplateAttribute")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "put")] HttpRequestData req)
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

            var data = JsonSerializer.Deserialize<UpdateTemplateAttributeRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || data.Id == Guid.Empty)
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid update request.");
                return bad;
            }

            var entity = new Entity("ilx_templateattribute", data.Id);

            /* =========================
               NORMAL FIELDS
            ========================= */

            entity["ilx_name"] = data.Name;
            entity["ilx_displayname"] = data.DisplayName;

            entity["ilx_attributekey"] = data.AttributeKey;
            entity["ilx_aiextractionhint"] = data.AiExtractionHint;

            /* =========================
               OPTION SETS
            ========================= */

            if (data.Category.HasValue)
                entity["ilx_category"] = new OptionSetValue(data.Category.Value);

            if (data.ExpectedDataType.HasValue)
                entity["ilx_expecteddatatype"] = new OptionSetValue(data.ExpectedDataType.Value);

            if (data.UsageMode.HasValue)
                entity["ilx_usagemode"] = new OptionSetValue(data.UsageMode.Value);

            if (data.DisplayOrder.HasValue)
                entity["ilx_displayorder"] = data.DisplayOrder.Value;

            if (data.IsMandatory.HasValue)
                entity["ilx_ismandatory"] = data.IsMandatory.Value;

            /* =========================
               TEMPLATE LOOKUP
            ========================= */

            if (data.TemplateId.HasValue && data.TemplateId.Value != Guid.Empty)
            {
                entity["ilx_analysistemplate"] =
                    new EntityReference(
                        "ilx_analysistemplate",
                        data.TemplateId.Value
                    );
            }

            var setStateRequest = new SetStateRequest
            {
                EntityMoniker = new EntityReference("ilx_templateattribute", data.Id),
                State  = new OptionSetValue(data.IsActive ? 0 : 1),
                Status = new OptionSetValue(data.IsActive ? 1 : 2)
            };

            if (data.IsActive)
            {
                // Activate first so Dataverse accepts the subsequent field update
                service.Execute(setStateRequest);
                service.Update(entity);
            }
            else
            {
                // Update fields first, then deactivate
                service.Update(entity);
                service.Execute(setStateRequest);
            }

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
            await error.WriteStringAsync(ex.Message);
            return error;
        }
    }
}
