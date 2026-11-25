# ==========================================================================
# LOJA - Gera as fotos que faltam usando o Codex CLI (logado no ChatGPT)
#
#   powershell -ExecutionPolicy Bypass -File tools\gerar-imagens-codex.ps1
#   powershell -ExecutionPolicy Bypass -File tools\gerar-imagens-codex.ps1 -SomenteChecar
#   ... -Lote 8 -Limite 40          (8 produtos por chamada; para apos 40 imagens)
#   ... -Modelo <nome> -Esforco low (modelo do Codex que organiza o lote; vazio = config do Codex)
#
# Tres estilos (decisao do usuario em 24/11/2026):
#   EMBALADO (vendido por unidade): a EMBALAGEM comercial do produto, com a marca e o rotulo
#            (nome + peso legiveis), mesa de madeira clara, fundo creme, luz da esquerda,
#            uma tigelinha com um pouco do conteudo ao lado. Sem marca no nome = embalagem simples, sem inventar marca.
#   GRANEL   (vendido por kg): o produto na tigela de ceramica rustica bege (padrao antigo).
#   OBJETO   (kits, utensilios, vale-compras): o proprio objeto na mesma mesa e fundo.
#   Nunca o nome da loja (config.js loja.nome) no rotulo, a nao ser que esteja no nome do produto (a loja so revende).
#
# - So gera para produto SEM imagem (foto da loja, banco ou gerada) - nunca refaz.
#   Excecao: _dev\embalagens-refazer.csv (embalados com foto errada - na tigela ou com o nome da loja no rotulo;
#   a foto antiga foi para _backup\).
# - Nunca gera duas vezes o mesmo produto: registro em _dev\codex-feitos.txt.
# - Nao duplica: descarta imagem identica (SHA-256) ou quase identica (hash visual) a qualquer foto existente.
# - Resultado: fotos\<codigo>.jpg  ->  tools\sincronizar-fotos.ps1 gera assets\produtos
#   e data\fotos-reais.js; depois grava codigo/nome/preco dentro do JPG.
# - Pode ser interrompido e rodado de novo: continua de onde parou.
# - Limite de uso do Codex (plano do ChatGPT): o gerador espera liberar e continua sozinho
#   (horario em _dev\codex-limite.txt; apagar esse arquivo faz tentar antes). -SemEsperarLimite = para em vez de esperar.
# - Produto que voltou sem imagem tenta mais uma vez no fim da fila.
# - Registro: _dev\gerar-imagens-codex.log | descartadas: _dev\codex-lote\descartadas\
# ==========================================================================
param(
  [ValidateRange(1, 20)] [int]$Lote = 8,
  [int]$Limite = 0,
  [int]$TimeoutMin = 30,
  [string]$Modelo = '',          # ex.: -Modelo gpt-6.2-sol (vazio = o do ~/.codex/config.toml)
  [ValidateSet('', 'minimal', 'low', 'medium', 'high', 'xhigh')] [string]$Esforco = '',
  [switch]$SemEsperarLimite,
  [switch]$SomenteChecar
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding $false
$staging = Join-Path $raiz '_dev\codex-lote'
$descartadas = Join-Path $staging 'descartadas'
$fotosDir = Join-Path $raiz 'fotos'
$logArq = Join-Path $raiz '_dev\gerar-imagens-codex.log'
$feitosArq = Join-Path $raiz '_dev\codex-feitos.txt'
$refazerArq = Join-Path $raiz '_dev\embalagens-refazer.csv'
$limiteArq = Join-Path $raiz '_dev\codex-limite.txt'
New-Item -ItemType Directory -Force $staging, $descartadas | Out-Null
. (Join-Path $PSScriptRoot 'metadados-sku.ps1') -SoFuncoes

function Registrar([string]$m) {
  $l = "[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] $m"; Write-Host $l
  [IO.File]::AppendAllText($logArq, $l + "`r`n", $utf8)
}

# ---------- limite de uso do Codex (plano do ChatGPT) ----------
# Le a saida do Codex; se a geracao de imagem bateu no limite, devolve quando libera (+2 min de folga). Senao, $null.
function Get-LimiteCodex([string]$arq) {
  if (-not (Test-Path -LiteralPath $arq)) { return $null }
  $t = [IO.File]::ReadAllText($arq)
  if ($t -notmatch 'usage_limit_reached') { return $null }
  $m = @([regex]::Matches($t, 'resets_at\W+(\d{9,})') | ForEach-Object { [long]$_.Groups[1].Value })
  if ($m.Count) { return [DateTimeOffset]::FromUnixTimeSeconds(($m | Measure-Object -Maximum).Maximum).LocalDateTime.AddMinutes(2) }
  $m = @([regex]::Matches($t, 'resets_in_seconds\W+(\d+)') | ForEach-Object { [double]$_.Groups[1].Value })
  if ($m.Count) { return (Get-Date).AddSeconds(($m | Measure-Object -Maximum).Maximum + 120) }
  return (Get-Date).AddHours(1)
}
# Horario salvo de uma parada anterior (ainda no futuro), ou $null
function Get-LimiteSalvo {
  if (-not (Test-Path -LiteralPath $limiteArq)) { return $null }
  $ate = [datetime]::MinValue
  $ok = [datetime]::TryParseExact(([IO.File]::ReadAllText($limiteArq)).Trim(), 'yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$ate)
  if ($ok -and $ate -gt (Get-Date)) { return $ate }
  Remove-Item -LiteralPath $limiteArq -Force -ErrorAction SilentlyContinue; return $null
}
function Wait-LimiteCodex([datetime]$ate) {
  [IO.File]::WriteAllText($limiteArq, $ate.ToString('yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture), $utf8)
  Registrar "Limite de uso do Codex atingido (plano do ChatGPT). Pausado ate $($ate.ToString('dd/MM/yyyy HH:mm')); depois continua sozinho. (Para tentar antes: apague _dev\codex-limite.txt)"
  while ((Get-Date) -lt $ate -and (Test-Path -LiteralPath $limiteArq)) {
    Start-Sleep -Seconds ([int][Math]::Max(1, [Math]::Min(300, ($ate - (Get-Date)).TotalSeconds + 1)))
  }
  Remove-Item -LiteralPath $limiteArq -Force -ErrorAction SilentlyContinue
  Registrar 'Retomando a geracao.'
}

# ---------- quem ja tem imagem (mesma regra de tools\gerar-imagens.ps1) ----------
function Get-SkusComImagem {
  $s = @{}
  foreach ($mapa in 'data\fotos.js', 'data\fotos-reais.js') {
    foreach ($m in [regex]::Matches([IO.File]::ReadAllText((Join-Path $raiz $mapa)), '"(\d+(?:-\d+)?)"\s*:')) { $s[$m.Groups[1].Value] = $true }
  }
  foreach ($p in 'fotos', 'assets\produtos', 'assets\fotos-stock', 'assets\fotos-geradas') {
    $c = Join-Path $raiz $p
    if (Test-Path $c) { Get-ChildItem -LiteralPath $c -File | ForEach-Object { if ($_.Extension -match '^\.(jpe?g|png|webp|bmp)$' -and $_.BaseName -match '^\s*(\d+(?:-\d+)?)') { $s[$Matches[1]] = $true } } }
  }
  return $s
}
# Para os embalados a refazer: so conta a foto propria (fotos\ ou assets\produtos), nao a do banco de imagens
function Test-FotoPropria([string]$sku) {
  (Test-Path -LiteralPath (Join-Path $fotosDir "$sku.jpg")) -or (Test-Path -LiteralPath (Join-Path $raiz "assets\produtos\$sku.jpg"))
}

# ---------- deteccao de duplicadas ----------
function Get-Sha([byte[]]$b) {
  $c = Read-ComentarioSku $b
  if ($c) { $n = [byte[]]::new($b.Length - $c.fim + 2); [Array]::Copy($b, 0, $n, 0, 2); [Array]::Copy($b, $c.fim, $n, 2, $b.Length - $c.fim); $b = $n }
  $sha = [Security.Cryptography.SHA256]::Create(); try { [BitConverter]::ToString($sha.ComputeHash($b)) } finally { $sha.Dispose() }
}
# hash visual 16x16 (diferenca de brilho entre vizinhos) -> 256 bits em 4 UInt64
function Get-HashVisual([string]$arq) {
  $ms = New-Object IO.MemoryStream(, [IO.File]::ReadAllBytes($arq))
  $img = [Drawing.Image]::FromStream($ms); $bmp = New-Object Drawing.Bitmap 17, 16
  $g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBilinear'; $g.DrawImage($img, 0, 0, 17, 16)
  $g.Dispose(); $img.Dispose(); $ms.Dispose()
  $h = [UInt64[]]::new(4); $i = 0
  for ($y = 0; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) {
    $a = $bmp.GetPixel($x, $y).GetBrightness(); $b = $bmp.GetPixel($x + 1, $y).GetBrightness()
    if ($a -gt $b) { $h[[int][Math]::Floor($i / 64)] = $h[[int][Math]::Floor($i / 64)] -bor ([UInt64]1 -shl ($i % 64)) }
    $i++ } }
  $bmp.Dispose(); return , $h
}
function Get-Distancia($a, $b) {
  $d = 0; for ($k = 0; $k -lt 4; $k++) { $x = $a[$k] -bxor $b[$k]; while ($x -ne 0) { $x = $x -band ($x - 1); $d++ } }; return $d
}

# ---------- estilo de cada produto ----------
$reObjeto = '(?i)coqueteleira|infusor|t[a\u00e1]bua|misturador|difusor|vale compras'
function Get-Estilo($p) {
  if ($p.unidade_medida -eq 'kg') { return 'granel' }
  if ($p.nome -match '(?i)caixinha de ch[a\u00e1]') { return 'embalado' }      # caixa de cha em saches: tem embalagem
  if ($p.categoria -eq 'kits' -or $p.nome -match $reObjeto) { return 'objeto' }
  return 'embalado'
}

# ---------- catalogo e fila ----------
$catalogo = Get-CatalogoSku
$com = Get-SkusComImagem
$feitos = @{}; if (Test-Path $feitosArq) { Get-Content $feitosArq -Encoding UTF8 | ForEach-Object { if ($_.Trim()) { $feitos[$_.Trim()] = $true } } }
$refazer = @{}; $ordemRefazer = @{}; $i = 0
if (Test-Path $refazerArq) { Import-Csv -LiteralPath $refazerArq -Delimiter ';' -Encoding UTF8 | ForEach-Object { $refazer[$_.codigo_sku] = $true; $ordemRefazer[$_.codigo_sku] = $i++ } }
$prioridade = @{}; $i = 0
Import-Csv -LiteralPath (Join-Path $raiz '_dev\gerar-imagens.csv') -Delimiter ';' -Encoding UTF8 | ForEach-Object { $prioridade[$_.codigo] = $i++ }
function Precisa($p) {
  $sku = $p.codigo_sku
  if ($feitos.ContainsKey($sku)) { return $false }
  if ($refazer.ContainsKey($sku)) { return -not (Test-FotoPropria $sku) }
  return -not $com.ContainsKey($sku)
}
$ordemEstilo = @{ embalado = 0; granel = 1; objeto = 2 }
$fila = @($catalogo.Values | Where-Object { Precisa $_ } |
  Sort-Object @{ e = { $ordemEstilo[(Get-Estilo $_)] } },
              @{ e = { if ($ordemRefazer.ContainsKey($_.codigo_sku)) { $ordemRefazer[$_.codigo_sku] } else { 1e5 } } },
              @{ e = { if ($prioridade.ContainsKey($_.codigo_sku)) { $prioridade[$_.codigo_sku] } else { 1e6 } } }, categoria, subcategoria, nome)
$porEstilo = $fila | Group-Object { Get-Estilo $_ } | ForEach-Object { "$($_.Name): $($_.Count)" }
Registrar "Produtos para gerar: $($fila.Count) (de $($catalogo.Count)) | $($porEstilo -join ' | ') | refazer (embalados que estavam na tigela): $(@($fila | Where-Object { $refazer.ContainsKey($_.codigo_sku) }).Count)"
$limiteAte = Get-LimiteSalvo
if ($SomenteChecar) { if ($limiteAte) { Registrar "Codex no limite de uso ate $($limiteAte.ToString('dd/MM/yyyy HH:mm'))." }; return }
if ($limiteAte) {
  if ($SemEsperarLimite) { Registrar "Codex ainda no limite de uso ate $($limiteAte.ToString('dd/MM/yyyy HH:mm')). Rode de novo depois."; return }
  Wait-LimiteCodex $limiteAte
}

Registrar 'Calculando assinaturas das fotos existentes (anti-duplicidade)...'
$shas = @{}; $visuais = New-Object Collections.ArrayList
foreach ($p in 'fotos', 'assets\produtos', 'assets\fotos-stock', 'assets\fotos-geradas') {
  $c = Join-Path $raiz $p
  if (-not (Test-Path $c)) { continue }
  foreach ($f in Get-ChildItem -LiteralPath $c -File | Where-Object { $_.Extension -match '^\.(jpe?g|png)$' }) {
    try { $shas[(Get-Sha ([IO.File]::ReadAllBytes($f.FullName)))] = $f.Name; if ($p -ne 'fotos') { [void]$visuais.Add(@{ n = "$p\$($f.Name)"; h = (Get-HashVisual $f.FullName) }) } } catch { }
  }
}
Registrar "Assinaturas: $($shas.Count) arquivos, $($visuais.Count) hashes visuais."

$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$enc = New-Object Drawing.Imaging.EncoderParameters 1
$enc.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]88)

$cenario = 'fotografia realista de produto para e-commerce, formato quadrado, angulo de cerca de 45 graus, sobre mesa de madeira clara, fundo creme liso e desfocado, luz natural suave vinda da esquerda, cores naturais.'
$estilos = @{
  embalado = @"
PADRAO VISUAL OBRIGATORIO (produtos EMBALADOS):
$cenario
A PROTAGONISTA E A EMBALAGEM COMERCIAL DO PRODUTO, de frente, inteira e bem enquadrada (cerca de 60 a 70% da altura da imagem).
- Use o tipo de embalagem certo para o produto: pote ou frasco de suplemento, pacote, sache, caixa, garrafa, frasco conta-gotas, lata, barra embrulhada, bisnaga etc.
- MARCA: quando o nome do produto trouxer a marca (normalmente as ultimas palavras, ex.: Vitalin, Lowcucar, Belive, Maxinutri, Urbano, Mossele, Growth),
  reproduza a embalagem dessa marca o mais fiel possivel (cores e estilo do rotulo). Se o nome NAO tiver uma marca clara, NAO invente marca:
  faca uma embalagem simples e elegante so com o nome do produto.
- NUNCA escreva o nome da loja (config.js loja.nome) na embalagem: a loja apenas revende. A unica marca no rotulo e a do fabricante
  que esta no nome do produto; sem marca no nome = rotulo sem marca. 
- O rotulo deve mostrar, LEGIVEL e com a grafia EXATA (com acentos), a marca (se houver), o nome do produto e o peso/quantidade indicados.
  Nada de texto inventado, letras sem sentido, tabela nutricional ou selos que nao foram pedidos.
- Ao lado, uma pequena tigela de ceramica rustica bege com um pouco do conteudo (capsulas, po, graos, liquido, unidades do alimento), quando fizer sentido.
- Sem maos, sem pessoas, sem outras marcas, sem marca d'agua, sem moldura.
Varie levemente a composicao entre as imagens (cada imagem deve ser unica).
"@
  granel = @"
PADRAO VISUAL OBRIGATORIO (produtos A GRANEL, igual as fotos atuais da loja):
$cenario
O produto a granel numa tigela de ceramica rustica bege com respingos marrons. Varie levemente o formato da tigela e a arrumacao entre uma imagem e outra (cada imagem deve ser unica).
REGRAS: sem texto, sem letras, sem numeros, sem logotipo, sem marca, sem rotulo, sem embalagem, sem maos, sem pessoas.
"@
  objeto = @"
PADRAO VISUAL OBRIGATORIO (kits, utensilios e presentes):
$cenario
Mostre o proprio objeto ou o kit montado (itens do kit visiveis), ao lado de uma pequena tigela de ceramica rustica bege. Cada imagem deve ser unica.
REGRAS: sem maos, sem pessoas, sem marca d'agua; textos so se forem do proprio produto e legiveis; nunca o nome da loja (config.js loja.nome), a nao ser que esteja no nome do produto.
"@
}

$geradas = 0; $vaziosSeguidos = 0; $pos = 0; $retentados = @{}
while ($pos -lt $fila.Count) {
  if ($Limite -gt 0 -and $geradas -ge $Limite) { break }
  $com = Get-SkusComImagem
  # lote so com produtos do mesmo estilo (o Codex segue melhor uma instrucao por vez)
  $posInicio = $pos
  $itens = New-Object Collections.ArrayList; $estiloLote = $null
  while ($pos -lt $fila.Count -and $itens.Count -lt $Lote) {
    $p = $fila[$pos]; $e = Get-Estilo $p
    if ($estiloLote -and $e -ne $estiloLote) { break }
    $pos++
    if (Precisa $p) { [void]$itens.Add($p); $estiloLote = $e }
  }
  if (-not $itens.Count) { continue }

  Get-ChildItem -LiteralPath $staging -File | Remove-Item -Force
  $lista = ($itens | ForEach-Object {
    "- arquivo $($_.codigo_sku).png : $($_.nome)" + $(if ($_.conteudo) { " (conteudo: $($_.conteudo))" } else { '' }) + " - categoria: $($_.categoria) / $($_.subcategoria)"
  }) -join "`n"
  $prompt = @"
Voce esta gerando fotos de produto para uma loja online brasileira de produtos naturais, que apenas REVENDE produtos de varias marcas.
Use sua ferramenta de geracao de imagens para criar UMA imagem diferente para CADA produto da lista abaixo ($($itens.Count) imagens no total).
Salve cada imagem final NESTA pasta (diretorio atual) exatamente com o nome de arquivo indicado (PNG, quadrada). Copie do local onde a ferramenta salvar.
Nao crie nem altere nenhum outro arquivo. Nao reaproveite uma imagem para dois produtos. Nao gere a mesma imagem duas vezes.

$($estilos[$estiloLote])

PRODUTOS:
$lista

Ao final responda apenas com a lista dos arquivos salvos.
"@
  Registrar "Lote [$estiloLote]: $(($itens | ForEach-Object { $_.codigo_sku }) -join ', ')"
  $promptArq = Join-Path $env:TEMP "loja-prompt-$PID.txt"
  [IO.File]::WriteAllText($promptArq, $prompt, $utf8)
  $extra = ''; if ($Modelo) { $extra += "-m $Modelo " }; if ($Esforco) { $extra += "-c model_reasoning_effort=$Esforco " }
  $saidaArq = Join-Path $env:TEMP "loja-codex-$PID.log"
  $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c codex exec $extra--skip-git-repo-check -s workspace-write -C `"$staging`" - < `"$promptArq`" > `"$saidaArq`" 2>&1" -NoNewWindow -PassThru
  if (-not $proc.WaitForExit($TimeoutMin * 60000)) { & taskkill /T /F /PID $proc.Id | Out-Null; Registrar 'Codex passou do tempo limite neste lote.' }
  $fimLimite = Get-LimiteCodex $saidaArq   # bateu no limite de uso? (entao o lote inteiro e refeito depois)

  $okLote = 0
  foreach ($p in $itens) {
    $sku = $p.codigo_sku
    $arq = Get-ChildItem -LiteralPath $staging -File | Where-Object { $_.BaseName -eq $sku -and $_.Extension -match '^\.(png|jpe?g|webp)$' } | Select-Object -First 1
    if (-not $arq) {
      if ($fimLimite) { continue }
      if ($retentados.ContainsKey($sku)) { Registrar "  sem imagem: $sku $($p.nome)" }
      else { $retentados[$sku] = $true; $fila += $p; Registrar "  sem imagem: $sku $($p.nome) (tenta de novo no fim da fila)" }
      continue
    }
    try {
      $sha = Get-Sha ([IO.File]::ReadAllBytes($arq.FullName))
      if ($shas.ContainsKey($sha)) { Registrar "  DUPLICADA (identica a $($shas[$sha])): $sku"; Move-Item $arq.FullName (Join-Path $descartadas "$sku-dup$($arq.Extension)") -Force; continue }
      $hv = Get-HashVisual $arq.FullName
      $igual = $visuais | Where-Object { (Get-Distancia $_.h $hv) -le 6 } | Select-Object -First 1
      if ($igual) { Registrar "  DUPLICADA (quase igual a $($igual.n)): $sku"; Move-Item $arq.FullName (Join-Path $descartadas "$sku-dup$($arq.Extension)") -Force; continue }
      $ms = New-Object IO.MemoryStream(, [IO.File]::ReadAllBytes($arq.FullName)); $img = [Drawing.Image]::FromStream($ms)
      if ([Math]::Abs($img.Width - $img.Height) -gt 4 -or $img.Width -lt 512) { $img.Dispose(); Registrar "  formato inesperado ($($img.Width)x$($img.Height)): $sku"; continue }
      $lado = [Math]::Min($img.Width, 1024); $bmp = New-Object Drawing.Bitmap $lado, $lado
      $g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($img, 0, 0, $lado, $lado); $g.Dispose(); $img.Dispose(); $ms.Dispose()
      $final = Join-Path $fotosDir "$sku.jpg"
      if (Test-Path -LiteralPath $final) { $bmp.Dispose(); continue }   # alguem colocou foto nesse meio tempo
      $bmp.Save("$final.tmp", $codec, $enc); $bmp.Dispose(); Move-Item "$final.tmp" $final
      [void](Set-MetadadosSku $final $p 'Imagem ilustrativa gerada por IA')
      $shas[$sha] = "$sku.jpg"; [void]$visuais.Add(@{ n = "fotos\$sku.jpg"; h = $hv })
      Remove-Item -LiteralPath $arq.FullName -Force
      [IO.File]::AppendAllText($feitosArq, "$sku`r`n", $utf8); $feitos[$sku] = $true
      $okLote++; $geradas++
    } catch { Registrar "  ERRO em ${sku}: $($_.Exception.Message)" }
  }
  Registrar "  -> $okLote/$($itens.Count) aceitas | total nesta execucao: $geradas"
  if ($okLote -gt 0) {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sincronizar-fotos.ps1') -UmaVez | Out-Null
    foreach ($p in $itens) {
      foreach ($a in (Join-Path $raiz "assets\produtos\$($p.codigo_sku).jpg"), (Join-Path $raiz "assets\produtos\mini\$($p.codigo_sku).jpg")) {
        if (Test-Path -LiteralPath $a) { [void](Set-MetadadosSku $a $p 'Imagem ilustrativa gerada por IA') }
      }
    }
    $vaziosSeguidos = 0
    # envia ao GitHub as fotos deste lote (so as fotos; nada mais do projeto entra no commit)
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'publicar-fotos.ps1') | Out-Null
  }
  if ($fimLimite) {
    if ($SemEsperarLimite) {
      [IO.File]::WriteAllText($limiteArq, $fimLimite.ToString('yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture), $utf8)
      Registrar "Limite de uso do Codex atingido (plano do ChatGPT). Libera em $($fimLimite.ToString('dd/MM/yyyy HH:mm')). Parando; rode de novo depois."; break
    }
    Wait-LimiteCodex $fimLimite
    $pos = $posInicio; $vaziosSeguidos = 0; continue   # refaz o mesmo lote (o que ja saiu esta no registro e e pulado)
  }
  if ($okLote -eq 0) {
    $vaziosSeguidos++
    if ($vaziosSeguidos -ge 3) { Registrar 'Tres lotes seguidos sem imagem. Parando; rode de novo mais tarde.'; Get-Content $saidaArq -Tail 15 | ForEach-Object { Registrar "  codex: $_" }; break }
  }
}
Registrar "Fim. Imagens geradas nesta execucao: $geradas. Ainda sem imagem: $(($com = Get-SkusComImagem) | Out-Null; @($catalogo.Values | Where-Object { Precisa $_ }).Count)"
