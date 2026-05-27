using Microsoft.Extensions.Configuration;
using Microsoft.PowerPlatform.Dataverse.Client;

namespace QubixInsight.Services;

public class TenantDataverseService
{
    private readonly IConfiguration _config;

    public TenantDataverseService(IConfiguration config)
    {
        _config = config;
    }

    public ServiceClient CreateClient(string dataverseUrl)
    {
        var clientId = _config["CLIENT_ID"];
        var clientSecret = _config["CLIENT_SECRET"];
        var tenantId = _config["TENANT_ID"];

        var connectionString =
        $"AuthType=ClientSecret;" +
        $"Url={dataverseUrl};" +
        $"ClientId={clientId};" +
        $"ClientSecret={clientSecret};" +
        $"TenantId={tenantId};" +
        $"RequireNewInstance=true;";

        var service = new ServiceClient(connectionString);

        if (!service.IsReady)
        {
            throw new Exception(
                $"Tenant Dataverse connection failed.\n" +
                $"URL: {dataverseUrl}\n" +
                $"Error: {service.LastError}"
            );
        }

        return service;
    }
}