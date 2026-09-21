# GenerateOnePagerMsa.ps1
# One-off generator for the single-page LinkedIn demo MSA sample.
# Reuses the same Word-COM conversion approach as GenerateSampleDocs.ps1
# but targets just 10-onepage-msa-quickscan.md, and exports PDF directly
# instead of the manual "open in Word > Save As PDF" step.

param(
    [string]$TemplatePath = "c:\Projects\Document-Intelligence\Qubix_Insight_Azure_Infrastructure_Setup_Guide.docx",
    [string]$OutputDir    = "c:\Projects\Document-Intelligence\docs\samples\output",
    [string]$SourceDir    = "c:\Projects\Document-Intelligence\docs\samples"
)

function Strip-Inline([string]$text) {
    $text = $text -replace '\*\*([^*]+)\*\*', '$1'
    $text = $text -replace '`([^`]+)`',       '$1'
    $text = $text -replace '\[([^\]]+)\]\([^\)]+\)', '$1'
    return $text.Trim()
}

function wdConst { param($name)
    @{ wdReplaceAll=2; wdFindContinue=1; wdCollapseEnd=0;
       wdFormatDocx=16; wdFormatPDF=17; wdAlignPageNumberRight=2; wdFieldTypePage=33;
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
    try { $r.Style = $doc.Styles("List Number") } catch {}
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
    # Static "Page 1 of 1" — this generator only ever produces a single-page
    # document, so dynamic PAGE/NUMPAGES fields aren't worth the headless-Word
    # pagination timing issues they bring (fields not yet recalculated at SaveAs).
    $sec    = $doc.Sections(1)
    $footer = $sec.Footers((wdConst wdHeaderFooterPrimary))
    $footer.LinkToPrevious = $false
    $footer.Range.Text     = ""
    $footer.Range.InsertAfter($footerText)
    $footer.Range.InsertAfter("`t")
    $footer.Range.InsertAfter("Page 1 of 1")
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

    # Tighter margins + smaller body font so the condensed MSA fits on one page
    $doc.PageSetup.TopMargin    = 36
    $doc.PageSetup.BottomMargin = 36
    $doc.PageSetup.LeftMargin   = 50
    $doc.PageSetup.RightMargin  = 50
    try { $doc.Styles("Normal").Font.Size = 9.5 } catch {}

    $lines   = Get-Content $mdPath -Encoding UTF8
    $inCode  = $false
    $inTable = $false
    $tblBuf  = [System.Collections.Generic.List[string]]::new()

    foreach ($line in $lines) {
        if ($line -match '^```') {
            $inCode = !$inCode; continue
        }
        if ($inCode) { continue }

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

        if ($line -match '^\s*[-*]\s+(.+)') { Add-Bullet $doc $Matches[1]; continue }
        if ($line -match '^\s*\d+\.\s+(.+)') { Add-Bullet $doc $Matches[1]; continue }

        Add-Para $doc $line "Normal"
    }

    if ($inTable -and $tblBuf.Count -gt 0) { Add-Table $doc $tblBuf.ToArray() }

    $doc.PageSetup.DifferentFirstPageHeaderFooter = $false
    Set-DocHeader $doc $headerText
    Set-DocFooter $doc $footerText

    $doc.Repaginate()
    $doc.Fields.Update()

    $doc.SaveAs([ref]$outDocxPath, [ref](wdConst wdFormatDocx))

    $outPdfPath = [System.IO.Path]::ChangeExtension($outDocxPath, "pdf")
    $outPdfPath = $outPdfPath -replace [regex]::Escape((Split-Path $outDocxPath -Parent)), "$OutputDir\PDF"
    if (-not (Test-Path "$OutputDir\PDF")) { New-Item -ItemType Directory -Path "$OutputDir\PDF" | Out-Null }
    $doc.SaveAs([ref]$outPdfPath, [ref](wdConst wdFormatPDF))

    $doc.Close()
    Write-Host "  Saved docx + pdf." -ForegroundColor Green
}

# ── Main ──────────────────────────────────────────────────────────────────────

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

Write-Host "Starting Word..." -ForegroundColor Yellow
$word         = New-Object -ComObject Word.Application
$word.Visible = $false

Convert-MdToDoc $word `
    "$SourceDir\10-onepage-msa-quickscan.md" `
    "$OutputDir\10-Meridian-Brightwave-MSA-OnePage.docx" `
    $TemplatePath `
    "Qubix Insight | Sample Document | Master Services Agreement - Meridian and Brightwave" `
    "Sample | Meridian Retail Group Ltd / Brightwave Consulting Ltd MSA | April 2026 | Confidential"

$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null

Write-Host ""
Write-Host "Done. Files in: $OutputDir" -ForegroundColor Yellow
