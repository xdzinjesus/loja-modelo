# ==========================================================================
# LOJA - Gera sitemap.xml (e a linha "Sitemap:" do robots.txt)
#
#   powershell -ExecutionPolicy Bypass -File tools\gerar-sitemap.ps1
#   powershell -ExecutionPolicy Bypass -File tools\gerar-sitemap.ps1 -Dominio https://www.sualoja.com.br
#
# - Sem -Dominio, usa loja.dominio de assets/js/config.js.
# - Sem dominio definido, grava o modelo com https://www.SEU-DOMINIO.com.br  [TROCAR antes de publicar].
# - Paginas publicas: a loja (index) e Privacidade e Termos. Os produtos abrem dentro da loja (?p=codigo),
#   entao nao entram como paginas separadas (ver "Pagina propria por produto" em docs/MELHORIAS-2026-11-24.md).
# ==========================================================================
param([string]$Dominio = '')
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding $false

if (-not $Dominio) {
  $m = [regex]::Match([IO.File]::ReadAllText((Join-Path $raiz 'assets\js\config.js')), "dominio:\s*'([^']*)'")
  if ($m.Success) { $Dominio = $m.Groups[1].Value }
}
$modelo = -not $Dominio
if ($modelo) { $Dominio = 'https://www.SEU-DOMINIO.com.br' }
$Dominio = $Dominio.TrimEnd('/')
if ($Dominio -notmatch '^https?://[^/\s]+$') { throw "Dominio invalido: '$Dominio' (use algo como https://www.sualoja.com.br)" }

# paginas publicas: endereco publicado + arquivo de onde vem a data de alteracao
$paginas = @(
  @{ url = "$Dominio/"; arq = 'index.html'; freq = 'weekly'; prio = '1.0' },
  @{ url = "$Dominio/privacidade.html"; arq = 'privacidade.html'; freq = 'yearly'; prio = '0.3' }
)
$linhas = foreach ($p in $paginas) {
  $data = (Get-Item -LiteralPath (Join-Path $raiz $p.arq)).LastWriteTime.ToString('yyyy-MM-dd')
  "  <url><loc>$($p.url)</loc><lastmod>$data</lastmod><changefreq>$($p.freq)</changefreq><priority>$($p.prio)</priority></url>"
}
$aviso = if ($modelo) { "`n<!-- [TROCAR] modelo sem dominio: defina loja.dominio em assets/js/config.js e rode tools/gerar-sitemap.ps1 de novo -->" } else { '' }
$xml = "<?xml version=`"1.0`" encoding=`"UTF-8`"?>$aviso`n<urlset xmlns=`"http://www.sitemaps.org/schemas/sitemap/0.9`">`n$($linhas -join "`n")`n</urlset>`n"
[IO.File]::WriteAllText((Join-Path $raiz 'sitemap.xml'), $xml, $utf8)

# robots.txt: troca (ou acrescenta) a linha do sitemap
$robots = Join-Path $raiz 'robots.txt'
$txt = [IO.File]::ReadAllText($robots, [Text.Encoding]::UTF8) -replace '(?m)^#?\s*Sitemap:.*\r?\n?', ''
$linha = if ($modelo) { "# Sitemap: $Dominio/sitemap.xml   [TROCAR: rode tools/gerar-sitemap.ps1 com o dominio]" } else { "Sitemap: $Dominio/sitemap.xml" }
[IO.File]::WriteAllText($robots, $txt.TrimEnd() + "`n`n" + $linha + "`n", $utf8)

Write-Host "sitemap.xml gerado com $($paginas.Count) paginas em $Dominio$(if ($modelo) { '  (MODELO - falta o dominio)' })"
