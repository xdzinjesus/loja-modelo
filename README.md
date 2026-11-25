# Loja modelo — E-commerce / Catálogo digital

> **Modelo neutro.** Para montar o site de uma empresa nova, siga o passo a passo em `CLAUDE.md` (seção "Para começar uma empresa nova"). As seções abaixo vieram do projeto original e citam exemplos dele.

Protótipo de alta fidelidade (Fase 1) da loja **Sua Loja (Loja Atacado de Castanhas)** — Concórdia/SC.
HTML + CSS + JavaScript puro, sem build. GSAP e fontes via CDN.

## Como abrir

- **Mais simples:** dê dois cliques em `index.html` (funciona via `file://`, precisa de internet para fotos, fontes e GSAP).
- **Servidor local (recomendado para apresentar):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File _dev/serve.ps1 -Port 5510
  ```
  e acesse http://localhost:5510
- `?noanim` no fim da URL desliga as animações (útil para prints).

## Estrutura

```
index.html              estrutura das seções + sprite de ícones
assets/css/styles.css   design system (tokens de cor/tipografia, componentes, responsivo)
assets/js/config.js     dados da loja: contato, horários, categorias, objetivos, avaliações,
                        banco de imagens automáticas por palavra-chave
data/produtos.js        CATÁLOGO (Fase 1: 33 itens demonstrativos)
assets/js/catalog.js    motor sem UI: índice de busca, filtros, ordenação, preço por peso
assets/js/app.js        interface: vitrine, busca, carrinho, favoritos, quick view,
                        checkout simulado, WhatsApp, animações
tools/csv-para-produtos.ps1   conversor CSV → data/produtos.js (Fase 2)
assets/css/fonts.css    fontes locais (Alfa Slab One, Fraunces, Manrope) → assets/fonts/*.woff2
assets/vendor/          GSAP 3.12.5 + ScrollTrigger locais (sem CDN)
assets/img/hero-*.jpg   fotos do topo da página
assets/fotos-unsplash/  cópia local de fotos do Unsplash; lista em data/fotos-unsplash.js
_backup/                index.html único original (550 MB, offline) + ZIP do projeto-fonte
```

## Documentos do projeto

- `docs/REVISAO-ENTREGA.md` — **checklist da revisão antes de entregar ao cliente** (pendências, o que não publicar, testes)
- `docs/API-CONTAS.md` — contrato do backend de contas e fotos
- `docs/BANCO-DE-DADOS.md` — como funciona o banco de dados (hoje e em produção)
- `docs/GUIA-ADMIN.md` — guia da área administrativa
- `CLAUDE.md` — instruções para o Claude ao trabalhar nesta pasta
- `tools/preparar-logo.ps1` — prepara uma nova logo do cliente (recorta e deixa o fundo transparente)

## Contas de clientes

Login/cadastro, **Meus pedidos** (status com linha do tempo, repetir pedido, cancelar enquanto "Recebido")
e **conta atacado** (CNPJ validado, aprovação pela loja).

```
assets/js/conta-api.js   camada de dados (modo 'local' ou 'api') — window.LojaContas
assets/js/conta.js       interface do modal "Minha conta" + integração com o checkout
assets/css/conta.css     estilos da área do cliente
admin/                   área administrativa do dono da loja (ver abaixo)
docs/API-CONTAS.md       contrato REST para o backend (Cloudflare Workers / Vercel)
_dev/teste-contas.html   testes automáticos do site (contas, checkout)
_dev/teste-admin.html    testes automáticos da área administrativa
```

### Área administrativa — `http://localhost:5510/admin/`

- **Visão geral**: faturamento/pedidos/ticket de 30 dias, % do atacado, gráfico de 14 dias (varejo × atacado),
  produtos e clientes que mais compram, e lista do que precisa de atenção.
- **Pedidos**: filtros (status, varejo/atacado, período, busca), mudar status com recado ao cliente, exportar planilha.
- **Clientes**: lista com último acesso e situação; **ficha** com dados editáveis, observação interna (o cliente não vê),
  pedidos, atividade, senha temporária, **bloquear/desbloquear** e **excluir conta (LGPD)**.
- **Atacado**: aprovar/recusar solicitações, empresas ativas com faturamento, **desconto individual por empresa**, revogar.
- **Acessos**: registro de logins, senhas erradas (alerta com 3+ em 24 h), cadastros e todas as ações da loja.
- `tools/painel-loja.html` agora redireciona para `/admin/`.

- Hoje está em `config.js → contas.modo = 'local'`: tudo funciona, mas os dados ficam **no navegador**.
  Para produção, implemente `docs/API-CONTAS.md` e troque para `modo: 'api'` + `apiUrl`.
- Painel da loja (modo local): `http://localhost:5510/tools/painel-loja.html`, PIN em `contas.painelPin` (**trocar**).
- Links diretos: `/?conta`, `/?conta=pedidos`, `/?conta=atacado`, `/?conta=dados`, `/?conta=cadastro`.
- Desconto automático para atacado aprovado: `contas.atacado.descontoPercentual` (0 = desligado).

## Sincronização automática das fotos

`INICIAR-SITE.bat` (dois cliques) sobe o servidor local **e** o sincronizador `tools/sincronizar-fotos.ps1`,
que vigia a pasta `fotos/`: cada foto nova/alterada vira `assets/produtos/<código>.jpg` (900 px, fundo branco)
e entra em `data/fotos-reais.js` em segundos — basta recarregar o site. Foto apagada de `fotos/` sai do site.
O nome precisa **começar com o código** do produto (`1830.jpg`, `1830 - castanha.png`). Registro em `_dev/sincronizar-fotos.log`.
Rodar uma vez só: `powershell -ExecutionPolicy Bypass -File tools\sincronizar-fotos.ps1 -UmaVez`.

Fotos de produto são nomeadas pelo **código (SKU)**: `assets/produtos/<código>.jpg` (fotos reais)
e `assets/fotos-stock/<código>.jpg` (banco de imagens). O vínculo código → foto fica em
`data/fotos-reais.js` e `data/fotos.js`.

## Catálogo real (importado do PDF "Produtos-Resumidos outubro 2026")

`data/produtos.js` hoje tem **2.413 produtos** reais (de 2.455 linhas do PDF; 42 itens internos
como entrega, sacolas e "KIT 100" ficam ocultos). Preços e unidades (KG/UN) vêm do PDF.

### Atualizar quando sair uma tabela nova
1. Rode o servidor local e abra `http://localhost:5510/tools/importar-catalogo.html`
2. Arraste o novo PDF → confira a distribuição por departamento e a tabela de revisão
3. Clique em **Salvar no projeto** (ou **Baixar produtos.js** e substitua em `data/`)

O importador (`tools/classificador.js`) faz, para cada linha `CÓDIGO NOME R$: 0,00 UN|KG`:
- nome legível com acentos ("ACUCAR DE COCO" → "Açúcar de Coco");
- departamento + subcategoria por regras de palavras-chave (ordem importa);
- selos (granel, sem glúten, sem lactose, zero açúcar, vegano, light) e objetivos;
- foto por tipo de produto, a partir de um banco de imagens conferido;
- variações de peso para granel (100g–1kg, ou 50g–500g para chás, temperos e itens caros).

Para corrigir um item específico sem mexer nas regras, crie `window.LOJA_OVERRIDES`
(ex.: `{ "4249": { categoria: "suplementos", subcategoria: "Pré-treino & Energia", imagem_url: "<id unsplash>" } }`).

Alternativa sem navegador: `tools/csv-para-produtos.ps1 -Csv planilha.csv`.

O que já está preparado para escala:
- **Imagens automáticas:** produto sem `imagem_url` recebe foto por palavra-chave do nome
  (`config.js → imagensPorPalavra`) e, sem match, a foto da categoria.
- **Busca instantânea** sobre índice pré-normalizado (sem acentos), pesquisando nome, código,
  subcategoria, categoria, benefícios e descrição; ranqueia nome/código acima de descrição.
- **Render paginado** (12 por vez) com scroll infinito + botão "carregar mais";
  cards com `content-visibility` e imagens `lazy`.
- **Preço por peso** calculado do preço/kg (`unidade_medida: "kg"`), variações configuráveis por item.

## Gerar as imagens que faltam (Codex) e dados do produto dentro da foto

- `tools/gerar-imagens-codex.ps1` gera, pelo Codex CLI, uma imagem ilustrativa para cada produto **sem nenhuma imagem**
  (não refaz quem já tem), no mesmo padrão das fotos atuais, e descarta duplicadas (idênticas ou quase iguais).
  Salva em `fotos/<código>.jpg` e o sincronizador põe no site. Pode parar e rodar de novo: continua de onde parou.
  `-SomenteChecar` mostra quantos faltam. Registro: `_dev/gerar-imagens-codex.log`.
- `tools/metadados-sku.ps1` grava **código (SKU), nome, preço, unidade, conteúdo e categoria** dentro de cada JPG
  (comentário JPEG). O sincronizador já faz isso para fotos novas; rode o script de novo após mudar preços.

## Fotos dos produtos (sem repetição)

Prioridade no site: **foto real da loja → foto única do banco (Pixabay/Unsplash) → arte de embalagem**.
Nenhuma foto se repete entre produtos. Situação atual: 752 produtos naturais/a granel com foto única
revisada visualmente; 1.661 (marcas, suplementos, embalados) com arte de embalagem até chegarem as fotos reais.

- **Fotos reais**: coloque em `fotos/` com o código no início do nome (`1830.jpg`, `1830 - castanha.jpg`)
  e rode `powershell -ExecutionPolicy Bypass -File tools\processar-fotos-reais.ps1`.
  Gera `assets/produtos/<código>.jpg` (900 px, fundo branco) e `data/fotos-reais.js`.
- **Pixabay** (uma foto diferente por produto): salve sua chave da API em `_dev/pixabay.key`,
  abra `http://localhost:5510/tools/buscar-fotos.html` e clique em **Buscar fotos**.
  Só aceita fotos cujas tags citam o produto; cada foto é baixada e otimizada para
  `assets/fotos-stock/<código>.jpg` (exigência da licença Pixabay: hospedar no próprio site).
  Progresso salvo em `data/fotos.js`. Limite: 100 consultas/min (a ferramenta respeita sozinha).

## Pendências com o cliente

- Logotipo em vetor (SVG/PDF) — o atual é uma recriação fiel em SVG a partir da imagem do Instagram.
- Fotos: cada produto recebe uma foto do **tipo** de produto (ex.: todas as creatinas usam a mesma foto
  de creatina). Fotos das embalagens reais podem ser colocadas por código via `imagem_url`.
- Regras comerciais: valor de frete grátis (hoje R$ 299 em `config.js`), desconto Pix (5%),
  pedido mínimo e tabela de atacado.
- Número exato de avaliações no Google (hoje: "dezenas de avaliações").
- Feed real do Instagram exige token da API do Instagram (Fase 2); hoje o grid é ilustrativo e leva ao perfil.
- Checkout real: gateway de pagamento (Pix/cartão) e cálculo de frete por CEP.

## Ver o site no celular

Dê dois cliques em **`VER-NO-CELULAR.bat`** e deixe a janela aberta. Ela mostra os endereços:

- **Mesmo Wi-Fi do computador:** `http://192.168.x.x:5520`. O endereço exato aparece na janela.
- **Fora de casa:** `http://100.x.x.x:5520`. Precisa do app **Tailscale** no celular, entrando com a mesma conta do computador.

Na primeira vez o Windows pode perguntar se libera o "Windows PowerShell" na rede: escolha **Permitir** (rede privada).
É um servidor **só de leitura** (`_dev/serve-celular.ps1`): mostra o site, mas não abre o admin e não grava nada.
O admin continua só no computador (`INICIAR-SITE.bat` → http://localhost:5510/admin/).
