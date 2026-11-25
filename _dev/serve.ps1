# Servidor estatico minimo para preview local (sem dependencias).
# Uso: powershell -ExecutionPolicy Bypass -File _dev/serve.ps1 [-Port 5510]
param([int]$Port = 5510)
$root = Split-Path -Parent $PSScriptRoot
$mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.webp'='image/webp'; '.ico'='image/x-icon'; '.woff2'='font/woff2'; '.webmanifest'='application/manifest+json'; '.txt'='text/plain; charset=utf-8' }
# ---------- Fotos dos produtos (área administrativa, modo local) ----------
# POST /_fotos/enviar?codigo=X  (corpo = imagem)   -> grava fotos\X.jpg e atualiza o site
# POST /_fotos/remover?codigo=X                    -> foto real vai para fotos\_removidas; sem foto real, oculta a do banco
# POST /_fotos/banco?codigo=X&ocultar=0|1          -> mostra/oculta a foto do banco de imagens
# POST /_destaques/salvar  {chave, skus}             -> grava data/destaques.js (tela Destaques do admin)
# Exige o cabeçalho X-Loja-Pin = contas.painelPin (config.js) e origem localhost.
$fotosDir = Join-Path $root 'fotos'; $prodDir = Join-Path $root 'assets\produtos'
$ocultasJs = Join-Path $root 'data\fotos-ocultas.js'; $sincronizar = Join-Path $root 'tools\sincronizar-fotos.ps1'
function Fotos-Codigo([string]$nome) { if ([IO.Path]::GetFileNameWithoutExtension($nome) -match '^\s*(\d+(-\d+)?)') { return $Matches[1] }; return $null }
function Fotos-Originais([string]$codigo) { Get-ChildItem -LiteralPath $fotosDir -File | Where-Object { $_.Extension -match '^\.(jpe?g|png|webp|bmp|gif)$' -and (Fotos-Codigo $_.Name) -eq $codigo } }
function Fotos-Arquivar([string]$codigo) {
  $dir = Join-Path $fotosDir '_removidas'; New-Item -ItemType Directory -Force $dir | Out-Null
  $n = 0; foreach ($f in @(Fotos-Originais $codigo)) { Move-Item -LiteralPath $f.FullName -Destination (Join-Path $dir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '_' + $f.Name)) -Force; $n++ }
  return $n
}
function Fotos-Ocultas { if (Test-Path $ocultasJs) { $m = [regex]::Match([IO.File]::ReadAllText($ocultasJs), '\[(.*?)\]'); if ($m.Success -and $m.Groups[1].Value.Trim()) { return @($m.Groups[1].Value -split ',' | ForEach-Object { $_.Trim().Trim('"') } | Where-Object { $_ }) } }; return @() }
function Fotos-SalvarOcultas($lista) {
  $json = (@($lista | Sort-Object -Unique) | ForEach-Object { '"' + $_ + '"' }) -join ','
  [IO.File]::WriteAllText($ocultasJs, "/* Produtos cuja foto do banco de imagens foi ocultada pela area administrativa (o site usa a arte de embalagem). */`nwindow.LOJA_FOTOS_OCULTAS = [$json];`n", (New-Object Text.UTF8Encoding $false))
}
function Fotos-Sincronizar { & powershell -NoProfile -ExecutionPolicy Bypass -File $sincronizar -UmaVez | Out-Null }
function Fotos-Pin { $c = Join-Path $root 'assets\js\config.js'; $m = [regex]::Match([IO.File]::ReadAllText($c), "painelPin:\s*'([^']*)'"); if ($m.Success) { $m.Groups[1].Value } else { $null } }
function Fotos-Responder($ctx, [int]$status, $obj) {
  $ctx.Response.StatusCode = $status; $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress)); $ctx.Response.OutputStream.Write($b, 0, $b.Length)
}
# POST /_produtos/salvar  corpo JSON {codigo, nome, preco, descricao}  -> grava data\produtos-ajustes.js
#   campo vazio/null = volta ao valor original do catalogo (PDF)
$ajustesJs = Join-Path $root 'data\produtos-ajustes.js'
function Produtos-Salvar($ctx) {
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8); $txt = $reader.ReadToEnd()
  try { $d = $txt | ConvertFrom-Json } catch { return Fotos-Responder $ctx 400 @{ erro = 'Dados inválidos.' } }
  $codigo = [string]$d.codigo
  if ($codigo -notmatch '^\d+(-\d+)?$') { return Fotos-Responder $ctx 400 @{ erro = 'Código de produto inválido.' } }
  $mapa = @{}
  if (Test-Path $ajustesJs) {
    $m = [regex]::Match([IO.File]::ReadAllText($ajustesJs), '(?s)LOJA_AJUSTES\s*=\s*(\{.*\})\s*;')
    if ($m.Success) { $o = $m.Groups[1].Value | ConvertFrom-Json; foreach ($k in $o.PSObject.Properties) { $h = @{}; foreach ($q in $k.Value.PSObject.Properties) { $h[$q.Name] = $q.Value }; $mapa[$k.Name] = $h } }
  }
  $aj = @{}
  if ($d.nome) { $n = ([string]$d.nome).Trim(); if ($n.Length -lt 2 -or $n.Length -gt 150) { return Fotos-Responder $ctx 400 @{ erro = 'Nome deve ter de 2 a 150 caracteres.' } }; $aj.nome = $n }
  if ($null -ne $d.preco -and "$($d.preco)" -ne '') {
    $p = 0.0; if (-not [double]::TryParse("$($d.preco)", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$p) -or $p -le 0 -or $p -gt 100000) { return Fotos-Responder $ctx 400 @{ erro = 'Preço inválido.' } }
    $aj.preco = [Math]::Round($p, 2)
  }
  if ($d.unidade_medida) { $u = [string]$d.unidade_medida; if ($u -notin 'kg', 'un') { return Fotos-Responder $ctx 400 @{ erro = 'Unidade inválida (use kg ou un).' } }; $aj.unidade_medida = $u }
  if ($d.descricao) { $t = ([string]$d.descricao).Trim(); if ($t.Length -gt 3000) { return Fotos-Responder $ctx 400 @{ erro = 'Descrição muito longa (máx. 3000 caracteres).' } }; $aj.descricao = $t }
  if ($aj.Count) { $mapa[$codigo] = $aj } else { $mapa.Remove($codigo) }
  $json = if ($mapa.Count) { $mapa | ConvertTo-Json -Depth 4 -Compress } else { '{}' }
  $tmp = "$ajustesJs.tmp"
  [IO.File]::WriteAllText($tmp, "/* Ajustes de produtos feitos na area administrativa (nome, preco, descricao) - sobrepoem data/produtos.js. */`nwindow.LOJA_AJUSTES = $json;`n", (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $tmp -Destination $ajustesJs -Force
  return Fotos-Responder $ctx 200 @{ ok = $true; ajuste = $aj }
}
# POST /_destaques/salvar  corpo JSON {chave, skus:[...]}  -> grava data\destaques.js
#   chave: 'todos' (vitrine inicial) | slug do departamento | 'obj:<id>' (objetivo); skus: ate 16 codigos, na ordem. Lista vazia = volta ao padrao.
$destaquesJs = Join-Path $root 'data\destaques.js'
function Destaques-Salvar($ctx) {
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8); $txt = $reader.ReadToEnd()
  try { $d = $txt | ConvertFrom-Json } catch { return Fotos-Responder $ctx 400 @{ erro = 'Dados inválidos.' } }
  $chave = [string]$d.chave
  if ($chave -cnotmatch '^(todos|[a-z0-9-]{2,40}|obj:[a-z0-9-]{2,40})$') { return Fotos-Responder $ctx 400 @{ erro = 'Lista de destaques inválida.' } }
  $skus = New-Object Collections.Generic.List[string]
  foreach ($s in @($d.skus)) {
    if ($null -eq $s) { continue }
    $s = [string]$s
    if ($s -notmatch '^\d+(-\d+)?$') { return Fotos-Responder $ctx 400 @{ erro = "Código de produto inválido: $s" } }
    if (-not $skus.Contains($s)) { $skus.Add($s) }
  }
  if ($skus.Count -gt 16) { return Fotos-Responder $ctx 400 @{ erro = 'No máximo 16 produtos em destaque por lista.' } }
  $mapa = [ordered]@{}
  if (Test-Path $destaquesJs) {
    $m = [regex]::Match([IO.File]::ReadAllText($destaquesJs), '(?s)LOJA_DESTAQUES\s*=\s*(\{.*\})\s*;')
    if ($m.Success) { $o = $m.Groups[1].Value | ConvertFrom-Json; foreach ($k in $o.PSObject.Properties) { $mapa[$k.Name] = @($k.Value | ForEach-Object { [string]$_ }) } }
  }
  if ($skus.Count) { $mapa[$chave] = $skus.ToArray() } else { $mapa.Remove($chave) }
  # JSON montado aqui (chaves e codigos ja validados): o ConvertTo-Json do PowerShell 5 desfaz lista de 1 item
  $partes = foreach ($k in ($mapa.Keys | Sort-Object)) { '"' + $k + '":[' + ((@($mapa[$k]) | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']' }
  $cab = "/* Produtos em destaque escolhidos na area administrativa (tela ""Destaques"").`n   Chave: ""todos"" = vitrine inicial; slug do departamento (ex.: ""castanhas""); ""obj:<id>"" = objetivo (ex.: ""obj:treino"").`n   Valor: codigos (SKU) na ordem em que aparecem primeiro na vitrine (ate 16). Gravado por _dev/serve.ps1 (/_destaques/salvar). */`n"
  $tmp = "$destaquesJs.tmp"
  [IO.File]::WriteAllText($tmp, $cab + 'window.LOJA_DESTAQUES = {' + ($partes -join ',') + "};`n", (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $tmp -Destination $destaquesJs -Force
  return Fotos-Responder $ctx 200 @{ ok = $true; chave = $chave; skus = $skus.ToArray() }
}
function Fotos-Tratar($ctx) {
  $req = $ctx.Request; $rota = $req.Url.AbsolutePath
  if ($rota -eq '/_fotos/status') { return Fotos-Responder $ctx 200 @{ ok = $true } }
  $origem = $req.Headers['Origin']
  if ($origem -and $origem -notmatch '^http://localhost(:\d+)?$') { return Fotos-Responder $ctx 403 @{ erro = 'Origem não permitida.' } }
  $pin = Fotos-Pin
  if (-not $pin -or $req.Headers['X-Loja-Pin'] -ne $pin) { return Fotos-Responder $ctx 401 @{ erro = 'PIN do painel inválido. Saia e entre de novo no admin.' } }
  if ($req.HttpMethod -ne 'POST') { return Fotos-Responder $ctx 405 @{ erro = 'Use POST.' } }
  if ($rota -eq '/_produtos/salvar') { return Produtos-Salvar $ctx }
  if ($rota -eq '/_destaques/salvar') { return Destaques-Salvar $ctx }
  $codigo = $req.QueryString['codigo']
  if ($codigo -notmatch '^\d+(-\d+)?$') { return Fotos-Responder $ctx 400 @{ erro = 'Código de produto inválido.' } }

  if ($rota -eq '/_fotos/enviar') {
    $ms = New-Object IO.MemoryStream; $req.InputStream.CopyTo($ms); $bytes = $ms.ToArray()
    if ($bytes.Length -lt 100) { return Fotos-Responder $ctx 400 @{ erro = 'Arquivo vazio.' } }
    if ($bytes.Length -gt 15MB) { return Fotos-Responder $ctx 413 @{ erro = 'Foto muito grande (máx. 15 MB).' } }
    $ext = $null
    if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF) { $ext = 'jpg' }
    elseif ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) { $ext = 'png' }
    elseif ([Text.Encoding]::ASCII.GetString($bytes, 0, 4) -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -eq 'WEBP') { $ext = 'webp' }
    if (-not $ext) { return Fotos-Responder $ctx 415 @{ erro = 'Formato não suportado. Envie JPG, PNG ou WEBP.' } }
    $arquivadas = Fotos-Arquivar $codigo
    [IO.File]::WriteAllBytes((Join-Path $fotosDir "$codigo.$ext"), $bytes)
    $oc = Fotos-Ocultas; if ($oc -contains $codigo) { Fotos-SalvarOcultas ($oc | Where-Object { $_ -ne $codigo }) }
    Fotos-Sincronizar
    $ok = Test-Path (Join-Path $prodDir "$codigo.jpg")
    if (-not $ok) { return Fotos-Responder $ctx 500 @{ erro = 'A foto foi salva mas não pôde ser processada. Confira o arquivo.' } }
    return Fotos-Responder $ctx 200 @{ ok = $true; arquivo = "assets/produtos/$codigo.jpg"; substituida = ($arquivadas -gt 0) }
  }
  if ($rota -eq '/_fotos/remover') {
    $arquivadas = Fotos-Arquivar $codigo
    if ($arquivadas -gt 0) {
      $gerada = Join-Path $prodDir "$codigo.jpg"; if (Test-Path $gerada) { Remove-Item -LiteralPath $gerada -Force }
      $mini = Join-Path $prodDir "mini\$codigo.jpg"; if (Test-Path $mini) { Remove-Item -LiteralPath $mini -Force }
      Fotos-Sincronizar
      return Fotos-Responder $ctx 200 @{ ok = $true; removida = 'real' }
    }
    $oc = Fotos-Ocultas; Fotos-SalvarOcultas (@($oc) + $codigo)
    return Fotos-Responder $ctx 200 @{ ok = $true; removida = 'banco' }
  }
  if ($rota -eq '/_fotos/banco') {
    $oc = Fotos-Ocultas
    if ($req.QueryString['ocultar'] -eq '1') { Fotos-SalvarOcultas (@($oc) + $codigo) } else { Fotos-SalvarOcultas ($oc | Where-Object { $_ -ne $codigo }) }
    return Fotos-Responder $ctx 200 @{ ok = $true }
  }
  return Fotos-Responder $ctx 404 @{ erro = 'Rota desconhecida.' }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Loja preview em http://localhost:$Port/ (raiz: $root)"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    # CORS (ferramentas de dev rodando em outra aba podem ler/gravar aqui)
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $ctx.Response.Headers.Add('Access-Control-Allow-Headers', '*')
    $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $ctx.Response.Headers.Add('Access-Control-Allow-Private-Network', 'true')
    if ($ctx.Request.HttpMethod -eq 'OPTIONS') { $ctx.Response.StatusCode = 204; continue }
    if ($ctx.Request.Url.AbsolutePath -like '/_fotos/*' -or $ctx.Request.Url.AbsolutePath -in '/_produtos/salvar', '/_destaques/salvar') {
      try { Fotos-Tratar $ctx } catch { Fotos-Responder $ctx 500 @{ erro = 'Erro no servidor: ' + $_.Exception.Message } }
      continue
    }
    # POST /_save        -> grava data/produtos.js (importador de catálogo)
    # POST /_save-fotos  -> grava data/fotos.js   (busca de fotos)
    if ($ctx.Request.HttpMethod -eq 'POST' -and $ctx.Request.Url.AbsolutePath -match '^/_save(-fotos|-tmp)?$') {
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd(); $reader.Close()
      $alvo = @{ '/_save' = 'data\produtos.js'; '/_save-fotos' = 'data\fotos.js'; '/_save-tmp' = '_dev\resultado.json' }[$ctx.Request.Url.AbsolutePath]
      if ($body.Length -gt 0) {
        [IO.File]::WriteAllText((Join-Path $root $alvo), $body, (New-Object Text.UTF8Encoding $false))
        $ctx.Response.StatusCode = 200
      } else { $ctx.Response.StatusCode = 400 }
      continue
    }
    # GET /_stock?q=...&page=1 -> proxy da API do Pixabay (chave em _dev\pixabay.key; nunca vai para o site)
    if ($ctx.Request.Url.AbsolutePath -eq '/_stock') {
      $keyFile = Join-Path $root '_dev\pixabay.key'
      $ctx.Response.ContentType = 'application/json; charset=utf-8'
      if (-not (Test-Path $keyFile)) { $ctx.Response.StatusCode = 401; $b = [Text.Encoding]::UTF8.GetBytes('{"erro":"Crie o arquivo _dev/pixabay.key com a sua chave"}'); $ctx.Response.OutputStream.Write($b, 0, $b.Length); continue }
      $key = (Get-Content $keyFile -Raw).Trim()
      $q = $ctx.Request.QueryString['q']; $pg = $ctx.Request.QueryString['page']; if (-not $pg) { $pg = '1' }
      $url = 'https://pixabay.com/api/?image_type=photo&safesearch=true&per_page=80&page=' + $pg + '&key=' + $key + '&q=' + [Uri]::EscapeDataString($q)
      try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
        $b = [Text.Encoding]::UTF8.GetBytes($r.Content)
      } catch {
        $code = 502; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        $ctx.Response.StatusCode = $code; $b = [Text.Encoding]::UTF8.GetBytes('{"erro":"' + $code + '"}')
      }
      $ctx.Response.OutputStream.Write($b, 0, $b.Length); continue
    }
    # POST /_baixar  body: codigo|url  -> baixa a foto do Pixabay, recorta 640x640 e grava assets\fotos-stock\<codigo>.jpg
    if ($ctx.Request.HttpMethod -eq 'POST' -and $ctx.Request.Url.AbsolutePath -eq '/_baixar') {
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
      $partes = $reader.ReadToEnd().Split('|'); $reader.Close()
      $codigo = $partes[0]; $src = $partes[1]
      if ($codigo -notmatch '^[\d-]+$' -or ([Uri]$src).Host -notmatch '(^|\.)pixabay\.com$') { $ctx.Response.StatusCode = 400; continue }
      Add-Type -AssemblyName System.Drawing
      $dir = Join-Path $root 'assets\fotos-stock'; New-Item -ItemType Directory -Force $dir | Out-Null
      $tmp = Join-Path $env:TEMP "kd-$codigo.img"
      try {
        Invoke-WebRequest -Uri $src -OutFile $tmp -UseBasicParsing -TimeoutSec 30
        $img = [Drawing.Image]::FromFile($tmp); $lado = [Math]::Min($img.Width, $img.Height)
        $tela = New-Object Drawing.Bitmap 640, 640; $g = [Drawing.Graphics]::FromImage($tela)
        $g.InterpolationMode = 'HighQualityBicubic'
        $g.DrawImage($img, (New-Object Drawing.Rectangle 0, 0, 640, 640), (New-Object Drawing.Rectangle ([int](($img.Width - $lado) / 2)), ([int](($img.Height - $lado) / 2)), $lado, $lado), [Drawing.GraphicsUnit]::Pixel)
        $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
        $ep = New-Object Drawing.Imaging.EncoderParameters 1; $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]80)
        $tela.Save((Join-Path $dir "$codigo.jpg"), $codec, $ep)
        $g.Dispose(); $tela.Dispose(); $img.Dispose(); Remove-Item $tmp -Force
        $ctx.Response.StatusCode = 200
      } catch { $ctx.Response.StatusCode = 502 }
      continue
    }
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    # pasta → index.html (ex.: /admin/); "/admin" sem barra redireciona para "/admin/"
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Container)) {
      if (-not $ctx.Request.Url.AbsolutePath.EndsWith('/')) { $ctx.Response.StatusCode = 301; $ctx.Response.RedirectLocation = $ctx.Request.Url.AbsolutePath + '/'; continue }
      $file = Join-Path $file 'index.html'
    }
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $ctx.Response.Headers.Add('Cache-Control','no-store')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 } finally { $ctx.Response.Close() }
}
