using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UpdateUserReminder
{
    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public UpdateUserReminder(
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public class UpdateUserReminderRequest
    {
        public Guid Id { get; set; }

        public DateTime? ReminderDate { get; set; }

        public DateTime? SnoozedUntil { get; set; }

        // Distinguishes "leave snooze alone" (both false/omitted) from "clear the
        // snooze" (true, with SnoozedUntil left null) — a plain nullable DateTime
        // can't tell "field omitted" apart from "field explicitly cleared".
        public bool ClearSnooze { get; set; }

        public bool? IsActive { get; set; }
    }

    [Function("UpdateUserReminder")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put")] HttpRequestData req)
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

            var data = JsonSerializer.Deserialize<UpdateUserReminderRequest>(
                body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (data == null || data.Id == Guid.Empty)
            {
                response.StatusCode = HttpStatusCode.BadRequest;
                await response.WriteStringAsync("A valid Id is required.");
                return response;
            }

            // A reminder belongs to exactly the person who pinned it — verify before mutating.
            var current = service.Retrieve("ilx_userreminder", data.Id, new ColumnSet("ilx_useremail"));
            var owner = current.GetAttributeValue<string>("ilx_useremail");

            if (!string.Equals(owner, userInfo.Email, StringComparison.OrdinalIgnoreCase))
            {
                var forbidden = req.CreateResponse(HttpStatusCode.Forbidden);
                await forbidden.WriteStringAsync("This reminder belongs to a different user.");
                return forbidden;
            }

            var entity = new Entity("ilx_userreminder", data.Id);

            if (data.ReminderDate.HasValue)
                entity["ilx_reminderdate"] = data.ReminderDate.Value;

            if (data.SnoozedUntil.HasValue)
                entity["ilx_snoozeduntil"] = data.SnoozedUntil.Value;
            else if (data.ClearSnooze)
                entity["ilx_snoozeduntil"] = null;

            if (data.IsActive.HasValue)
                entity["statecode"] = new OptionSetValue(data.IsActive.Value ? 0 : 1);

            service.Update(entity);

            response.StatusCode = HttpStatusCode.OK;

            await response.WriteStringAsync(JsonSerializer.Serialize(new
            {
                id = data.Id,
                message = "Reminder updated."
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
