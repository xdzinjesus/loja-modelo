# ==========================================================================
# LOJA - Sincronizacao automatica das fotos reais
#
# Vigia a pasta  fotos\  e, a cada foto nova/alterada, gera a versao do site
# (assets\produtos\<codigo>.jpg, 900 px, fundo branco) e atualiza data\fotos-reais.js.
# Processa SO o que mudou. Foto apagada de fotos\ sai do site (o arquivo gerado fica).
#
#   Vigiar sem parar:  powershell -ExecutionPolicy Bypass -File tools\sincronizar-fotos.ps1
#   Rodar uma vez:     powershell -ExecutionPolicy Bypass -File tools\sincronizar-fotos.ps1 -UmaVez
#
# Nome do arquivo deve COMECAR com o codigo do produto: 1830.jpg, "1830 - castanha.png"...
# Se houver 2 arquivos com o mesmo codigo, vale o mais recente.
# Registro: _dev\sincronizar-fotos.log
# ==========================================================================
param([int]$Tamanho = 900, [int]$Qualidade = 82, [switch]$UmaVez)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
$origem = Join-Path $raiz 'fotos'
$destino = Join-Path $raiz 'assets\produtos'
$mapaJs = Join-Path $raiz 'data\fotos-reais.js'
$logArq = Join-Path $raiz '_dev\sincronizar-fotos.log'
New-Item -ItemType Directory -Force $origem, $destino | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false

# Uma instancia so (evita dois vigias gravando ao mesmo tempo)
$mutex = New-Object Threading.Mutex($false, 'Global\LojaSincronizarFotos')
if (-not $UmaVez -and -not $mutex.WaitOne(0)) { Write-Host 'Ja existe um sincronizador rodando.'; exit }

$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object Drawing.Imaging.EncoderParameters 1
$encParams.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]$Qualidade)

function Registrar([string]$msg) {
  $linha = "[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] $msg"
  Write-Host $linha
  try { [IO.File]::AppendAllText($logArq, $linha + "`r`n", $utf8) } catch { }
}
function Codigo([string]$nome) {
  if ([IO.Path]::GetFileNameWithoutExtension($nome) -match '^\s*(\d+(-\d+)?)') { return $Matches[1] }
  return $null
}
# Arquivo ainda sendo gravado? (Codex/download em andamento)
function Pronto([string]$caminho) {
  try {
    $t1 = (Get-Item -LiteralPath $caminho).Length; Start-Sleep -Milliseconds 400
    $t2 = (Get-Item -LiteralPath $caminho).Length
    if ($t1 -ne $t2 -or $t2 -eq 0) { return $false }
    $s = [IO.File]::Open($caminho, 'Open', 'Read', 'None'); $s.Close(); return $true
  } catch { return $false }
}
function Processar($arq, [string]$codigo) {
  $final = Join-Path $destino "$codigo.jpg"
  $tmp = Join-Path $destino ".$codigo.$PID.tmp"   # nome unico: vigia e servidor podem rodar juntos
  $img = $null; $tela = $null; $g = $null
  try {
    # carrega via stream para nao travar o arquivo de origem
    $bytes = [IO.File]::ReadAllBytes($arq.FullName)
    $ms = New-Object IO.MemoryStream(, $bytes)
    $img = [Drawing.Image]::FromStream($ms)
    $escala = [Math]::Min($Tamanho / $img.Width, $Tamanho / $img.Height)
    $w = [int]($img.Width * $escala); $h = [int]($img.Height * $escala)
    $tela = New-Object Drawing.Bitmap $Tamanho, $Tamanho
    $g = [Drawing.Graphics]::FromImage($tela)
    $g.Clear([Drawing.Color]::White)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($img, [int](($Tamanho - $w) / 2), [int](($Tamanho - $h) / 2), $w, $h)
    $tela.Save($tmp, $codec, $encParams)
    Move-Item -LiteralPath $tmp -Destination $final -Force   # troca atomica: o site nunca le meia foto
    return $true
  } catch {
    Registrar "ERRO ao processar $($arq.Name): $($_.Exception.Message)"
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    return $false
  } finally {
    if ($g) { $g.Dispose() }; if ($tela) { $tela.Dispose() }; if ($img) { $img.Dispose() }
  }
}

# Miniatura 480 px para a vitrine (o cartao nao precisa da foto de 900 px: ~5x mais leve no celular)
$miniDir = Join-Path $destino 'mini'
New-Item -ItemType Directory -Force $miniDir | Out-Null
$encMini = New-Object Drawing.Imaging.EncoderParameters 1
$encMini.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]78)
function Miniatura([string]$codigo) {
  $orig = Join-Path $destino "$codigo.jpg"; $final = Join-Path $miniDir "$codigo.jpg"; $tmp = Join-Path $miniDir ".$codigo.$PID.tmp"
  $img = $null; $tela = $null; $g = $null
  try {
    $ms = New-Object IO.MemoryStream(, [IO.File]::ReadAllBytes($orig))
    $img = [Drawing.Image]::FromStream($ms)
    $tela = New-Object Drawing.Bitmap 480, 480
    $g = [Drawing.Graphics]::FromImage($tela); $g.Clear([Drawing.Color]::White)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($img, 0, 0, 480, 480)
    $tela.Save($tmp, $codec, $encMini); Move-Item -LiteralPath $tmp -Destination $final -Force
    return $true
  } catch { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }; return $false }
  finally { if ($g) { $g.Dispose() }; if ($tela) { $tela.Dispose() }; if ($img) { $img.Dispose() } }
}

# Dados do produto (codigo, nome, preco...) gravados dentro de cada foto - ver tools\metadados-sku.ps1
. (Join-Path $PSScriptRoot 'metadados-sku.ps1') -SoFuncoes
$script:catalogoSku = $null
function Carimbar([string]$codigo) {
  try {
    if (-not $script:catalogoSku) { $script:catalogoSku = Get-CatalogoSku }
    if (-not $script:catalogoSku.ContainsKey($codigo)) { return }
    foreach ($arq in (Join-Path $destino "$codigo.jpg"), (Join-Path $miniDir "$codigo.jpg")) {
      if (Test-Path -LiteralPath $arq) { [void](Set-MetadadosSku $arq $script:catalogoSku[$codigo] $null) }
    }
  } catch { Registrar "Aviso: nao gravou metadados em $codigo ($($_.Exception.Message))" }
}

$script:pendentes = @{}
function Sincronizar {
  $fontes = Get-ChildItem -LiteralPath $origem -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\.(jpe?g|png|webp|bmp|gif)$' }
  $porCodigo = @{}; $semCodigo = @()
  foreach ($f in $fontes) {
    $c = Codigo $f.Name
    if (-not $c) { $semCodigo += $f.Name; continue }
    if (-not $porCodigo.ContainsKey($c) -or $f.LastWriteTime -gt $porCodigo[$c].LastWriteTime) { $porCodigo[$c] = $f }
  }
  # Datas dos arquivos gerados lidas de uma vez (conferir um por um levava ~15 s com 800 fotos)
  $dataSite = @{}; Get-ChildItem -LiteralPath $destino -Filter *.jpg -File -ErrorAction SilentlyContinue | ForEach-Object { $dataSite[$_.BaseName] = $_.LastWriteTime }
  $dataMini = @{}; Get-ChildItem -LiteralPath $miniDir -Filter *.jpg -File -ErrorAction SilentlyContinue | ForEach-Object { $dataMini[$_.BaseName] = $_.LastWriteTime }
  $novas = @(); $aguardando = 0
  foreach ($c in $porCodigo.Keys) {
    $f = $porCodigo[$c]
    $precisa = -not $dataSite.ContainsKey($c) -or ($f.LastWriteTime -gt $dataSite[$c])
    if (-not $precisa) { continue }
    if (-not (Pronto $f.FullName)) { $aguardando++; continue }
    if (Processar $f $c) { $novas += "$c ($($f.Name))"; $dataSite[$c] = Get-Date }
  }
  # mapa codigo -> arquivo (so codigos com foto de origem E versao gerada)
  $codigos = $porCodigo.Keys | Where-Object { $dataSite.ContainsKey($_) } | Sort-Object { [long](($_ -split '-')[0]) }, { $_ }
  # miniaturas faltando ou desatualizadas (foto trocada)
  $minis = 0
  foreach ($c in $codigos) {
    if (-not $dataMini.ContainsKey($c) -or $dataMini[$c] -lt $dataSite[$c]) { if (Miniatura $c) { $minis++; Carimbar $c } }
  }
  if ($minis -gt 5) { Registrar "Miniaturas da vitrine geradas: $minis" }
  $json = ($codigos | ForEach-Object { '"' + $_ + '":"assets/produtos/' + $_ + '.jpg"' }) -join ','
  $corpo = "window.LOJA_FOTOS_REAIS = {$json};"
  $atual = if (Test-Path -LiteralPath $mapaJs) { [IO.File]::ReadAllText($mapaJs) } else { '' }
  $antes = @([regex]::Matches($atual, '"([^"]+)":"assets/produtos/') | ForEach-Object { $_.Groups[1].Value })
  if (-not $atual.Contains($corpo)) {
    $js = "/* Fotos reais da loja (codigo -> arquivo) - gerado por tools/sincronizar-fotos.ps1 em $(Get-Date -Format 'yyyy-MM-dd HH:mm') */`n$corpo`n"
    $tmp = "$mapaJs.$PID.tmp"; [IO.File]::WriteAllText($tmp, $js, $utf8); Move-Item -LiteralPath $tmp -Destination $mapaJs -Force
    $removidas = @($antes | Where-Object { $codigos -notcontains $_ })
    Registrar ("Site atualizado: {0} foto(s) no site{1}{2}" -f @($codigos).Count, $(if ($novas.Count) { " | novas/alteradas: " + ($novas -join ', ') } else { '' }), $(if ($removidas.Count) { " | saiu do site: " + ($removidas -join ', ') } else { '' }))
  } elseif ($novas.Count) {
    Registrar ("Fotos atualizadas no site: " + ($novas -join ', '))
  }
  foreach ($n in $semCodigo) { if (-not $script:pendentes.ContainsKey($n)) { $script:pendentes[$n] = 1; Registrar "IGNORADA (nome nao comeca com codigo do produto): $n" } }
  return $aguardando
}

Registrar "Sincronizador iniciado. Pasta vigiada: $origem"
$aguard = Sincronizar
if ($UmaVez) { if ($aguard) { Registrar "$aguard arquivo(s) ainda sendo gravado(s); rode de novo em instantes." }; return }

$vigia = New-Object IO.FileSystemWatcher $origem
$vigia.IncludeSubdirectories = $false
$vigia.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
$ids = 'Created', 'Changed', 'Renamed', 'Deleted' | ForEach-Object { $id = "kd-fotos-$_"; Register-ObjectEvent $vigia $_ -SourceIdentifier $id | Out-Null; $id }
$vigia.EnableRaisingEvents = $true
$ultimaVarredura = Get-Date
try {
  while ($true) {
    $ev = Wait-Event -Timeout 5
    $houve = $false
    if ($ev) {
      # agrupa rajadas (o Codex pode salvar varias fotos em sequencia)
      do { Get-Event | Remove-Event; $houve = $true; Start-Sleep -Milliseconds 1500 } while (Get-Event)
    }
    if ($houve -or $aguard -gt 0 -or ((Get-Date) - $ultimaVarredura).TotalSeconds -ge 60) {
      $aguard = Sincronizar; $ultimaVarredura = Get-Date
    }
  }
} finally {
  $ids | ForEach-Object { Unregister-Event -SourceIdentifier $_ -ErrorAction SilentlyContinue }
  $vigia.Dispose(); $mutex.ReleaseMutex()
}
