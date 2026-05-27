public sealed class AiExecutionResult
{
    public string Content { get; set; } = "";
    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public int TotalTokens => PromptTokens + CompletionTokens;
    public string Model { get; set; } = "";
}