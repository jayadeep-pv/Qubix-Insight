# GenerateSampleDocs.ps1
# Generates all 9 Qubix Insight sample business documents as Word files.
# Run from the docs\samples\ folder, or pass -OutputDir explicitly.
# After generation, open each .docx in Word and File > Save As > PDF.

param(
    [string]$TemplatePath = "c:\Projects\Document-Intelligence\Qubix_Insight_Azure_Infrastructure_Setup_Guide.docx",
    [string]$OutputDir    = "c:\Projects\Document-Intelligence\docs\samples\output",
    [string]$SourceDir    = "c:\Projects\Document-Intelligence\docs\samples"
)

# ── Helpers (same as BuildDocs.ps1) ──────────────────────────────────────────

function Strip-Inline([string]$text) {
    $text = $text -replace '\*\*([^*]+)\*\*', '$1'
    $text = $text -replace '`([^`]+)`',       '$1'
    $text = $text -replace '\[([^\]]+)\]\([^\)]+\)', '$1'
    return $text.Trim()
}

function wdConst { param($name)
    @{ wdReplaceAll=2; wdFindContinue=1; wdCollapseEnd=0;
       wdFormatDocx=16; wdAlignPageNumberRight=2; wdFieldTypePage=33;
       wdFieldTypeNumPages=26; wdHeaderFooterPrimary=1 }[$name]
}

function Add-Para($doc, [string]$text, [string]$styleName, [bool]$bold=$false) {
    $s = Strip-Inline $text
    if ([string]::IsNullOrWhiteSpace($s)) { return }
    $r = $doc.Content
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertParagraphAfter()
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Text = $s
    try { $r.Style = $doc.Styles($styleName) } catch {}
    if ($bold) { $r.Bold = $true }
}

function Add-Heading($doc, [string]$text, [int]$level) {
    $s = Strip-Inline $text
    if ([string]::IsNullOrWhiteSpace($s)) { return }
    $r = $doc.Content
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertParagraphAfter()
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Text = $s
    try { $r.Style = $doc.Styles("Heading $level") } catch {}
}

function Add-Bullet($doc, [string]$text) {
    $s = Strip-Inline $text
    if ([string]::IsNullOrWhiteSpace($s)) { return }
    $r = $doc.Content
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertParagraphAfter()
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Text = $s
    try { $r.Style = $doc.Styles("List Bullet") } catch {}
}

function Add-Table($doc, [string[]]$rows) {
    $dataRows = $rows | Where-Object { $_ -notmatch '^\s*\|[-| :]+\|\s*$' }
    if ($dataRows.Count -lt 1) { return }
    $colCount = ($dataRows[0] -split '\|' | Where-Object { $_ -ne '' }).Count
    if ($colCount -lt 1) { return }
    $rowCount = $dataRows.Count
    $r = $doc.Content
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertParagraphAfter()
    $r.Collapse((wdConst wdCollapseEnd))
    $tbl = $doc.Tables.Add($r, $rowCount, $colCount)
    try { $tbl.Style = $doc.Styles("Table Grid") } catch {}
    $tbl.Borders.InsideLineStyle  = 1
    $tbl.Borders.OutsideLineStyle = 1
    $tbl.AllowAutoFit = $true
    for ($ri = 0; $ri -lt $dataRows.Count; $ri++) {
        $cells = $dataRows[$ri] -split '\|' | Where-Object { $_ -ne '' }
        for ($ci = 0; $ci -lt [Math]::Min($cells.Count, $colCount); $ci++) {
            $val  = (Strip-Inline $cells[$ci]).Trim()
            $cell = $tbl.Cell($ri + 1, $ci + 1)
            $cell.Range.Text = $val
            if ($ri -eq 0) {
                $cell.Range.Bold = $true
                $cell.Shading.BackgroundPatternColor = 4210752
            }
        }
    }
    $endRange = $doc.Content
    $endRange.Collapse((wdConst wdCollapseEnd))
    $endRange.InsertParagraphAfter()
}

function Set-DocHeader($doc, [string]$title) {
    $sec    = $doc.Sections(1)
    $header = $sec.Headers((wdConst wdHeaderFooterPrimary))
    $header.LinkToPrevious = $false
    $header.Range.Text     = $title
    $header.Range.Bold     = $false
    $header.Range.Font.Size  = 9
    $header.Range.Font.Color = 8421504
    $header.Range.ParagraphFormat.Alignment = 2
    $header.Range.Paragraphs(1).Borders(3).LineStyle = 1
    $header.Range.Paragraphs(1).Borders(3).LineWidth  = 4
}

function Set-DocFooter($doc, [string]$footerText) {
    $sec    = $doc.Sections(1)
    $footer = $sec.Footers((wdConst wdHeaderFooterPrimary))
    $footer.LinkToPrevious = $false
    $footer.Range.Text     = ""
    $footer.Range.InsertAfter($footerText)
    $footer.Range.InsertAfter("`t")
    $footer.Range.InsertAfter("Page ")
    $r = $footer.Range
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Fields.Add($r, (wdConst wdFieldTypePage))    | Out-Null
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertAfter(" of ")
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Fields.Add($r, (wdConst wdFieldTypeNumPages)) | Out-Null
    try {
        $footer.Range.ParagraphFormat.TabStops.Add(
            $doc.PageSetup.PageWidth - $doc.PageSetup.LeftMargin - $doc.PageSetup.RightMargin,
            (wdConst wdAlignPageNumberRight), -1)
    } catch {}
}

function Convert-MdToDoc($word, [string]$mdPath, [string]$outDocxPath,
                          [string]$templatePath, [string]$headerText, [string]$footerText) {

    Write-Host "  Building: $(Split-Path $outDocxPath -Leaf)" -ForegroundColor Cyan

    $doc   = $word.Documents.Add($templatePath)
    $doc.Content.Delete()

    $lines   = Get-Content $mdPath -Encoding UTF8
    $inCode  = $false
    $inTable = $false
    $tblBuf  = [System.Collections.Generic.List[string]]::new()

    foreach ($line in $lines) {
        if ($line -match '^```') {
            $inCode = !$inCode; continue
        }
        if ($inCode) { continue }   # skip code blocks in business docs

        if ($line -match '^\s*\|') {
            $inTable = $true; $tblBuf.Add($line); continue
        }
        if ($inTable) {
            Add-Table $doc $tblBuf.ToArray()
            $tblBuf.Clear(); $inTable = $false
        }

        if ($line -match '^#{6}\s+(.+)') { Add-Heading $doc $Matches[1] 6; continue }
        if ($line -match '^#{5}\s+(.+)') { Add-Heading $doc $Matches[1] 5; continue }
        if ($line -match '^#{4}\s+(.+)') { Add-Heading $doc $Matches[1] 4; continue }
        if ($line -match '^#{3}\s+(.+)') { Add-Heading $doc $Matches[1] 3; continue }
        if ($line -match '^#{2}\s+(.+)') { Add-Heading $doc $Matches[1] 2; continue }
        if ($line -match '^#{1}\s+(.+)') { Add-Heading $doc $Matches[1] 1; continue }
        if ($line -match '^-{3,}$')      { continue }

        if ($line -match '^>\s*(.+)') {
            $r = $doc.Content
            $r.Collapse((wdConst wdCollapseEnd))
            $r.InsertParagraphAfter(); $r.Collapse((wdConst wdCollapseEnd))
            $r.Text   = Strip-Inline $Matches[1]
            $r.Italic = $true
            continue
        }

        if ($line -match '^\s*[-*]\s+(.+)') { Add-Bullet $doc $Matches[1]; continue }
        if ($line -match '^\s*\d+\.\s+(.+)') { Add-Bullet $doc $Matches[1]; continue }

        Add-Para $doc $line "Normal"
    }

    if ($inTable -and $tblBuf.Count -gt 0) { Add-Table $doc $tblBuf.ToArray() }

    $doc.PageSetup.DifferentFirstPageHeaderFooter = $false
    Set-DocHeader $doc $headerText
    Set-DocFooter $doc $footerText

    $doc.SaveAs([ref]$outDocxPath, [ref](wdConst wdFormatDocx))
    $doc.Close()
    Write-Host "  Saved." -ForegroundColor Green
}

# ── Main ──────────────────────────────────────────────────────────────────────

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Host "Created output folder: $OutputDir"
}

$docs = @(
    @{
        Md      = "$SourceDir\01-nexford-logistics-agreement.md"
        Docx    = "$OutputDir\01-Nexford-Logistics-Services-Agreement.docx"
        Header  = "Qubix Insight | Sample Document | Supplier Contract - Nexford Logistics"
        Footer  = "Sample | Nexford Logistics Ltd Services Agreement | March 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\02-clearpath-freight-agreement.md"
        Docx    = "$OutputDir\02-ClearPath-Freight-Services-Agreement.docx"
        Header  = "Qubix Insight | Sample Document | Supplier Contract - ClearPath Freight"
        Footer  = "Sample | ClearPath Freight Solutions Ltd Services Agreement | March 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\03-datavault-pro-sla.md"
        Docx    = "$OutputDir\03-DataVault-Pro-SLA.docx"
        Header  = "Qubix Insight | Sample Document | SLA - DataVault Pro"
        Footer  = "Sample | DataVault Pro Ltd Service Level Agreement | February 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\04-securetrust-systems-sla.md"
        Docx    = "$OutputDir\04-SecureTrust-Systems-SLA.docx"
        Header  = "Qubix Insight | Sample Document | SLA - SecureTrust Systems"
        Footer  = "Sample | SecureTrust Systems Ltd Service Level Agreement | February 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\05-hartley-webb-agreement-v1.md"
        Docx    = "$OutputDir\05-Hartley-Webb-Agreement-Draft-v1.docx"
        Header  = "Qubix Insight | Sample Document | Software Agreement Draft v1 - Hartley and Webb"
        Footer  = "Sample | Hartley and Webb Technology Solutions Agreement Draft v1 | January 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\06-hartley-webb-agreement-v2.md"
        Docx    = "$OutputDir\06-Hartley-Webb-Agreement-Draft-v2.docx"
        Header  = "Qubix Insight | Sample Document | Software Agreement Draft v2 - Hartley and Webb"
        Footer  = "Sample | Hartley and Webb Technology Solutions Agreement Draft v2 | February 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\07-nexford-consulting-rfp-response.md"
        Docx    = "$OutputDir\07-Nexford-Consulting-RFP-Response.docx"
        Header  = "Qubix Insight | Sample Document | RFP Response - Nexford Consulting Group"
        Footer  = "Sample | Nexford Consulting Group Ltd RFP Response | April 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\08-crestview-partners-rfp-response.md"
        Docx    = "$OutputDir\08-Crestview-Partners-RFP-Response.docx"
        Header  = "Qubix Insight | Sample Document | RFP Response - Crestview Partners"
        Footer  = "Sample | Crestview Partners Ltd RFP Response | April 2024 | Confidential"
    },
    @{
        Md      = "$SourceDir\09-harrowfield-pinnacle-msa.md"
        Docx    = "$OutputDir\09-Harrowfield-Pinnacle-MSA.docx"
        Header  = "Qubix Insight | Sample Document | Master Services Agreement - Harrowfield and Pinnacle"
        Footer  = "Sample | Harrowfield and Partners LLP / Pinnacle Technology Group Ltd MSA | October 2023 | Confidential"
    }
)

Write-Host ""
Write-Host "Starting Word..." -ForegroundColor Yellow
$word         = New-Object -ComObject Word.Application
$word.Visible = $false

foreach ($d in $docs) {
    Convert-MdToDoc $word $d.Md $d.Docx $TemplatePath $d.Header $d.Footer
}

$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null

Write-Host ""
Write-Host "All 9 documents generated in: $OutputDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open each .docx in Word"
Write-Host "  2. File > Save As > PDF (or Export to PDF)"
Write-Host "  3. Upload all 9 PDFs to the 'trial-documents' Azure Blob container"
Write-Host "  4. Follow the Sample Data Setup guide to create Dataverse records"
