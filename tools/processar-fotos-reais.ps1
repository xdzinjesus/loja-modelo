# ==========================================================================
# LOJA - Fotos reais dos produtos
#
# 1. Coloque as fotos na pasta  fotos\  (raiz do projeto)
#    O nome do arquivo deve COMECAR com o codigo do produto no PDF:
#      1830.jpg   ou   1830 - castanha de caju.jpg   ou   100000724.png
# 2. Rode:  powershell -ExecutionPolicy Bypass -File tools\processar-fotos-reais.ps1
#
# O script redimensiona (max. 900 px, quadrado com fundo branco), comprime em JPG
# e gera data\fotos-reais.js. Fotos reais SEMPRE tem prioridade no site.
# ==========================================================================
param([int]$Tamanho = 900, [int]$Qualidade = 82)
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path -Parent $PSScriptRoot
$origem = Join-Path $raiz 'fotos'
$destino = Join-Path $raiz 'assets\produtos'
New-Item -ItemType Directory -Force $origem, $destino | Out-Null

$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]$Qualidade)

$mapa = [ordered]@{}; $ignoradas = @()
Get-ChildItem $origem -File | Where-Object { $_.Extension -match '^\.(jpe?g|png|webp|bmp)$' } | ForEach-Object {
  if ($_.BaseName -notmatch '^\s*(\d+(-\d+)?)') { $ignoradas += $_.Name; return }
  $codigo = $Matches[1]
  try {
    $img = [Drawing.Image]::FromFile($_.FullName)
    $escala = [Math]::Min($Tamanho / $img.Width, $Tamanho / $img.Height)
    $w = [int]($img.Width * $escala); $h = [int]($img.Height * $escala)
    $tela = New-Object Drawing.Bitmap $Tamanho, $Tamanho
    $g = [Drawing.Graphics]::FromImage($tela)
    $g.Clear([Drawing.Color]::White)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'
    $g.DrawImage($img, [int](($Tamanho - $w) / 2), [int](($Tamanho - $h) / 2), $w, $h)
    $arq = Join-Path $destino "$codigo.jpg"
    $tela.Save($arq, $codec, $params)
    $g.Dispose(); $tela.Dispose(); $img.Dispose()
    $mapa[$codigo] = "assets/produtos/$codigo.jpg"
  } catch { $ignoradas += $_.Name }
}

$json = ($mapa.GetEnumerator() | ForEach-Object { '"' + $_.Key + '":"' + $_.Value + '"' }) -join ','
$js = "/* Fotos reais da loja (codigo -> arquivo) - gerado por tools/processar-fotos-reais.ps1 em $(Get-Date -Format 'yyyy-MM-dd HH:mm') */`nwindow.LOJA_FOTOS_REAIS = {$json};`n"
[IO.File]::WriteAllText((Join-Path $raiz 'data\fotos-reais.js'), $js, (New-Object Text.UTF8Encoding $false))
Write-Host "OK: $($mapa.Count) fotos reais processadas em assets\produtos\"
if ($ignoradas.Count) { Write-Host "Ignoradas (nome sem codigo ou arquivo invalido): $($ignoradas -join ', ')" }
