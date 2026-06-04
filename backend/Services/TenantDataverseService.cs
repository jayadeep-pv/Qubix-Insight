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
        // Trial tenants have no dedicated DataverseUrl — fall back to the master environment
        if (string.IsNullOrWhiteSpace(dataverseUrl))
            dataverseUrl = _config["Qubix_MainDataverseUrl"] ?? "";

        var clientId = _config["Qubix_ClientId"];
        var clientSecret = _config["Qubix_ClientSecret"];
        var tenantId = _config["Qubix_TenantId"];

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