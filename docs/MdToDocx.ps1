# Converts a markdown file to a formatted Word DOCX using COM automation.
# Usage: .\MdToDocx.ps1 -InputMd "file.md" -OutputDocx "file.docx"
param(
    [Parameter(Mandatory)][string]$InputMd,
    [Parameter(Mandatory)][string]$OutputDocx
)

function Add-Heading($doc, $text, $level) {
    $para = $doc.Content.Paragraphs.Add()
    $para.Range.Text = $text
    $para.Style = $doc.Styles("Heading $level")
    $para.Range.InsertParagraphAfter()
}

function Add-Normal($doc, $text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    $para = $doc.Content.Paragraphs.Add()
    $para.Range.Text = $text
    $para.Style = $doc.Styles("Normal")
    $para.Range.InsertParagraphAfter()
}

function Add-Bullet($doc, $text) {
    $para = $doc.Content.Paragraphs.Add()
    $para.Range.Text = $text
    $para.Style = $doc.Styles("List Bullet")
    $para.Range.InsertParagraphAfter()
}

function Add-Code($doc, $text) {
    $para = $doc.Content.Paragraphs.Add()
    $para.Range.Text = $text
    $para.Style = $doc.Styles("No Spacing")
    $para.Range.Font.Name = "Courier New"
    $para.Range.Font.Size = 9
    $para.Range.InsertParagraphAfter()
}

function Strip-Inline($text) {
    # Remove **bold**, `code`, and trailing spaces
    $text = $text -replace '\*\*([^*]+)\*\*', '$1'
    $text = $text -replace '`([^`]+)`', '$1'
    $text = $text -replace '\[([^\]]+)\]\([^\)]+\)', '$1'
    return $text.Trim()
}

function Process-Table($doc, [string[]]$rows) {
    # rows[0] = header, rows[1] = separator, rows[2..] = data
    $dataRows = $rows | Where-Object { $_ -notmatch '^\s*\|[-| :]+\|\s*$' }
    if ($dataRows.Count -lt 1) { return }

    $parsed = $dataRows | ForEach-Object {
        ($_ -split '\|' | Where-Object { $_ -ne '' }) | ForEach-Object { (Strip-Inline $_).Trim() }
    }

    $colCount = ($dataRows[0] -split '\|' | Where-Object { $_ -ne '' }).Count
    $rowCount  = $dataRows.Count

    # Insert a blank paragraph before the table so Word has a place to anchor
    $doc.Content.InsertParagraphAfter()
    $range = $doc.Content
    $range.Collapse(0) # wdCollapseEnd

    $table = $doc.Tables.Add($range, $rowCount, $colCount)
    $table.Style = "Table Grid"
    $table.Borders.InsideLineStyle  = 1
    $table.Borders.OutsideLineStyle = 1

    for ($r = 0; $r -lt $dataRows.Count; $r++) {
        $cells = ($dataRows[$r] -split '\|' | Where-Object { $_ -ne '' })
        for ($c = 0; $c -lt [Math]::Min($cells.Count, $colCount); $c++) {
            $cellText = (Strip-Inline $cells[$c]).Trim()
            $table.Cell($r + 1, $c + 1).Range.Text = $cellText
            if ($r -eq 0) {
                $table.Cell($r + 1, $c + 1).Range.Bold = $true
            }
        }
    }
    # Move past the table
    $doc.Content.InsertParagraphAfter()
}

# ── Main ──────────────────────────────────────────────────────────────────────

$lines = Get-Content $InputMd -Encoding UTF8

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Add()

# Remove the initial empty paragraph Word inserts
$doc.Content.Text = ""

$inCode   = $false
$codeBuf  = [System.Collections.Generic.List[string]]::new()
$inTable  = $false
$tableBuf = [System.Collections.Generic.List[string]]::new()

foreach ($line in $lines) {

    # ── Code blocks ──────────────────────────────────────────────────────────
    if ($line -match '^```') {
        if ($inCode) {
            # flush code buffer
            foreach ($cl in $codeBuf) { Add-Code $doc $cl }
            $codeBuf.Clear()
            $inCode = $false
        } else {
            $inCode = $true
        }
        continue
    }
    if ($inCode) { $codeBuf.Add($line); continue }

    # ── Table rows ───────────────────────────────────────────────────────────
    if ($line -match '^\s*\|') {
        $inTable = $true
        $tableBuf.Add($line)
        continue
    }
    if ($inTable) {
        Process-Table $doc $tableBuf.ToArray()
        $tableBuf.Clear()
        $inTable = $false
    }

    # ── Headings ─────────────────────────────────────────────────────────────
    if ($line -match '^######\s+(.+)') { Add-Heading $doc (Strip-Inline $Matches[1]) 6; continue }
    if ($line -match '^#####\s+(.+)')  { Add-Heading $doc (Strip-Inline $Matches[1]) 5; continue }
    if ($line -match '^####\s+(.+)')   { Add-Heading $doc (Strip-Inline $Matches[1]) 4; continue }
    if ($line -match '^###\s+(.+)')    { Add-Heading $doc (Strip-Inline $Matches[1]) 3; continue }
    if ($line -match '^##\s+(.+)')     { Add-Heading $doc (Strip-Inline $Matches[1]) 2; continue }
    if ($line -match '^#\s+(.+)')      { Add-Heading $doc (Strip-Inline $Matches[1]) 1; continue }

    # ── Horizontal rule ──────────────────────────────────────────────────────
    if ($line -match '^---+$') { continue }

    # ── Bullets ──────────────────────────────────────────────────────────────
    if ($line -match '^\s*[-*]\s+(.+)') { Add-Bullet $doc (Strip-Inline $Matches[1]); continue }
    if ($line -match '^\s*\d+\.\s+(.+)') { Add-Bullet $doc (Strip-Inline $Matches[1]); continue }

    # ── Blockquote (treat as italic normal) ──────────────────────────────────
    if ($line -match '^>\s*(.*)') {
        $text = Strip-Inline $Matches[1]
        if ($text) {
            $para = $doc.Content.Paragraphs.Add()
            $para.Range.Text = $text
            $para.Style = $doc.Styles("Normal")
            $para.Range.Italic = $true
            $para.Range.InsertParagraphAfter()
        }
        continue
    }

    # ── Normal text ──────────────────────────────────────────────────────────
    Add-Normal $doc (Strip-Inline $line)
}

# Flush any remaining table
if ($inTable -and $tableBuf.Count -gt 0) {
    Process-Table $doc $tableBuf.ToArray()
}

# Save
$doc.SaveAs([ref]$OutputDocx, [ref]16)  # 16 = wdFormatDocx
$doc.Close()
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null

Write-Host "Saved: $OutputDocx"
