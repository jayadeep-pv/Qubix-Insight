using Azure.AI.OpenAI;
using OpenAI.Chat;
using Microsoft.Extensions.Logging;

namespace QubixInsight.Services;

public class AiSummaryService
{
    private readonly AzureOpenAIClient _openAi;
    private readonly ILogger<AiSummaryService> _logger;
    private readonly string _deploymentName;

    public AiSummaryService(
        AzureOpenAIClient openAi,
        ILogger<AiSummaryService> logger)
    {
        _openAi = openAi;
        _logger = logger;

        _deploymentName =
            Environment.GetEnvironmentVariable("AzureOpenAIDeployment")
            ?? throw new InvalidOperationException("AzureOpenAIDeployment not set.");
    }

    // =========================================================
    // PROFILE-DRIVEN AI EXECUTION ENGINE
    // =========================================================

    public async Task<AiExecutionResult> GenerateRawPromptAsync(string fullPrompt)
    {
        var chatClient = _openAi.GetChatClient(_deploymentName);

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(
                "Return ONLY valid JSON. Do not return markdown. Do not return explanations."),
            new UserChatMessage(fullPrompt)
        };

        var options = new ChatCompletionOptions
        {
            Temperature      = 0.2f,
            MaxOutputTokenCount = 1500
        };

        var response = await chatClient.CompleteChatAsync(messages, options);

        var content = response.Value.Content[0].Text;
        var usage   = response.Value.Usage;

        return new AiExecutionResult
        {
            Content          = content,
            PromptTokens     = usage?.InputTokenCount     ?? 0,
            CompletionTokens = usage?.OutputTokenCount    ?? 0,
            Model            = _deploymentName
        };
    }

    public async Task<string> RunPromptAsync(string prompt)
    {
        var result = await GenerateRawPromptAsync(prompt);
        return result.Content;
    }
}

// =========================================================
// EXECUTION RESULT DTO
// =========================================================

public class AiExecutionResult
{
    public string Content          { get; set; } = string.Empty;
    public int    PromptTokens     { get; set; }
    public int    CompletionTokens { get; set; }
    public int    TotalTokens      => PromptTokens + CompletionTokens;
    public string Model            { get; set; } = string.Empty;
}
