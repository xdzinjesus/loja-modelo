[CmdletBinding()]
param(
    [ValidateRange(1, 600)] [int]$TamanhoLote = 600,
    [ValidateRange(0, 10000)] [int]$Limite = 0,
    [ValidateRange(0, 3600)] [int]$PausaSegundos = 10,
    [string]$ModeloImagem = 'gpt-image-2.5-flare',
    [string]$ModeloDescricao = 'gpt-4.1-mini',
    [switch]$SomenteChecar
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$pastaFotos = Join-Path $raiz 'assets/fotos-geradas'
$mapaFotos = Join-Path $raiz 'data/fotos.js'
$fila = Import-Csv -LiteralPath (Join-Path $raiz '_dev/gerar-imagens.csv') -Delimiter ';' -Encoding UTF8
$headers = @{ Authorization = 'Bearer ' + $env:OPENAI_API_KEY }

function Invoke-OpenAi($Recurso, $Dados) {
    $request = @{
        Method = 'Post'
        Uri = "https://api.openai.com/v1/$Recurso"
        Headers = $headers
        ContentType = 'application/json; charset=utf-8'
        Body = [Text.Encoding]::UTF8.GetBytes(($Dados | ConvertTo-Json -Depth 10 -Compress))
        TimeoutSec = 240
    }
    for ($tentativa = 0; $tentativa -lt 5; $tentativa++) {
        try {
            return Invoke-RestMethod @request
        } catch {
            $status = [int]$_.Exception.Response.StatusCode
            $codigo = ''
            if ($_.ErrorDetails.Message) {
                try { $codigo = (ConvertFrom-Json $_.ErrorDetails.Message).error.code } catch {}
            }
            if ($codigo -eq 'insufficient_quota' -or ($status -notin 0, 408, 429 -and $status -lt 500) -or $tentativa -eq 4) {
                throw "Falha na API durante $Recurso (HTTP $status, $codigo)."
            }
            Start-Sleep -Seconds ([Math]::Pow(2, $tentativa + 1))
        }
    }
}

function Get-DescricaoVisual($Linha) {
    if ($Linha.descricao_visual -notlike 'A CONFERIR*') { return $Linha.descricao_visual }
    $resposta = Invoke-OpenAi 'responses' @{
        model = $ModeloDescricao
        store = $false
        instructions = 'Descreva em português brasileiro só a aparência física do ingrediente a granel, usando cor e forma. Para ervas brasileiras, descreva a parte vendida seca. Preserve cada variante. Responda com uma frase curta. Se o SKU for de marca, embalado, de composição desconhecida, tiver variantes visualmente distintas sem definição, ou se a identidade, a parte ou a aparência não puderem ser determinadas com confiança, responda somente INDETERMINADO. Não invente.'
        input = $Linha.descricao_visual
    }
    $texto = @($resposta.output | Where-Object type -eq 'message' |
        ForEach-Object { $_.content } | Where-Object type -eq 'output_text' |
        ForEach-Object { $_.text }) -join ' '
    if ($resposta.status -ne 'completed' -or [string]::IsNullOrWhiteSpace($texto)) {
        throw "A API nao retornou descricao para $($Linha.codigo)."
    }
    return $texto.Trim()
}

function Get-SkusComImagem {
    $skus = @{}
    foreach ($mapa in $mapaFotos, (Join-Path $raiz 'data/fotos-reais.js')) {
        foreach ($item in [regex]::Matches([IO.File]::ReadAllText($mapa), '"(\d+(?:-\d+)?)"\s*:')) {
            $skus[$item.Groups[1].Value] = $true
        }
    }
    foreach ($pasta in 'fotos', 'assets/produtos', 'assets/fotos-stock', 'assets/fotos-geradas') {
        $caminho = Join-Path $raiz $pasta
        if (Test-Path -LiteralPath $caminho) {
            Get-ChildItem -LiteralPath $caminho -File | ForEach-Object {
                if ($_.Extension -match '^\.(jpe?g|png|webp|bmp)$' -and $_.BaseName -match '^\s*(\d+(?:-\d+)?)') {
                    $skus[$Matches[1]] = $true
                }
            }
        }
    }
    return $skus
}

function Get-FotoHash([byte[]]$Bytes) {
    # Remove the SKU comment inserted after the JPEG signature before comparing.
    if ($Bytes.Length -gt 6 -and $Bytes[2] -eq 255 -and $Bytes[3] -eq 254) {
        $fim = 4 + 256 * [int]$Bytes[4] + [int]$Bytes[5]
        if ($fim -ge 6 -and $fim -lt $Bytes.Length) {
            $comentario = [Text.Encoding]::UTF8.GetString($Bytes, 6, $fim - 6)
            if ($comentario -match '^\{"codigo_sku":') {
                $semComentario = [byte[]]::new($Bytes.Length - $fim + 2)
                [Array]::Copy($Bytes, 0, $semComentario, 0, 2)
                [Array]::Copy($Bytes, $fim, $semComentario, 2, $Bytes.Length - $fim)
                $Bytes = $semComentario
            }
        }
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($Bytes)) }
    finally { $sha.Dispose() }
}

$produtos = @{}
Get-Content -LiteralPath (Join-Path $raiz 'data/produtos.js') -Encoding UTF8 | Where-Object { $_ -match '"codigo_sku"\s*:' } | ForEach-Object {
    $produto = $_.Trim().TrimEnd(',') | ConvertFrom-Json
    if ($produtos.ContainsKey($produto.codigo_sku)) { throw "SKU duplicado no catalogo: $($produto.codigo_sku)" }
    $produtos[$produto.codigo_sku] = $produto
}
$existentes = Get-SkusComImagem
$pendentes = @($fila | Where-Object { $produtos.ContainsKey($_.codigo) -and -not $existentes.ContainsKey($_.codigo) })
$totalSemFoto = @($produtos.Keys | Where-Object { -not $existentes.ContainsKey($_) }).Count
Write-Host "Produtos sem imagem: $totalSemFoto. Na fila de geracao: $($pendentes.Count)."
if ($SomenteChecar) { return }
if (-not $env:OPENAI_API_KEY) { throw 'Defina OPENAI_API_KEY no ambiente do PowerShell.' }
New-Item -ItemType Directory -Force $pastaFotos | Out-Null
$hashes = @{}
foreach ($pasta in 'fotos', 'assets/produtos', 'assets/fotos-stock', 'assets/fotos-geradas') {
    $caminho = Join-Path $raiz $pasta
    if (Test-Path -LiteralPath $caminho) {
        Get-ChildItem -LiteralPath $caminho -File | Where-Object { $_.Extension -match '^\.jpe?g$' } | ForEach-Object {
            $hashes[(Get-FotoHash ([IO.File]::ReadAllBytes($_.FullName)))] = $true
        }
    }
}

$geradas = 0
$noLote = 0
$indeterminados = New-Object 'System.Collections.Generic.List[string]'
try {
    foreach ($linha in $pendentes) {
        if ($Limite -gt 0 -and $geradas -ge $Limite) { break }
        if ($linha.codigo -notmatch '^\d+(?:-\d+)?$') { throw 'SKU invalido no CSV.' }
        if ($existentes.ContainsKey($linha.codigo)) { continue }
        $produto = $produtos[$linha.codigo]
        if ($produto.nome -cne $linha.nome) {
            Write-Warning "SKU $($linha.codigo) tem nome diferente no catalogo."
            continue
        }

        $visual = Get-DescricaoVisual $linha
        if ($visual -match '^INDETERMINADO\b') {
            $indeterminados.Add("$($linha.codigo) — $($linha.nome)")
            Write-Warning "SKU $($linha.codigo) precisa de referencia visual da loja."
            continue
        }
        $prompt = "Fotografia de produto estilo e-commerce, ângulo de 45°, $visual a granel numa tigela de cerâmica rústica bege sobre mesa de madeira clara, luz natural suave vinda da esquerda, fundo creme liso e desfocado, cores naturais e realistas, sem texto, sem logotipo, sem embalagem, sem mãos, formato quadrado."
        $imagem = Invoke-OpenAi 'images/generations' @{
            model = $ModeloImagem
            size = '1024x1024'
            output_format = 'jpeg'
            n = 1
            prompt = $prompt
        }
        $bytes = [Convert]::FromBase64String($imagem.data[0].b64_json)
        $hash = Get-FotoHash $bytes
        if ($hashes.ContainsKey($hash)) {
            Write-Warning "Imagem identica descartada para o SKU $($linha.codigo)."
            continue
        }
        $buffer = New-Object IO.MemoryStream (,$bytes)
        try {
            $foto = [Drawing.Image]::FromStream($buffer, $false, $true)
            try {
                if ($foto.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Jpeg.Guid -or $foto.Width -ne 1024 -or $foto.Height -ne 1024) {
                    throw "Imagem inesperada para $($linha.codigo)."
                }
            } finally { $foto.Dispose() }
        } finally { $buffer.Dispose() }

        $destino = Join-Path $pastaFotos ($linha.codigo + '.jpg')
        $existentes = Get-SkusComImagem
        if ($existentes.ContainsKey($linha.codigo)) { continue }
        $dados = [ordered]@{
            codigo_sku = $produto.codigo_sku
            nome = $produto.nome
            categoria = $produto.categoria
            subcategoria = $produto.subcategoria
            conteudo = $produto.conteudo
            unidade_medida = $produto.unidade_medida
            origem = 'Imagem ilustrativa gerada por IA'
        }
        $comentario = [Text.Encoding]::UTF8.GetBytes(($dados | ConvertTo-Json -Compress))
        $tamanho = $comentario.Length + 2
        if ($tamanho -gt 65535) { throw "Metadados grandes demais para o SKU $($linha.codigo)." }
        $cabecalho = [byte[]]@(255, 216, 255, 254, ($tamanho -shr 8), ($tamanho -band 255))
        $temporario = "$destino.$([Guid]::NewGuid()).tmp"
        try {
            $arquivo = [IO.File]::Create($temporario)
            try {
                $arquivo.Write($cabecalho, 0, $cabecalho.Length)
                $arquivo.Write($comentario, 0, $comentario.Length)
                $arquivo.Write($bytes, 2, $bytes.Length - 2)
            } finally { $arquivo.Dispose() }
            [IO.File]::Move($temporario, $destino)
        } finally {
            if ([IO.File]::Exists($temporario)) { [IO.File]::Delete($temporario) }
        }
        $entrada = @{}
        $entrada[$produto.codigo_sku] = @{ url = "assets/fotos-geradas/$($produto.codigo_sku).jpg"; origem = $dados.origem }
        $json = $entrada | ConvertTo-Json -Compress
        [IO.File]::AppendAllText($mapaFotos, [Environment]::NewLine + "Object.assign(window.LOJA_FOTOS, $json);" + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
        [IO.File]::Copy($destino, (Join-Path $raiz "fotos/$($produto.codigo_sku).jpg"), $false)
        $hashes[$hash] = $true
        $existentes[$linha.codigo] = $true
        $geradas++
        $noLote++
        Write-Host "Gerada: $($linha.codigo) $($linha.nome)"
        if ($noLote -ge $TamanhoLote) {
            $noLote = 0
            Start-Sleep -Seconds $PausaSegundos
        }
    }
} finally {
    if ($indeterminados.Count) {
        Write-Host ("SKUs sem descrição visual confiável nesta execução:" + [Environment]::NewLine + ($indeterminados -join [Environment]::NewLine))
    }
    Write-Host "Imagens geradas nesta execução: $geradas"
}
