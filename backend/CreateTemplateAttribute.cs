using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class CreateTemplateAttribute
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public CreateTemplateAttribute(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    // ── Typed request DTO — eliminates all JsonElement casting issues ──
    private class CreateTemplateAttributeRequest
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("displayName")]
        public string? DisplayName { get; set; }

        [JsonPropertyName("attributeKey")]
        public string? AttributeKey { get; set; }

        [JsonPropertyName("aiExtractionHint")]
        public string? AiExtractionHint { get; set; }

        /// <summary>
        /// GUID of the ilx_attributecategory lookup record.
        /// Null when the AI category could not be matched — field is left blank.
        /// </summary>
        [JsonPropertyName("categoryId")]
        public string? CategoryId { get; set; }

        /// <summary>ilx_expecteddatatype option-set value (e.g. 857270001 = Text).</summary>
        [JsonPropertyName("expectedDataType")]
        public int ExpectedDataType { get; set; }

        [JsonPropertyName("displayOrder")]
        public int? DisplayOrder { get; set; }

        [JsonPropertyName("isMandatory")]
        public bool IsMandatory { get; set; }

        [JsonPropertyName("usageMode")]
        public int? UsageMode { get; set; }

        [JsonPropertyName("templateId")]
        public string? TemplateId { get; set; }
    }

    [Function("CreateTemplateAttribute")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req)
    {
        try
        {
            // ── Tenant resolution ──
            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            // ── Deserialise into typed DTO (no manual JsonElement casts) ──
            var body = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<CreateTemplateAttributeRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null)
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid request body.");
                return bad;
            }

            // ── Build entity ──
            var entity = new Entity("ilx_templateattribute");

            entity["ilx_name"]             = data.Name        ?? string.Empty;
            entity["ilx_displayname"]      = data.DisplayName ?? string.Empty;
            entity["ilx_attributekey"]     = data.AttributeKey ?? string.Empty;
            entity["ilx_aiextractionhint"] = data.AiExtractionHint ?? string.Empty;

            // ilx_attributecategory — lookup, only set when a valid GUID was matched.
            // Null/empty means the AI category had no match; field is left blank.
            if (!string.IsNullOrWhiteSpace(data.CategoryId) &&
                Guid.TryParse(data.CategoryId, out var categoryGuid))
            {
                entity["ilx_attributecategory"] =
                    new EntityReference("ilx_attributecategory", categoryGuid);
            }

            entity["ilx_expecteddatatype"] = new OptionSetValue(data.ExpectedDataType);

            if (data.DisplayOrder.HasValue)
                entity["ilx_displayorder"] = data.DisplayOrder.Value;

            entity["ilx_ismandatory"] = data.IsMandatory;

            if (data.UsageMode.HasValue)
                entity["ilx_usagemode"] = new OptionSetValue(data.UsageMode.Value);

            if (!string.IsNullOrWhiteSpace(data.TemplateId) &&
                Guid.TryParse(data.TemplateId, out var templateGuid))
            {
                entity["ilx_analysistemplate"] =
                    new EntityReference("ilx_analysistemplate", templateGuid);
            }
            else
            {
                var bad = req.CreateResponse(HttpStatusCode.BadRequest);
                await bad.WriteStringAsync("Invalid or missing templateId.");
                return bad;
            }

            entity["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            service.Create(entity);

            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(new { success = true });
            return response;
        }
        catch (Exception ex)
        {
            var error = req.CreateResponse(HttpStatusCode.InternalServerError);
            await error.WriteStringAsync($"CreateTemplateAttribute failed: {ex.Message}");
            return error;
        }
    }
}

