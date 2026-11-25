# ==========================================================================
# FASE 2 — Converte a planilha extraída do PDF (CSV) em data/produtos.js
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File tools/csv-para-produtos.ps1 -Csv catalogo.csv
#
# Colunas esperadas no CSV (separador ; ou ,  — cabeçalho obrigatório):
#   codigo_sku;nome;categoria;subcategoria;preco;unidade_medida;descricao;tags_restricao;imagem_url;conteudo
#   - categoria: slug de config.js (castanhas, graos, farinhas, temperos, suplementos,
#                chas, restricoes, desidratadas, pastas, bemestar)
#   - preco: "89,90" ou "89.90"   - unidade_medida: kg | un
#   - tags_restricao: separadas por | (ex.: sem-gluten|vegano|granel)
#   - imagem_url vazia = imagem automática por palavra-chave/categoria
# ==========================================================================
param(
  [Parameter(Mandatory = $true)][string]$Csv,
  [string]$Saida = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data\produtos.js')
)
$primeira = Get-Content $Csv -TotalCount 1 -Encoding UTF8
$sep = if ($primeira -match ';') { ';' } else { ',' }
$linhas = Import-Csv $Csv -Delimiter $sep -Encoding UTF8

$out = foreach ($l in $linhas) {
  if (-not $l.codigo_sku -or -not $l.nome) { continue }
  $preco = [double]::Parse(($l.preco -replace '[^\d,\.]', '' -replace '\.(?=\d{3}(,|$))', '' -replace ',', '.'), [Globalization.CultureInfo]::InvariantCulture)
  $obj = [ordered]@{
    codigo_sku     = $l.codigo_sku.Trim()
    nome           = $l.nome.Trim()
    categoria      = $l.categoria.Trim().ToLower()
    subcategoria   = "$($l.subcategoria)".Trim()
    descricao      = "$($l.descricao)".Trim()
    preco          = [math]::Round($preco, 2)
    unidade_medida = $(if ("$($l.unidade_medida)".Trim().ToLower() -eq 'kg') { 'kg' } else { 'un' })
    tags_restricao = @("$($l.tags_restricao)".Split('|') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    imagem_url     = "$($l.imagem_url)".Trim()
  }
  if ($l.conteudo) { $obj.conteudo = $l.conteudo.Trim() }
  [pscustomobject]$obj
}

$json = $out | ConvertTo-Json -Depth 4 -Compress
if ($out.Count -eq 1) { $json = "[$json]" }
$js = "/* Gerado por tools/csv-para-produtos.ps1 em $(Get-Date -Format 'yyyy-MM-dd HH:mm') - $($out.Count) produtos */`nwindow.LOJA_PRODUTOS = $json;`n"
[IO.File]::WriteAllText($Saida, $js, (New-Object Text.UTF8Encoding $false))
Write-Host "OK: $($out.Count) produtos gravados em $Saida"
