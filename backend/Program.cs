using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Azure;
using Azure.AI.OpenAI;
using QubixInsight.Services;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
                // Dataverse
        services.AddSingleton<ServiceClient>(sp =>
        {
            var connectionString =
                Environment.GetEnvironmentVariable("Qubix_DataverseConnection");

            if (string.IsNullOrEmpty(connectionString))
                throw new InvalidOperationException(
                    "DataverseConnection environment variable not set.");

            var serviceClient = new ServiceClient(connectionString);

            if (!serviceClient.IsReady)
                throw new InvalidOperationException(
                    "Dataverse ServiceClient failed to connect.");

            return serviceClient;
        });

        // Dataverse
        // Share the same connection — avoids a second OAuth handshake at startup
        services.AddSingleton<IOrganizationService>(sp =>
            sp.GetRequiredService<ServiceClient>());

        // Azure OpenAI
        services.AddSingleton<AzureOpenAIClient>(sp =>
        {
            var endpoint =
                Environment.GetEnvironmentVariable("Qubix_AzureOpenAIEndpoint");
            var key =
                Environment.GetEnvironmentVariable("Qubix_AzureOpenAIKey");

            if (string.IsNullOrEmpty(endpoint) ||
                string.IsNullOrEmpty(key))
            {
                throw new InvalidOperationException(
                    "Azure OpenAI environment variables not set.");
            }

            return new AzureOpenAIClient(
                new Uri(endpoint),
                new AzureKeyCredential(key));
        });

        services.AddMemoryCache();
        services.AddHttpClient();

        services.AddSingleton<AiSummaryService>();
        services.AddSingleton<AiExtractionService>();
        services.AddSingleton<AzureOcrService>();
        services.AddSingleton<TenantResolverService>();
        services.AddSingleton<TenantUserService>();
        services.AddSingleton<TenantDataverseService>();
        services.AddSingleton<GraphService>();
    })
    .Build();

host.Run();