using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class SaveTemplateProfiles
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public SaveTemplateProfiles(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class ProfileEntry
    {
        public string ProfileId { get; set; } = "";
        public bool IsDefault { get; set; }
        public int? DisplayOrder { get; set; }
    }

    public class Request
    {
        public string TemplateId { get; set; } = "";
        public List<ProfileEntry> Profiles { get; set; } = new();
    }

    [Function("SaveTemplateProfiles")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
        {
            var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

            if (string.IsNullOrWhiteSpace(aadTenantId))
            {
                var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
                return bad;
            }

            var body = await new StreamReader(req.Body).ReadToEndAsync();
            var data = JsonSerializer.Deserialize<Request>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || !Guid.TryParse(data.TemplateId, out var templateGuid))
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("TemplateId is required.");
                return response;
            }

            var tenant = _tenantResolver.ResolveTenant(aadTenantId);
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            // Delete all existing junction records for this template
            var existing = new QueryExpression("ilx_templateaiprofile")
            {
                ColumnSet = new ColumnSet("ilx_templateaiprofileid")
            };
            existing.Criteria.AddCondition("ilx_analysistemplate", ConditionOperator.Equal, templateGuid);

            var existingResults = service.RetrieveMultiple(existing);
            foreach (var record in existingResults.Entities)
                service.Delete("ilx_templateaiprofile", record.Id);

            // Re-create from the submitted list
            for (int i = 0; i < data.Profiles.Count; i++)
            {
                var entry = data.Profiles[i];

                if (!Guid.TryParse(entry.ProfileId, out var profileGuid))
                    continue;

                var junction = new Entity("ilx_templateaiprofile");
                junction["ilx_analysistemplate"] = new EntityReference("ilx_analysistemplate", templateGuid);
                junction["ilx_aiinsightprofile"] = new EntityReference("ilx_aiinsightprofile", profileGuid);
                junction["ilx_isdefault"] = entry.IsDefault;
                junction["ilx_displayorder"] = entry.DisplayOrder ?? i;

                service.Create(junction);
            }

            response.StatusCode = HttpStatusCode.OK;
            await response.WriteStringAsync(JsonSerializer.Serialize(new { success = true }));
        }
        catch (Exception ex)
        {
            response.StatusCode = HttpStatusCode.InternalServerError;
            await response.WriteStringAsync(ex.Message);
        }

        return response;
    }
}

