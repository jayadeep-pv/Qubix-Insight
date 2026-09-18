using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class PinReminder
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public PinReminder(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class PinReminderRequest
    {
        public Guid AnalysisResultId { get; set; }

        public string Title { get; set; }

        public DateTime ReminderDate { get; set; }

        public int? OffsetDays { get; set; }
    }

    [Function("PinReminder")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req)
    {
        var response = req.CreateResponse();

        try
        {
            var userInfo = JwtTenantExtractor.GetUserInfo(req);

            if (userInfo is null || string.IsNullOrWhiteSpace(userInfo.TenantId) || string.IsNullOrWhiteSpace(userInfo.Email))
            {
                var bad = req.CreateResponse(HttpStatusCode.Unauthorized);
                await bad.WriteStringAsync("Unable to determine user from Bearer token.");
                return bad;
            }

            var tenant = _tenantResolver.ResolveTenant(userInfo.TenantId);
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            var body = await new StreamReader(req.Body).ReadToEndAsync();

            var data = JsonSerializer.Deserialize<PinReminderRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || data.AnalysisResultId == Guid.Empty)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("A valid AnalysisResultId is required.");
                return response;
            }

            if (string.IsNullOrWhiteSpace(data.Title))
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("Title is required.");
                return response;
            }

            // Re-pinning the same value is an update, not a duplicate row.
            var existingQuery = new QueryExpression("ilx_userreminder")
            {
                ColumnSet = new ColumnSet("ilx_userreminderid"),
                TopCount = 1
            };
            existingQuery.Criteria.AddCondition("ilx_analysisresult", ConditionOperator.Equal, data.AnalysisResultId);
            existingQuery.Criteria.AddCondition("ilx_useremail", ConditionOperator.Equal, userInfo.Email);

            var existing = service.RetrieveMultiple(existingQuery).Entities.FirstOrDefault();

            var entity = new Entity("ilx_userreminder", existing?.Id ?? Guid.Empty);

            entity["ilx_reminderid"] = data.Title;
            entity["ilx_analysisresult"] = new EntityReference("ilx_analysisresult", data.AnalysisResultId);
            entity["ilx_useremail"] = userInfo.Email;
            entity["ilx_reminderdate"] = data.ReminderDate;

            if (data.OffsetDays.HasValue)
                entity["ilx_offsetdays"] = data.OffsetDays.Value;

            Guid id;

            if (existing != null)
            {
                entity["statecode"] = new OptionSetValue(0);
                entity["ilx_snoozeduntil"] = null;
                service.Update(entity);
                id = existing.Id;
            }
            else
            {
                id = service.Create(entity);
            }

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(JsonSerializer.Serialize(new
            {
                id,
                message = "Reminder pinned."
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
