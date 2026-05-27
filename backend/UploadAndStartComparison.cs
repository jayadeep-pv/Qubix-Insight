using System.Net;
using System.Text;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using HttpMultipartParser;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using QubixInsight.Services;

namespace QubixInsight.Functions;

public class UploadAndStartComparison
{
    private readonly ILogger _logger;

    private const int MODE_COMPARE = 857270000;
    private const int MODE_SUMMARISE = 857270001;
    private const int MODE_SCORE = 857270002;

    private readonly TenantResolverService _tenantResolver;
    private readonly TenantDataverseService _tenantDataverseService;

    public UploadAndStartComparison(
        ILoggerFactory loggerFactory,
        TenantResolverService tenantResolver,
        TenantDataverseService tenantDataverseService)
    {
        _logger = loggerFactory.CreateLogger<UploadAndStartComparison>();
        _tenantResolver = tenantResolver;
        _tenantDataverseService = tenantDataverseService;
    }

    public UploadAndStartComparison(ILoggerFactory loggerFactory)
    {
        _logger = loggerFactory.CreateLogger<UploadAndStartComparison>();
    }

    [Function("UploadAndStartComparison")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req)
    {
        _logger.LogInformation("=== UploadAndStartComparison START ===");

        var aadTenantId = JwtTenantExtractor.GetAadTenantId(req);

        if (string.IsNullOrWhiteSpace(aadTenantId))
        {
            var bad = req.CreateResponse(System.Net.HttpStatusCode.Unauthorized);
            await bad.WriteStringAsync("Unable to determine tenant from Bearer token.");
            return bad;
        }

        var tenant = _tenantResolver.ResolveTenant(aadTenantId);

        try
        {
            /* =========================================================
             * 1. Parse multipart form
             * ========================================================= */
            var form = await MultipartFormDataParser.ParseAsync(req.Body);

            var userEmail = req.Headers.TryGetValues("x-user-email", out var emailValues)
                ? emailValues.FirstOrDefault()
                : null;

            var userName = req.Headers.TryGetValues("x-user-name", out var nameValues)
                ? nameValues.FirstOrDefault()
                : null;

            var userAadId = req.Headers.TryGetValues("x-user-id", out var idValues)
                ? idValues.FirstOrDefault()
                : null;

            if (form.Files == null || form.Files.Count == 0)
                throw new Exception("No files uploaded");

            var comparisonName = form.GetParameterValue("comparisonName");
            var documentTypeId = form.GetParameterValue("documentTypeId");
            var templateId = form.GetParameterValue("comparisonTemplateId");
            var modeString = form.GetParameterValue("mode") ?? "Compare";
            var aiScopeString = form.GetParameterValue("aiScope") ?? "Hybrid";

            // Trial accounts may only upload for Summarise (Quick Extract) mode
            var isTrialBlockedMode = tenant.IsTrial &&
                !modeString.Equals("Summarise", StringComparison.OrdinalIgnoreCase);

            if (isTrialBlockedMode)
            {
                var forbidden = req.CreateResponse(System.Net.HttpStatusCode.Forbidden);
                await forbidden.WriteStringAsync("Trial accounts can only use Quick Extract. Upgrade to run comparisons.");
                return forbidden;
            }

            if (string.IsNullOrWhiteSpace(comparisonName))
                throw new Exception("comparisonName is required");

            if (!Guid.TryParse(documentTypeId, out var documentTypeGuid))
                throw new Exception("documentTypeId is invalid");

            if (!Guid.TryParse(templateId, out var templateGuid))
                throw new Exception("comparisonTemplateId is invalid");

            /* =========================================================
             * 2. Dataverse connection
             * ========================================================= */
            var service = _tenantDataverseService.CreateClient(tenant.DataverseUrl);

            /* =========================================================
             * 3. Create Comparison
             * ========================================================= */
            var comparison = new Entity("ilx_analysis");

            comparison["ilx_name"] = comparisonName;
            comparison["ilx_documenttype"] =
                new EntityReference("ilx_documenttype", documentTypeGuid);
            comparison["ilx_analysistemplate"] =
                new EntityReference("ilx_analysistemplate", templateGuid);

            comparison["ilx_analysisstatus"] =
                new OptionSetValue(857270000); // Draft

            comparison["ilx_executedbyemail"] = userEmail;
            comparison["ilx_executedbyuser"] = userName;
            comparison["ilx_executedbyaadobjectid"] = userAadId;
            comparison["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            var comparisonId = service.Create(comparison);

            /* =========================================================
            * 4. Blob setup (TENANT-AWARE)
            * ========================================================= */

            var blobBaseUrl = Environment.GetEnvironmentVariable("BlobBaseUrl");

            if (string.IsNullOrWhiteSpace(blobBaseUrl))
                throw new Exception("BlobBaseUrl missing");

            var blobService = new BlobServiceClient(
                new Uri(blobBaseUrl),
                new DefaultAzureCredential());

            // ✅ THEN get container using tenant
            var container = blobService.GetBlobContainerClient(tenant.BlobContainerName);

            var sasMinutes =
                int.Parse(Environment.GetEnvironmentVariable("SAS_EXPIRY_MINUTES") ?? "30");

            // ✅ Ensure exists
            await container.CreateIfNotExistsAsync();

            /* =========================================================
             * 5. Create Comparison Run
             * ========================================================= */
            var runTimestamp = DateTime.UtcNow;

            var blobBasePath =
                $"comparisons/{comparisonId}/runs/{runTimestamp:yyyyMMddHHmmss}/";

            var runEntity = new Entity("ilx_analysisrun");

            runEntity["ilx_analysis"] =
                new EntityReference("ilx_analysis", comparisonId);

            runEntity["ilx_analysistemplate"] =
                new EntityReference("ilx_analysistemplate", templateGuid);

            runEntity["ilx_documenttype"] =
                new EntityReference("ilx_documenttype", documentTypeGuid);

            runEntity["ilx_runstatus"] =
                new OptionSetValue(857270000); // Draft

            runEntity["ilx_runtimestamp"] = runTimestamp;
            runEntity["ilx_blobpath"] = blobBasePath;

            runEntity["ilx_executedbyemail"] = userEmail;
            runEntity["ilx_executedbyuser"] = userName;
            runEntity["ilx_executedbyaadobjectid"] = userAadId;

            runEntity["ilx_mode"] =
                new OptionSetValue(
                    modeString.Equals("Summarise", StringComparison.OrdinalIgnoreCase)
                        ? MODE_SUMMARISE
                        : modeString.Equals("Score", StringComparison.OrdinalIgnoreCase)
                            ? MODE_SCORE
                            : MODE_COMPARE
                );

            int aiScopeOption = aiScopeString switch
            {
                "Extracted" => 857270000,
                "Full" => 857270001,
                _ => 857270002
            };

            runEntity["ilx_aiinsightscope"] = new OptionSetValue(aiScopeOption);
            runEntity["ilx_tenantid"] = tenant.TenantRecordId.ToString();

            var runRecordId = service.Create(runEntity);

            _logger.LogInformation($"Comparison Run created: {runRecordId}");

            /* =========================================================
             * 6. Upload files + create Comparison Documents
             * ========================================================= */
            var sourceBlobs = new List<BlobClient>();

            foreach (var file in form.Files)
            {
                var sourcePath =
                    $"comparisons/{comparisonId}/documents/{file.FileName}";

                var blob = container.GetBlobClient(sourcePath);

                _logger.LogInformation($"Uploading file: {file.FileName}");

                using var stream = file.Data;

                using var memoryStream = new MemoryStream();
                await stream.CopyToAsync(memoryStream);
                var fileBytes = memoryStream.ToArray();

                memoryStream.Position = 0;
                await blob.UploadAsync(memoryStream, overwrite: true);

                sourceBlobs.Add(blob);

                /* =============================
                   EXTRACT TEXT (FIXED)
                ============================== */

                string? extractedText = null;

                if (file.FileName.EndsWith(".txt", StringComparison.OrdinalIgnoreCase))
                {
                    extractedText = await ExtractPlainTextAsync(blob);
                }
                else if (file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    var ocrService = new AzureOcrService();
                    //extractedText = await ocrService.ExtractTextAsync(fileBytes);

                    extractedText = null;

                   // _logger.LogInformation($"OCR Extracted length: {extractedText?.Length}");

                   _logger.LogInformation("OCR skipped during upload (will run during execution)");

                   
                }
               
                /* =============================
                   CREATE DOCUMENT RECORD
                ============================== */

                var document = new Entity("ilx_analysisdocument");

                document["ilx_name"] = file.FileName;
                document["ilx_documentname"] = file.FileName;
                document["ilx_blobpath"] = sourcePath;

                document["ilx_analysis"] =
                    new EntityReference("ilx_analysis", comparisonId);

                document["ilx_analysisrun"] =
                    new EntityReference("ilx_analysisrun", runRecordId);

                document["ilx_extractedtext"] = extractedText;
                document["ilx_tenantid"] = tenant.TenantRecordId.ToString();

                service.Create(document);
            }

            /* =========================================================
             * 7. Snapshot blobs
             * ========================================================= */
            foreach (var sourceBlob in sourceBlobs)
            {
                var fileName = Path.GetFileName(sourceBlob.Name);

                var snapshotPath =
                    $"{blobBasePath}inputs/{fileName}";

                var snapshotBlob = container.GetBlobClient(snapshotPath);
                await snapshotBlob.StartCopyFromUriAsync(sourceBlob.Uri);
            }

            /* =========================================================
             * 8. Generate SAS URLs
             * ========================================================= */
            var sasLinks = new Dictionary<string, string>();

            foreach (var sourceBlob in sourceBlobs)
            {
                var sasUrl = await GenerateUserDelegationSasAsync(
                    blobService,
                    sourceBlob,
                    sasMinutes);

                sasLinks[sourceBlob.Name] = sasUrl;
            }

            /* =========================================================
             * 9. Response
             * ========================================================= */
            var response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(new
            {
                comparisonId,
                runRecordId,
                comparisonName,
                blobBasePath,
                documents = sasLinks
            });

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "UploadAndStartComparison failed.");

            var response = req.CreateResponse(HttpStatusCode.InternalServerError);
            await response.WriteAsJsonAsync(new
            {
                error = ex.Message,
                details = ex.ToString()
            });
            return response;
        }
    }

    /* =========================================================
     * 🔥 NEW: Flatten OCR structured result
     * ========================================================= */
    private static string FlattenOcrResult(dynamic ocrResult)
    {
        var sb = new StringBuilder();

        try
        {
            foreach (var page in ocrResult.pages)
            {
                foreach (var line in page.lines)
                {
                    sb.AppendLine((string)line.content);
                }
            }
        }
        catch
        {
            return "[OCR PARSE ERROR]";
        }

        return sb.ToString();
    }

    private static async Task<string> ExtractPlainTextAsync(BlobClient blob)
    {
        var download = await blob.DownloadContentAsync();
        var text = download.Value.Content.ToString();
        return text.Replace("\0", string.Empty);
    }

    private static async Task<string> GenerateUserDelegationSasAsync(
        BlobServiceClient serviceClient,
        BlobClient blobClient,
        int expiryMinutes)
    {
        var delegationKey = await serviceClient.GetUserDelegationKeyAsync(
            new Azure.Storage.Blobs.Models.BlobGetUserDelegationKeyOptions(
                DateTimeOffset.UtcNow.AddMinutes(expiryMinutes))
            {
                StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5)
            });

        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = blobClient.BlobContainerName,
            BlobName = blobClient.Name,
            Resource = "b",
            StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5),
            ExpiresOn = DateTimeOffset.UtcNow.AddMinutes(expiryMinutes)
        };

        sasBuilder.SetPermissions(BlobSasPermissions.Read);

        var sasToken = sasBuilder.ToSasQueryParameters(
            delegationKey.Value,
            serviceClient.AccountName);

        return $"{blobClient.Uri}?{sasToken}";
    }
}
