namespace QubixInsight.Models;

public class ComparisonRunResultDto
{
    public Guid RunId { get; set; }
    public string Mode { get; set; } = "Compare";

    public List<CandidateDto> Candidates { get; set; } = new();
    public List<AttributeDto> Attributes { get; set; } = new();
    public List<EvaluationDto> Evaluations { get; set; } = new();

    public object SummaryJson { get; set; }

    public string? DebugOrg { get; set; }

    public List<DocumentDto> Documents { get; set; }  

    public string CreatedBy { get; set; }
    public DateTime? CreatedOn { get; set; }

    public string InsightName { get; set; }
    public string RunName { get; set; }

}

public class CandidateDto
{
    public Guid Id { get; set; }
    public string? Label { get; set; }
    public int TotalScore { get; set; }
    public bool IsWinner { get; set; }
}

public class AttributeDto
{
    public Guid AttributeId { get; set; }
    public string? AttributeName { get; set; }
    public List<AttributeValueDto> Values { get; set; } = new();
    public string? RiskLevel { get; set; }}

public class AttributeValueDto
{
    public Guid? CandidateId { get; set; }
    public Guid? DocumentId { get; set; }
    public string? Value { get; set; }

    public string? AttributeAiInsight { get; set; }

    public string Coordinates { get; set; }
    public int? PageNumber { get; set; }

    public decimal? ConfidenceScore { get; set; }
}

public class EvaluationDto
{
    public Guid? CandidateId { get; set; }
    public Guid EvaluationId { get; set; }
    public int Score { get; set; }
    public bool IsWinner { get; set; }
    public string? AttributeName { get; set; }
    public string? AdvisoryText { get; set; }
    public string SeverityColor { get; set; } = "green";
}