$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'store-assets'
$logo = [System.Drawing.Image]::FromFile((Join-Path $assetRoot 'logo-300.png'))
$script:g = $null

function Color([string]$hex) { return [System.Drawing.ColorTranslator]::FromHtml($hex) }
function Font([single]$size, [bool]$bold = $false) {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    return [System.Drawing.Font]::new('Microsoft YaHei UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}
function Lines([string]$text, [single]$size, [single]$maxWidth, [bool]$bold = $false) {
    $font = Font $size $bold
    try {
        foreach ($paragraph in $text.Split("`n")) {
            $isChinese = $paragraph -match '[\u3400-\u9fff]'
            $tokens = if ($isChinese) { $paragraph.ToCharArray() | ForEach-Object { [string]$_ } } else { $paragraph.Split(' ') }
            $line = ''
            foreach ($token in $tokens) {
                $candidate = if ($isChinese -or -not $line) { $line + $token } else { $line + ' ' + $token }
                $width = $g.MeasureString($candidate, $font, [int]10000, [System.Drawing.StringFormat]::GenericTypographic).Width
                if ($line -and $width -gt $maxWidth) { $line; $line = $token } else { $line = $candidate }
            }
            $line
        }
    } finally { $font.Dispose() }
}
function Text([string]$text, [single]$x, [single]$y, [single]$size, [string]$color, [bool]$bold = $false, [single]$maxWidth = 2000, [single]$lineHeight = 0) {
    if ($lineHeight -le 0) { $lineHeight = $size * 1.6 }
    $font = Font $size $bold
    $brush = [System.Drawing.SolidBrush]::new((Color $color))
    try {
        foreach ($line in @(Lines $text $size $maxWidth $bold)) {
            $g.DrawString($line, $font, $brush, $x, $y, [System.Drawing.StringFormat]::GenericTypographic)
            $y += $lineHeight
        }
    } finally { $font.Dispose(); $brush.Dispose() }
}
function CenterText([string]$text, [single]$x, [single]$y, [single]$width, [single]$height, [single]$size, [string]$color) {
    $font = Font $size $true
    $brush = [System.Drawing.SolidBrush]::new((Color $color))
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    try { $g.DrawString($text, $font, $brush, [System.Drawing.RectangleF]::new($x,$y,$width,$height), $format) }
    finally { $font.Dispose(); $brush.Dispose(); $format.Dispose() }
}
function Rounded([single]$x,[single]$y,[single]$width,[single]$height,[single]$radius,[string]$fill,[string]$stroke = '') {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = 2*$radius
    $path.AddArc($x,$y,$d,$d,180,90)
    $path.AddArc(($x+$width-$d),$y,$d,$d,270,90)
    $path.AddArc(($x+$width-$d),($y+$height-$d),$d,$d,0,90)
    $path.AddArc($x,($y+$height-$d),$d,$d,90,90)
    $path.CloseFigure()
    $brush = [System.Drawing.SolidBrush]::new((Color $fill))
    $g.FillPath($brush,$path)
    $brush.Dispose()
    if ($stroke) {
        $pen = [System.Drawing.Pen]::new((Color $stroke),1)
        $g.DrawPath($pen,$path)
        $pen.Dispose()
    }
    $path.Dispose()
}
function Circle([single]$x,[single]$y,[single]$diameter,[string]$fill) {
    $brush = [System.Drawing.SolidBrush]::new((Color $fill))
    $g.FillEllipse($brush,$x,$y,$diameter,$diameter)
    $brush.Dispose()
}
function Rule([single]$x,[single]$y,[single]$width,[string]$color) {
    $pen = [System.Drawing.Pen]::new((Color $color),1)
    $g.DrawLine($pen,$x,$y,($x+$width),$y)
    $pen.Dispose()
}
function Canvas([int]$width,[int]$height) {
    $bitmap = [System.Drawing.Bitmap]::new(($width*2),($height*2))
    $script:g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::White)
    $g.ScaleTransform(2,2)
    return $bitmap
}
function Save([System.Drawing.Bitmap]$bitmap,[int]$width,[int]$height,[string]$path) {
    $g.Dispose()
    $output = [System.Drawing.Bitmap]::new($width,$height,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $resizer = [System.Drawing.Graphics]::FromImage($output)
    $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizer.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $resizer.DrawImage($bitmap,0,0,$width,$height)
    $output.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
    $resizer.Dispose(); $output.Dispose(); $bitmap.Dispose()
}

# The popup content and geometry follow popup.html / popup.css. This is a
# labeled interface illustration, not a claimed capture of a browser session.
function Popup([hashtable]$m, [bool]$enabled, [single]$x, [single]$y, [single]$scale) {
    $saved = $g.Save()
    $g.TranslateTransform($x,$y)
    $g.ScaleTransform($scale,$scale)
    $description = if ($enabled) { $m.descriptionOwned.message } else { $m.descriptionOriginal.message }
    $descHeight = [Math]::Max(36, @(Lines $description 12 264).Count * 19.2)
    $actionY = 112.5 + $descHeight + 16
    $cardBottom = $actionY + 54
    $tipY = $cardBottom + 12
    $tipHeight = @(Lines $m.tip.message 11 296).Count * 17.6
    $detailsY = $tipY + $tipHeight + 9
    $dividerY = $detailsY + 32.7
    $height = $dividerY + 46
    Rounded 2 8 336 $height 16 '#e4eaf4'
    Rounded 0 0 336 $height 16 '#ffffff' '#e1e6ef'
    $g.DrawImage($logo,20,18,30,30)
    Text 'WebRTC Control' 59 23 16 '#202124' $true
    Rounded 20 64 296 ($cardBottom-64) 12 '#f8f9fb' '#e4e7ec'
    $dotColor = if ($enabled) { '#4285f4' } else { '#9aa0a6' }
    Circle 36 89 7 $dotColor
    $title = if ($enabled) { $m.statusRestricted.message } else { $m.statusOriginal.message }
    Text $title 51 80 17 '#202124' $true 249
    Text $description 36 112.5 12 '#5f6368' $false 264 19.2
    $enableFill = if ($enabled) { '#f1f3f4' } else { '#1a73e8' }
    $restoreFill = if ($enabled) { '#1a73e8' } else { '#f1f3f4' }
    $enableColor = if ($enabled) { '#9aa0a6' } else { '#ffffff' }
    $restoreColor = if ($enabled) { '#ffffff' } else { '#9aa0a6' }
    $enableText = if ($enabled) { $m.enabled.message } else { $m.enable.message }
    Rounded 36 $actionY 128 38 7 $enableFill
    Rounded 172 $actionY 128 38 7 $restoreFill
    CenterText $enableText 36 $actionY 128 38 12 $enableColor
    CenterText $m.restore.message 172 $actionY 128 38 12 $restoreColor
    Text $m.tip.message 20 $tipY 11 '#80868b' $false 296 17.6
    Text ('▸ ' + $m.detailsTitle.message) 20 $detailsY 11 '#5f6368'
    Rule 20 $dividerY 296 '#eceff1'
    $privacyFont = Font 11
    $privacyWidth = $g.MeasureString($m.privacy.message,$privacyFont,[int]10000,[System.Drawing.StringFormat]::GenericTypographic).Width
    $privacyFont.Dispose()
    $privacyX = (336-$privacyWidth-10)/2
    Circle $privacyX ($dividerY+19) 4 '#4285f4'
    Text $m.privacy.message ($privacyX+10) ($dividerY+13) 11 '#70757a'
    $g.Restore($saved)
}

$copy = @{
    'zh-CN' = @{
        locale='zh_CN'; promo="WebRTC 连接`n一键管理"; promoSub='限制非代理 UDP'; local='本地运行 · 不收集浏览记录'
        originalTitle="按需启用`nWebRTC 限制"; activeTitle="限制已生效`n随时恢复";
        originalBody='查看当前策略，一键启用连接限制。'; activeBody='需要使用原有连接策略时，一键撤销修改。';
        originalTag='01 / 使用原设置'; activeTag='02 / 限制已启用';
        feature1='自动识别浏览器语言'; feature2='启用与恢复，操作互斥'; feature3='无需账号，本地运行';
        limit='限制非代理 UDP，不会彻底关闭 WebRTC。'; sample='界面示意'
    }
    'zh-TW' = @{
        locale='zh_TW'; promo="WebRTC 連線`n一鍵管理"; promoSub='限制非代理 UDP'; local='本機執行 · 不收集瀏覽紀錄'
        originalTitle="按需啟用`nWebRTC 限制"; activeTitle="限制已生效`n隨時還原";
        originalBody='檢視目前政策，一鍵啟用連線限制。'; activeBody='需要使用原有連線政策時，一鍵撤銷修改。';
        originalTag='01 / 使用原有設定'; activeTag='02 / 已啟用限制';
        feature1='自動識別瀏覽器語言'; feature2='啟用與還原，操作互斥'; feature3='無需帳號，本機執行';
        limit='限制非代理 UDP，不會徹底關閉 WebRTC。'; sample='介面示意'
    }
    'en' = @{
        locale='en'; promo="WebRTC control,`none click away."; promoSub='Restrict non-proxied UDP'; local='Local only · No browsing history collected'
        originalTitle="Your WebRTC policy.`nYour choice."; activeTitle="Restriction on.`nRestore anytime.";
        originalBody='Check the active policy and enable the restriction with one click.'; activeBody='Remove the extension override to return to your original settings.';
        originalTag='01 / ORIGINAL SETTINGS'; activeTag='02 / RESTRICTION ENABLED';
        feature1='Automatic interface language'; feature2='One available action at a time'; feature3='Local operation. No account.';
        limit='Restricts non-proxied UDP. Does not fully disable WebRTC.'; sample='Interface illustration'
    }
}
try {
    foreach ($language in @('zh-CN','zh-TW','en')) {
        $c = $copy[$language]
        $m = Get-Content -LiteralPath (Join-Path $projectRoot "_locales/$($c.locale)/messages.json") -Raw | ConvertFrom-Json -AsHashtable
        $directory = Join-Path $assetRoot $language
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
        $bitmap = Canvas 440 280
        Circle 278 -116 300 '#f1f6ff'
        $g.DrawImage($logo,28,25,42,42)
        Text 'WebRTC Control' 81 34 21 '#202124' $true
        Text $c.promo 28 100 28 '#174ea6' $true 292 38
        Text $c.promoSub 29 191 12 '#5f6368' $false 265
        $g.DrawImage($logo,312,136,100,100)
        Rule 28 231 384 '#e4eaf3'
        Text $c.local 28 245 11 '#5f6368'
        Save $bitmap 440 280 (Join-Path $directory 'promo-440x280.png')

        foreach ($enabled in @($false,$true)) {
            $bitmap = Canvas 1280 800
            $g.Clear((Color '#f5f8fe'))
            Circle 985 -240 670 '#edf3ff'
            Circle -190 605 430 '#edf3ff'
            $g.DrawImage($logo,80,62,44,44)
            Text 'WebRTC Control' 136 70 24 '#202124' $true
            $tag = if ($enabled) { $c.activeTag } else { $c.originalTag }
            $title = if ($enabled) { $c.activeTitle } else { $c.originalTitle }
            $body = if ($enabled) { $c.activeBody } else { $c.originalBody }
            Text $tag 80 190 14 '#1a73e8' $true
            Text $title 78 238 40 '#172b4d' $true 550 58
            Text $body 81 385 18 '#5f6c81' $false 480 30
            $row = 493
            foreach ($feature in @($c.feature1,$c.feature2,$c.feature3)) {
                Circle 82 ($row+7) 6 '#4285f4'
                Text $feature 101 $row 16 '#52627b' $false 480
                $row += 37
            }
            Popup $m $enabled 698 153 1.4
            Rule 80 704 1120 '#dfe7f4'
            Text $c.limit 80 731 14 '#75829a' $false 870
            Text $c.sample 1040 731 13 '#75829a' $false 160
            $name = if ($enabled) { 'screen-02-restricted-1280x800.png' } else { 'screen-01-original-1280x800.png' }
            Save $bitmap 1280 800 (Join-Path $directory $name)
        }
        Write-Output "Created store graphics: $language"
    }
} finally { $logo.Dispose() }
