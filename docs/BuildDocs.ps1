# BuildDocs.ps1
# Generates all three Qubix Insight Word documents using the existing guide
# as the style/branding template. Run from the docs\ folder.

param(
    [string]$TemplatePath = "c:\Projects\Document-Intelligence\Qubix_Insight_Azure_Infrastructure_Setup_Guide.docx",
    [string]$OutputDir    = "c:\Projects\Document-Intelligence\docs"
)

# ── Helpers ───────────────────────────────────────────────────────────────────

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

function Add-Code($doc, [string]$text) {
    $r = $doc.Content
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertParagraphAfter()
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Text = $text
    try { $r.Style = $doc.Styles("No Spacing") } catch {}
    $r.Font.Name = "Courier New"
    $r.Font.Size = 9
    $r.Shading.BackgroundPatternColor = 15921906  # light grey (0xF3F3F3)
}

function Add-Table($doc, [string[]]$rows) {
    $dataRows = $rows | Where-Object { $_ -notmatch '^\s*\|[-| :]+\|\s*$' }
    if ($dataRows.Count -lt 1) { return }
    $colCount = ($dataRows[0] -split '\|' | Where-Object { $_ -ne '' }).Count
    if ($colCount -lt 1) { return }
    $rowCount = $dataRows.Count

    # anchor paragraph
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
            $val = (Strip-Inline $cells[$ci]).Trim()
            $cell = $tbl.Cell($ri + 1, $ci + 1)
            $cell.Range.Text = $val
            if ($ri -eq 0) {
                $cell.Range.Bold = $true
                $cell.Shading.BackgroundPatternColor = 4210752  # dark grey
            }
        }
    }

    # paragraph after table
    $endRange = $doc.Content
    $endRange.Collapse((wdConst wdCollapseEnd))
    $endRange.InsertParagraphAfter()
}

function Set-Footer($doc, [string]$leftText, [string]$rightText) {
    $sec = $doc.Sections(1)
    $sec.Headers((wdConst wdHeaderFooterPrimary)).LinkToPrevious = $false
    $footer = $sec.Footers((wdConst wdHeaderFooterPrimary))
    $footer.LinkToPrevious = $false
    $footer.Range.Text = ""

    # left text
    $footer.Range.InsertAfter($leftText)
    $footer.Range.ParagraphFormat.Alignment = 0  # wdAlignParagraphLeft

    # tab to right + page number
    $footer.Range.InsertAfter("`t")
    $footer.Range.InsertAfter("Page ")
    $fields = $footer.Range.Fields
    $r = $footer.Range
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Fields.Add($r, (wdConst wdFieldTypePage))    | Out-Null
    $r.Collapse((wdConst wdCollapseEnd))
    $r.InsertAfter(" of ")
    $r.Collapse((wdConst wdCollapseEnd))
    $r.Fields.Add($r, (wdConst wdFieldTypeNumPages)) | Out-Null
    $r.Collapse((wdConst wdCollapseEnd))

    # set tab stop for right alignment
    $footer.Range.ParagraphFormat.TabStops.Add(
        $doc.PageSetup.PageWidth - $doc.PageSetup.LeftMargin - $doc.PageSetup.RightMargin,
        (wdConst wdAlignPageNumberRight), -1)
}

function Set-Header($doc, [string]$title) {
    $sec = $doc.Sections(1)
    $header = $sec.Headers((wdConst wdHeaderFooterPrimary))
    $header.LinkToPrevious = $false
    $header.Range.Text = $title
    $header.Range.Bold = $false
    $header.Range.Font.Size = 9
    $header.Range.Font.Color = 8421504  # grey
    $header.Range.ParagraphFormat.Alignment = 2  # right
    # bottom border on header paragraph
    $header.Range.Paragraphs(1).Borders(3).LineStyle = 1  # wdLineStyleSingle bottom
    $header.Range.Paragraphs(1).Borders(3).LineWidth  = 4
}

function Convert-MdToDoc($word, [string]$mdPath, [string]$outDocxPath,
                          [string]$templatePath, [string]$docTitle,
                          [string]$footerText) {

    Write-Host "  Building: $(Split-Path $outDocxPath -Leaf)"

    $doc = $word.Documents.Add($templatePath)

    # Clear the default content from the template
    $doc.Content.Delete()

    $lines   = Get-Content $mdPath -Encoding UTF8
    $inCode  = $false
    $codeBuf = [System.Collections.Generic.List[string]]::new()
    $inTable = $false
    $tblBuf  = [System.Collections.Generic.List[string]]::new()

    foreach ($line in $lines) {

        # ── Code fences ──────────────────────────────────────────────────────
        if ($line -match '^```') {
            if ($inCode) {
                foreach ($cl in $codeBuf) { Add-Code $doc $cl }
                $codeBuf.Clear(); $inCode = $false
            } else { $inCode = $true }
            continue
        }
        if ($inCode) { $codeBuf.Add($line); continue }

        # ── Tables ───────────────────────────────────────────────────────────
        if ($line -match '^\s*\|') {
            $inTable = $true; $tblBuf.Add($line); continue
        }
        if ($inTable) {
            Add-Table $doc $tblBuf.ToArray()
            $tblBuf.Clear(); $inTable = $false
        }

        # ── Headings ─────────────────────────────────────────────────────────
        if ($line -match '^#{6}\s+(.+)') { Add-Heading $doc $Matches[1] 6; continue }
        if ($line -match '^#{5}\s+(.+)') { Add-Heading $doc $Matches[1] 5; continue }
        if ($line -match '^#{4}\s+(.+)') { Add-Heading $doc $Matches[1] 4; continue }
        if ($line -match '^#{3}\s+(.+)') { Add-Heading $doc $Matches[1] 3; continue }
        if ($line -match '^#{2}\s+(.+)') { Add-Heading $doc $Matches[1] 2; continue }
        if ($line -match '^#{1}\s+(.+)') { Add-Heading $doc $Matches[1] 1; continue }

        # ── HR ───────────────────────────────────────────────────────────────
        if ($line -match '^-{3,}$') { continue }

        # ── Blockquote ───────────────────────────────────────────────────────
        if ($line -match '^>\s*(.+)') {
            $r = $doc.Content
            $r.Collapse((wdConst wdCollapseEnd))
            $r.InsertParagraphAfter(); $r.Collapse((wdConst wdCollapseEnd))
            $r.Text = Strip-Inline $Matches[1]
            try { $r.Style = $doc.Styles("Normal") } catch {}
            $r.Italic = $true
            continue
        }

        # ── Bullets ──────────────────────────────────────────────────────────
        if ($line -match '^\s*[-*]\s+(.+)') { Add-Bullet $doc $Matches[1]; continue }
        if ($line -match '^\s*\d+\.\s+(.+)') { Add-Bullet $doc $Matches[1]; continue }

        # ── Normal ───────────────────────────────────────────────────────────
        Add-Para $doc $line "Normal"
    }

    if ($inTable -and $tblBuf.Count -gt 0) { Add-Table $doc $tblBuf.ToArray() }

    # ── Header / Footer ──────────────────────────────────────────────────────
    $doc.PageSetup.DifferentFirstPageHeaderFooter = $false
    Set-Header $doc "Qubix Insight | $docTitle | Confidential"
    Set-Footer $doc $footerText ""

    $doc.SaveAs([ref]$outDocxPath, [ref](wdConst wdFormatDocx))
    $doc.Close()
    Write-Host "  Saved."
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host "Starting Word..."
$word = New-Object -ComObject Word.Application
$word.Visible = $false

$docs = @(
    @{
        Md      = "$OutputDir\Qubix_Insight_Deployment_Guide_v1.2.md"
        Docx    = "$OutputDir\Qubix_Insight_Deployment_Guide_v1.3.docx"
        Title   = "Azure Infrastructure Setup Guide v1.3"
        Footer  = "Qubix Insight | Azure Infrastructure Setup Guide v1.3 | June 2026 | Confidential"
    },
    @{
        Md      = "$OutputDir\Identity_Management_Architecture.md"
        Docx    = "$OutputDir\Identity_Management_Architecture.docx"
        Title   = "Identity Management Architecture v1.1"
        Footer  = "Qubix Insight | Identity Management Architecture v1.1 | June 2026 | Confidential"
    }
)

foreach ($d in $docs) {
    Convert-MdToDoc $word $d.Md $d.Docx $TemplatePath $d.Title $d.Footer
}

# ── Update the existing guide in-place (copy to docs\ with v1.2 header/footer fix) ──
Write-Host "  Updating existing guide..."
$existingOut = "$OutputDir\Qubix_Insight_Azure_Infrastructure_Setup_Guide.docx"
Copy-Item $TemplatePath $existingOut -Force

$doc = $word.Documents.Open($existingOut)

# Schema rename: hollis_ → ilx_
$renames = [ordered]@{
    "hollis_comparison\b(?!run|document|result|template|candidate|evaluation|runinsight|rule)" = "ilx_analysis"
    "hollis_comparisonruninsight" = "ilx_analysisruninsight"
    "hollis_comparisonrun\b"      = "ilx_analysisrun"
    "hollis_comparisondocument"   = "ilx_analysisdocument"
    "hollis_comparisonresult"     = "ilx_analysisresult"
    "hollis_comparisontemplate"   = "ilx_analysistemplate"
    "hollis_comparisoncandidate"  = "ilx_analysiscandidate"
    "hollis_comparisonevaluation" = "ilx_analysisevaluation"
    "hollis_evaluationresult"     = "ilx_analysisevaluationresult"
    "hollis_comparisonrule"       = "ilx_analysisrule"
    "hollis_attributeaiinsight"   = "ilx_analysisattributeinsight"
    "hollis_tenantsetting"        = "ilx_tenantsetting"
    "hollis_tenantid\b"           = "ilx_tenantid"
    "hollis_tenantname"           = "ilx_tenantname"
    "hollis_aadtenantid"          = "ilx_aadtenantid"
    "hollis_alloweddomains"       = "ilx_alloweddomains"
    "hollis_dataverseurl"         = "ilx_dataverseurl"
    "hollis_storagecontainername" = "ilx_storagecontainername"
    "hollis_storageaccountname"   = "ilx_storageaccountname"
    "hollis_storagesassecretref"  = "ilx_storagesassecretref"
    "hollis_subscriptiontier"     = "ilx_subscriptiontier"
    "hollis_onboardeddate"        = "ilx_onboardeddate"
    "hollis_isactive"             = "ilx_isactive"
    "hollis_"                     = "ilx_"
    # Solution name
    "QubixInsight_1_0_0_1\.zip"   = "QubixInsight_1_0_0_2.zip"
    # Version
    "Version 1\.1"                = "Version 1.2"
    "v1\.1"                       = "v1.2"
    # Client IDs — update to production values from config.json
    "ff3fa124-94c0-431f-a573-b3c06b8865d9" = "ba5f6329-ac7b-49d6-a9df-a05e9c84f422"
    "c957560e-8fc9-444a-9cde-bfd3129e36ad" = "91fe9c77-dbd7-40f2-8b38-2f4cb8f7d48d"
}

$find = $doc.Content.Find
foreach ($old in $renames.Keys) {
    $find.ClearFormatting()
    $repl = $find.Replacement
    $repl.ClearFormatting()
    $find.Text = $old
    $repl.Text = $renames[$old]
    $find.MatchWildcards = $old -match '\\b|\.'
    $find.Execute($null,$false,$true,$false,$false,$false,$true,1,$true,$null,2) | Out-Null
}
$find.MatchWildcards = $false

# Update the footer
$doc.PageSetup.DifferentFirstPageHeaderFooter = $false
$sec = $doc.Sections(1)

# Header
$hdr = $sec.Headers(1)
$hdr.LinkToPrevious = $false
$hdr.Range.Text = "Qubix Insight | Azure Infrastructure Setup Guide v1.2 | Confidential"
$hdr.Range.Font.Size = 9
$hdr.Range.Font.Color = 8421504
$hdr.Range.Bold = $false
$hdr.Range.ParagraphFormat.Alignment = 2

# Footer
$ftr = $sec.Footers(1)
$ftr.LinkToPrevious = $false
$ftr.Range.Delete()
$ftr.Range.Text = "Qubix Insight | Azure Infrastructure Setup Guide v1.2 | May 2026 | Confidential"
$ftr.Range.Font.Size = 9
$ftr.Range.ParagraphFormat.Alignment = 1  # center

$doc.Save()
$doc.Close()

Write-Host "  Saved existing guide (updated)."
Write-Host ""
Write-Host "All done. Files in: $OutputDir"

$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
