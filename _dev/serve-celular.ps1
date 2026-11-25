# ==========================================================================
# LOJA - Ver o site pelo CELULAR (servidor SO DE LEITURA)
#
#   powershell -ExecutionPolicy Bypass -File _dev\serve-celular.ps1 [-Port 5520]
#
# - Escuta na rede (Wi-Fi/cabo de casa e Tailscale), sem precisar de administrador.
# - So entrega os arquivos do site (GET/HEAD): index.html, privacidade.html, assets/, data/...
#   Nada de admin, nada de gravar (o servidor normal _dev\serve.ps1 continua so no PC, com o admin).
# - No celular: mesma rede Wi-Fi -> http://<IP do PC>:5520  |  com o app Tailscale -> http://<IP Tailscale>:5520
#   Na 1a vez o Windows pode perguntar se libera o "Windows PowerShell" na rede: responda Permitir (rede privada).
# ==========================================================================
param([int]$Port = 5520)
$ErrorActionPreference = 'Stop'
$root = (Split-Path -Parent $PSScriptRoot)

$enderecos = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.)' } | Select-Object -ExpandProperty IPAddress)
Write-Host "Loja no celular (so leitura). Abra no celular:"
$enderecos | ForEach-Object { Write-Host ("  http://{0}:{1}{2}" -f $_, $Port, $(if ($_ -like '100.*') { '   (Tailscale - funciona fora de casa)' } else { '   (mesmo Wi-Fi)' })) }

# Cada conexao e atendida num "runspace" separado: o navegador do celular abre varias conexoes ao mesmo tempo.
$atender = {
  param($cliente, $root)
  $tipos = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'
    '.gif' = 'image/gif'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.txt' = 'text/plain; charset=utf-8'; '.xml' = 'application/xml' }
  # so o que o site publicado usa
  $liberado = '^(index\.html|privacidade\.html|manifest\.webmanifest|robots\.txt|sitemap\.xml|favicon\.ico|(assets|data)/[^?#]+)$'
  try {
    $cliente.ReceiveTimeout = 15000; $cliente.SendTimeout = 30000
    $s = $cliente.GetStream()
    $r = New-Object IO.StreamReader($s, [Text.Encoding]::ASCII, $false, 4096, $true)
    $linha = $r.ReadLine(); if (-not $linha) { return }
    while (($h = $r.ReadLine())) { }   # ignora os cabecalhos
    $partes = $linha.Split(' ')
    $metodo = $partes[0]; $alvo = if ($partes.Count -gt 1) { $partes[1] } else { '/' }
    $caminho = [Uri]::UnescapeDataString(($alvo -split '[?#]')[0]).TrimStart('/')
    if ($caminho -eq '') { $caminho = 'index.html' }
    $status = '200 OK'; $corpo = $null; $tipo = 'text/plain; charset=utf-8'
    if ($metodo -notin 'GET', 'HEAD') { $status = '405 Method Not Allowed'; $corpo = [Text.Encoding]::UTF8.GetBytes('So leitura.') }
    elseif ($caminho -match '\.\.|\\|:' -or $caminho -notmatch $liberado) { $status = '404 Not Found'; $corpo = [Text.Encoding]::UTF8.GetBytes('Nao encontrado.') }
    else {
      $arq = Join-Path $root ($caminho -replace '/', '\')
      if (Test-Path -LiteralPath $arq -PathType Leaf) {
        $corpo = [IO.File]::ReadAllBytes($arq)
        $ext = [IO.Path]::GetExtension($arq).ToLower(); if ($tipos.ContainsKey($ext)) { $tipo = $tipos[$ext] } else { $tipo = 'application/octet-stream' }
      } else { $status = '404 Not Found'; $corpo = [Text.Encoding]::UTF8.GetBytes('Nao encontrado.') }
    }
    $cab = "HTTP/1.1 $status`r`nContent-Type: $tipo`r`nContent-Length: $($corpo.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $b = [Text.Encoding]::ASCII.GetBytes($cab); $s.Write($b, 0, $b.Length)
    if ($metodo -ne 'HEAD') { $s.Write($corpo, 0, $corpo.Length) }
    $s.Flush()
  } catch { } finally { $cliente.Close() }
}

$pool = [RunspaceFactory]::CreateRunspacePool(1, 12); $pool.Open()
$ouvinte = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Any, $Port)
$ouvinte.Start()
Write-Host "Servidor do celular rodando na porta $Port (Ctrl+C para parar)."
$tarefas = New-Object Collections.ArrayList
try {
  while ($true) {
    $c = $ouvinte.AcceptTcpClient()
    $ps = [PowerShell]::Create(); $ps.RunspacePool = $pool
    [void]$ps.AddScript($atender).AddArgument($c).AddArgument($root)
    [void]$tarefas.Add(@{ ps = $ps; h = $ps.BeginInvoke() })
    # limpa as que ja terminaram
    for ($i = $tarefas.Count - 1; $i -ge 0; $i--) { if ($tarefas[$i].h.IsCompleted) { $tarefas[$i].ps.EndInvoke($tarefas[$i].h); $tarefas[$i].ps.Dispose(); $tarefas.RemoveAt($i) } }
  }
} finally { $ouvinte.Stop(); $pool.Close() }
