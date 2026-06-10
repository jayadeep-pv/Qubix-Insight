using Azure.Identity;
using Azure.Storage.Blobs;

namespace QubixInsight.Services;

/// <summary>
/// Creates a BlobServiceClient that works both locally and in Azure.
///
/// Locally  — set Qubix_BlobConnectionString in local.settings.json.
///            The client uses the account key so SAS tokens can be generated
///            without Entra ID (blobClient.CanGenerateSasUri == true).
///
/// In Azure — leave Qubix_BlobConnectionString unset.
///            The client uses DefaultAzureCredential (Managed Identity) and
///            SAS tokens are generated via user-delegation keys.
/// </summary>
public static class BlobHelper
{
    public static BlobServiceClient CreateServiceClient()
    {
        var connStr = Environment.GetEnvironmentVariable("Qubix_BlobConnectionString");
        if (!string.IsNullOrWhiteSpace(connStr))
            return new BlobServiceClient(connStr);

        var baseUrl = Environment.GetEnvironmentVariable("Qubix_BlobBaseUrl")
            ?? throw new Exception("Qubix_BlobBaseUrl is not configured.");

        return new BlobServiceClient(new Uri(baseUrl), new DefaultAzureCredential());
    }
}
