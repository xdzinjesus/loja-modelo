# ==========================================================================
# LOJA - Envia as fotos novas para o GitHub por PULL REQUEST (nunca direto no main)
#
#   powershell -ExecutionPolicy Bypass -File tools\publicar-fotos.ps1
#
# Chamado pelo tools\gerar-imagens-codex.ps1 ao fim de cada lote.
# Como funciona:
#  - uma copia separada do repositorio (git worktree) na pasta ao lado, "<esta pasta>-ENVIO-FOTOS-nao-mexer",
#    num branch "fotos-AAAAMMDD-HHMM" criado a partir do main do GitHub;
#  - ela recebe SO o que mudou nas fotos: fotos\ (novas, trocadas e removidas), assets\produtos\ e mini\
#    dos mesmos codigos, data\fotos-reais.js e o registro _dev\codex-feitos.txt;
#    e tambem os ajustes feitos no admin: data\destaques.js, data\produtos-ajustes.js e data\fotos-ocultas.js;
#    nada mais da pasta de trabalho entra (ex.: miniaturas recomprimidas pelo sincronizador);
#  - commit + push e abre o pull request (ou so atualiza o que ja esta aberto);
#  - PR aceito (merge): o proximo lote abre um PR novo a partir do main atualizado;
#    PR fechado SEM merge: nao envia mais nada ate alguem decidir (aviso no registro).
# Registro: _dev\gerar-imagens-codex.log
# ==========================================================================
param([string]$Destino = '')
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
$logArq = Join-Path $raiz '_dev\gerar-imagens-codex.log'
$utf8 = New-Object Text.UTF8Encoding $false
function Registrar([string]$m) { $l = "[$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')] $m"; Write-Host $l; try { [IO.File]::AppendAllText($logArq, $l + "`r`n", $utf8) } catch { } }
function Codigo([string]$nome) { if ([IO.Path]::GetFileNameWithoutExtension($nome) -match '^\s*(\d+(-\d+)?)') { return $Matches[1] }; return $null }
function Imagens([string]$dir) {
  $m = @{}
  if (Test-Path -LiteralPath $dir) { Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Extension -match '^\.(jpe?g|png|webp|bmp|gif)$' } | ForEach-Object { $m[$_.Name] = $_ } }
  return $m
}
function Igual($a, $b) {
  if ($a.Length -ne $b.Length) { return $false }
  return (Get-FileHash -LiteralPath $a.FullName -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $b.FullName -Algorithm SHA256).Hash
}
function Copiar([string]$rel) {   # copia um arquivo da pasta de trabalho para o worktree (se existir)
  $o = Join-Path $raiz $rel; $d = Join-Path $Destino $rel
  if (-not (Test-Path -LiteralPath $o)) { return $false }
  New-Item -ItemType Directory -Force (Split-Path $d -Parent) | Out-Null
  Copy-Item -LiteralPath $o -Destination $d -Force; return $true
}
function Apagar([string]$rel) { $d = Join-Path $Destino $rel; if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Force } }

if (-not $Destino) { $Destino = Join-Path (Split-Path $raiz -Parent) ((Split-Path $raiz -Leaf) + '-ENVIO-FOTOS-nao-mexer') }
if (-not (Get-Command git -ErrorAction SilentlyContinue) -or -not (Get-Command gh -ErrorAction SilentlyContinue)) { Registrar 'GitHub: git/gh nao encontrados; fotos ficam so neste computador.'; return }
git -C $raiz rev-parse --git-dir 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Registrar 'GitHub: esta pasta nao e um repositorio git; fotos ficam so neste computador.'; return }

git -C $raiz fetch -q origin main 2>$null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
# ---------- worktree das fotos ----------
if (-not (Test-Path -LiteralPath (Join-Path $Destino '.git'))) {
  git -C $raiz worktree prune 2>$null
  git -C $raiz worktree add -q -b "fotos-$stamp" $Destino origin/main 2>$null
  if ($LASTEXITCODE -ne 0) { Registrar "GitHub: nao consegui criar a copia $Destino (vai tentar no proximo lote)."; return }
}
Push-Location $Destino
try {
  for ($i = 0; $i -lt 30 -and (Test-Path (Join-Path (git rev-parse --git-dir) 'index.lock')); $i++) { Start-Sleep 2 }
  $branch = git rev-parse --abbrev-ref HEAD
  # PR deste branch ja foi aceito? -> branch novo a partir do main atualizado
  $ultimo = (@(gh pr list --head $branch --state all --json number,state --limit 1 2>$null) -join '') | ConvertFrom-Json
  if ($ultimo -and $ultimo[0].state -eq 'MERGED') {
    if (git status --porcelain) { Registrar "GitHub: a copia $Destino tem alteracoes soltas; resolva antes (nada enviado)."; return }
    git switch -q -c "fotos-$stamp" origin/main 2>$null
    if ($LASTEXITCODE -ne 0) { Registrar 'GitHub: nao consegui abrir um branch novo de fotos (vai tentar no proximo lote).'; return }
    $branch = "fotos-$stamp"
  } elseif ($ultimo -and $ultimo[0].state -eq 'CLOSED') {
    Registrar "GitHub: o PR #$($ultimo[0].number) de fotos foi fechado sem merge; nada enviado. Para voltar a enviar, apague a pasta $Destino."
    return
  }

  # ---------- espelha so as fotos ----------
  $orig = Imagens (Join-Path $raiz 'fotos'); $dest = Imagens (Join-Path $Destino 'fotos')
  $novas = 0; $trocadas = 0; $removidas = 0
  foreach ($n in $orig.Keys) {
    $existia = $dest.ContainsKey($n)
    if ($existia -and (Igual $orig[$n] $dest[$n])) { continue }
    [void](Copiar "fotos\$n")
    $c = Codigo $n
    if ($c) { [void](Copiar "assets\produtos\$c.jpg"); [void](Copiar "assets\produtos\mini\$c.jpg") }
    if ($existia) { $trocadas++ } else { $novas++ }
  }
  foreach ($n in $dest.Keys) {
    if ($orig.ContainsKey($n)) { continue }
    Apagar "fotos\$n"; $removidas++
    $c = Codigo $n
    if ($c -and -not (Test-Path -LiteralPath (Join-Path $raiz "assets\produtos\$c.jpg"))) { Apagar "assets\produtos\$c.jpg"; Apagar "assets\produtos\mini\$c.jpg" }
  }
  [void](Copiar 'data\fotos-reais.js')
  # ajustes do admin (destaques, nome/preco/descricao, fotos do banco ocultas) vao junto para o GitHub
  $admin = 'data/destaques.js', 'data/produtos-ajustes.js', 'data/fotos-ocultas.js'
  foreach ($a in $admin) { [void](Copiar ($a -replace '/', '\')) }
  [void](Copiar '_dev\codex-feitos.txt')

  git add -A -- fotos assets/produtos data/fotos-reais.js _dev/codex-feitos.txt $admin 2>$null
  $ajAdmin = @(git diff --cached --name-only -- $admin).Count
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { return }   # nada mudou
  $partes = @(); if ($novas) { $partes += "$novas nova(s)" }; if ($trocadas) { $partes += "$trocadas trocada(s)" }; if ($removidas) { $partes += "$removidas removida(s)" }
  if ($ajAdmin) { $partes += 'ajustes do admin' }
  $resumo = if ($partes) { $partes -join ', ' } else { 'mapa atualizado' }
  $msgArq = Join-Path $env:TEMP "loja-fotos-msg-$PID.txt"
  [IO.File]::WriteAllText($msgArq, "Fotos de produtos: $resumo`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`n", $utf8)
  git commit -q -F $msgArq 2>$null
  if ($LASTEXITCODE -ne 0) { Registrar 'GitHub: commit das fotos falhou (vai tentar no proximo lote).'; return }
  $ok = $false
  for ($t = 1; $t -le 3 -and -not $ok; $t++) { git push -q -u origin $branch 2>$null; $ok = $LASTEXITCODE -eq 0; if (-not $ok) { Start-Sleep 5 } }
  if (-not $ok) { Registrar 'GitHub: push falhou (sem internet?). O commit ficou salvo e sobe no proximo lote.'; return }

  $aberto = (@(gh pr list --head $branch --state open --json number,url --limit 1 2>$null) -join '') | ConvertFrom-Json
  if (-not $aberto) {
    $corpo = @"
Fotos de produtos geradas pelo Codex (``tools/gerar-imagens-codex.ps1``). **Este PR é atualizado sozinho a cada lote** (``tools/publicar-fotos.ps1``).

- **Embalados** (vendidos por unidade): a embalagem do produto com marca e rótulo (nome e peso), mesa de madeira clara, fundo creme e uma tigelinha com o conteúdo.
- **Granel** (por kg): na tigela de cerâmica, como antes. **Kits e utensílios**: o próprio objeto.
- As fotos antigas de embalados que estavam na tigela foram removidas (cópia local em ``_backup/``) e são refeitas com embalagem.
- Nenhum produto é gerado duas vezes (``_dev/codex-feitos.txt``); imagens idênticas ou quase iguais a outras são descartadas.

Pode fazer o merge a qualquer momento: o próximo lote abre um PR novo com o que vier depois.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
"@
    $corpoArq = Join-Path $env:TEMP "loja-fotos-pr-$PID.md"; [IO.File]::WriteAllText($corpoArq, $corpo, $utf8)
    $url = gh pr create --base main --head $branch --title "Fotos de produtos (Codex): embalagens com marca e rótulo" --body-file $corpoArq 2>$null
    if ($LASTEXITCODE -eq 0) { Registrar "GitHub: PR aberto ($resumo) -> $url" } else { Registrar "GitHub: fotos enviadas ao branch $branch, mas o PR nao abriu (vai tentar no proximo lote)." }
  } else {
    Registrar "GitHub: PR #$($aberto[0].number) atualizado ($resumo)."
  }
} finally { Pop-Location }
