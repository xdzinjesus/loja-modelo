# ==========================================================================
# LOJA - Grava os dados do produto DENTRO de cada foto (comentario JPEG)
#
# Cada foto de produto passa a levar: codigo_sku (codigo interno), nome, preco,
# unidade, conteudo, categoria e subcategoria. O preco vem de data/produtos.js
# com os ajustes do admin (data/produtos-ajustes.js) por cima.
#
#   Rodar em todas as fotos:  powershell -ExecutionPolicy Bypass -File tools\metadados-sku.ps1
#   Usado tambem por tools\sincronizar-fotos.ps1 (fotos novas) via dot-source.
#
# So regrava o arquivo quando os dados mudaram (ex.: preco alterado).
# Formato igual ao de tools\gerar-imagens.ps1: segmento COM logo apos o SOI,
# texto JSON comecando com {"codigo_sku": (o calculo de hash ignora esse trecho).
# ==========================================================================
param([switch]$SoFuncoes)

$script:raizSku = Split-Path -Parent $PSScriptRoot

function Get-CatalogoSku {
  $mapa = @{}
  $utf8 = New-Object Text.UTF8Encoding $false
  foreach ($linha in [IO.File]::ReadAllLines((Join-Path $script:raizSku 'data\produtos.js'), $utf8)) {
    if ($linha -notmatch '"codigo_sku"\s*:') { continue }
    $p = $linha.Trim().TrimEnd(',') | ConvertFrom-Json
    $mapa[$p.codigo_sku] = $p
  }
  $ajArq = Join-Path $script:raizSku 'data\produtos-ajustes.js'
  if (Test-Path -LiteralPath $ajArq) {
    $txt = [IO.File]::ReadAllText($ajArq, $utf8)
    if ($txt -match '(?s)LOJA_AJUSTES\s*=\s*(\{.*\})\s*;') {
      $aj = $Matches[1] | ConvertFrom-Json
      foreach ($prop in $aj.PSObject.Properties) {
        if (-not $mapa.ContainsKey($prop.Name)) { continue }
        foreach ($campo in $prop.Value.PSObject.Properties) {
          $mapa[$prop.Name] | Add-Member -NotePropertyName $campo.Name -NotePropertyValue $campo.Value -Force
        }
      }
    }
  }
  return $mapa
}

function Get-MetadadosSku($p, [string]$origem) {
  $d = [ordered]@{
    codigo_sku     = [string]$p.codigo_sku
    nome           = $p.nome
    preco          = $p.preco
    unidade_medida = $p.unidade_medida
    conteudo       = $p.conteudo
    categoria      = $p.categoria
    subcategoria   = $p.subcategoria
    loja           = 'Sua Loja'
  }
  if ($origem) { $d.origem = $origem }
  return ($d | ConvertTo-Json -Compress)
}

# Le o comentario {"codigo_sku":...} atual (ou $null) e o tamanho do segmento
function Read-ComentarioSku([byte[]]$b) {
  if ($b.Length -gt 6 -and $b[0] -eq 255 -and $b[1] -eq 216 -and $b[2] -eq 255 -and $b[3] -eq 254) {
    $fim = 4 + 256 * [int]$b[4] + [int]$b[5]
    if ($fim -lt $b.Length) {
      $txt = [Text.Encoding]::UTF8.GetString($b, 6, $fim - 6)
      if ($txt.StartsWith('{"codigo_sku":')) { return @{ texto = $txt; fim = $fim } }
    }
  }
  return $null
}

# Grava (ou atualiza) os metadados no JPG. Retorna $true se o arquivo mudou.
function Set-MetadadosSku([string]$caminho, $produto, [string]$origem) {
  $b = [IO.File]::ReadAllBytes($caminho)
  if ($b.Length -lt 4 -or $b[0] -ne 255 -or $b[1] -ne 216) { return $false }   # nao e JPEG
  $atual = Read-ComentarioSku $b
  if (-not $origem -and $atual) {
    try { $o = ($atual.texto | ConvertFrom-Json).origem; if ($o) { $origem = $o } } catch { }
  }
  $novo = Get-MetadadosSku $produto $origem
  if ($atual -and $atual.texto -eq $novo) { return $false }
  $inicioResto = if ($atual) { $atual.fim } else { 2 }
  $com = [Text.Encoding]::UTF8.GetBytes($novo)
  $tam = $com.Length + 2
  if ($tam -gt 65535) { return $false }
  $saida = New-Object IO.MemoryStream
  $saida.Write([byte[]]@(255, 216, 255, 254, ($tam -shr 8), ($tam -band 255)), 0, 6)
  $saida.Write($com, 0, $com.Length)
  $saida.Write($b, $inicioResto, $b.Length - $inicioResto)
  $tmp = "$caminho.$PID.meta.tmp"
  [IO.File]::WriteAllBytes($tmp, $saida.ToArray()); $saida.Dispose()
  Move-Item -LiteralPath $tmp -Destination $caminho -Force
  return $true
}

if ($SoFuncoes) { return }

# ---- Execucao direta: carimba todas as fotos de produto do site ----
$catalogo = Get-CatalogoSku
$pastas = @(
  @{ dir = 'assets\produtos';       origem = $null },
  @{ dir = 'assets\produtos\mini';  origem = $null },
  @{ dir = 'assets\fotos-stock';    origem = 'Banco de imagens (Pixabay/Unsplash)' },
  @{ dir = 'assets\fotos-geradas';  origem = 'Imagem ilustrativa gerada por IA' }
)
$total = 0; $mudou = 0; $semProduto = 0
foreach ($pa in $pastas) {
  $dir = Join-Path $script:raizSku $pa.dir
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  foreach ($f in Get-ChildItem -LiteralPath $dir -Filter *.jpg -File) {
    $total++
    if (-not $catalogo.ContainsKey($f.BaseName)) { $semProduto++; continue }
    if (Set-MetadadosSku $f.FullName $catalogo[$f.BaseName] $pa.origem) { $mudou++ }
  }
}
Write-Host "Fotos conferidas: $total | atualizadas com codigo/preco: $mudou | sem produto no catalogo: $semProduto"
