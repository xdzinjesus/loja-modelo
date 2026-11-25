# Revisão antes da entrega ao cliente

> Lista de tudo que precisa ser conferido **antes de entregar o site**.
> Quando for a hora, peça: *"faz a mega revisão"* — a revisão parte desta lista e depois varre o site inteiro.

## 1. Decisões e dados para confirmar com o cliente

| Item | Onde | Situação |
|---|---|---|
| PIN do painel admin (`2026`) | `assets/js/config.js → contas.painelPin` | **[TROCAR]** |
| Frete grátis acima de R$ 299 | `config.js → loja.freteGratisAcima` | [A CONFIRMAR] |
| Pedido mínimo de atacado ("Consulte condições") | `config.js → loja.pedidoMinimoAtacado` | [A CONFIRMAR] |
| Desconto padrão para atacado aprovado (hoje 0%) | `config.js → contas.atacado.descontoPercentual` | [A CONFIRMAR] |
| Benefícios do atacado (textos) | `config.js → contas.atacado.beneficios` | [A CONFIRMAR] |
| Logo em vetor (SVG/PDF) — hoje é PNG feito da imagem enviada | `assets/img/logo.svg` | pedir ao cliente |
| Contatos, endereço, horários, Instagram, nota Google | `config.js → loja` | conferir |
| CNPJ e encarregado de dados (LGPD) na política de privacidade; revisão do texto pelo contador/jurídico | `privacidade.html` (marcado CONFIRMAR) | **[A CONFIRMAR]** |
| Domínio do site → gerar `sitemap.xml` e a linha do `robots.txt` | `config.js → loja.dominio` + `tools/gerar-sitemap.ps1` | **[TROCAR]** |
| Ordenação "Mais novos" usa o código do produto (maior = mais novo) | `assets/js/catalog.js → numCodigo` | [A CONFIRMAR] |
| Sinônimos da busca (lista editável) | `assets/js/catalog.js → SINONIMOS` | revisar com a loja |

## 2. Partes que ainda são demonstração

- **Contas no modo `local`**: login, pedidos e atacado ficam salvos **só no navegador**.
  Para produção: construir o backend do contrato `docs/API-CONTAS.md` e trocar `contas.modo` para `'api'` + `apiUrl`.
  Hospedagem **ainda não definida** (Cloudflare ou Vercel).
- **Admin no modo local** é protegido só por PIN (não é segurança real). Em produção: login de administrador no servidor.
  O link "Área administrativa" fica visível no rodapé do site (pedido do usuário) — decidir com o cliente se mantém visível em produção.
- **Recuperar senha por e-mail** só funciona com o backend (no modo local a loja gera senha temporária no admin).
- **Checkout**: QR Code Pix ilustrativo, frete fixo de R$ 24,90, texto "Este é um checkout de demonstração".
  Precisa de gateway de pagamento e cálculo real de frete (ou deixar claro que o pedido é confirmado pelo WhatsApp).

## 3. O que NÃO vai para o servidor

O site publicado é só: `index.html`, `privacidade.html`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `assets/`, `data/`, `admin/`.

Não publicar:
- `_backup/` (868 MB — index.html único original + ZIP do projeto)
- `_dev/` (servidor local, páginas de teste, log)
- `tools/` (ferramentas de importação/fotos)
- `fotos/` (originais em alta; o site usa `assets/produtos/`)
- `docs/`, `README.md`, `CLAUDE.md`, `INICIAR-SITE.bat`

## 4. Testes automáticos (rodar de novo na revisão)

Com o site rodando (`INICIAR-SITE.bat`):
- `http://localhost:5510/_dev/teste-contas.html` — contas, checkout, atacado (50 testes)
- `http://localhost:5510/_dev/teste-admin.html` — área administrativa (33 testes)
- `http://localhost:5510/_dev/teste-fotos.html` — toda foto de `fotos/` aparece no produto certo
- `http://localhost:5510/_dev/teste-vitrine.html` — filtro lateral não pula para o rodapé; avaliações niveladas
- `http://localhost:5510/_dev/teste-fotos-admin.html` — enviar/trocar/remover foto pelo admin (usa um produto sem foto e desfaz tudo; apague depois os arquivos do código testado em `fotos/_removidas/`)

- `http://localhost:5510/_dev/teste-melhorias.html` — melhorias de 24/11 (celular, miniaturas, link do produto, CEP, observações, SEO)
- `http://localhost:5510/_dev/teste-produtos.html` — alterar nome/preço/descrição pelo admin (usa o 4249 e desfaz)
- `http://localhost:5510/_dev/teste-novidades.html` — busca (sinônimos, erro de digitação), só com foto, mais novos, vistos recentemente, pedido rápido de atacado, privacidade, sitemap (54 testes)
- `http://localhost:5510/_dev/teste-endereco.html` — endereço de entrega (busca por rua, CEP, salvos, instruções) e botão Pedidos
- `http://localhost:5510/_dev/teste-celular.html` — duas telas de celular para conferir o visual

Fotos em produção: hoje o envio pelo admin grava via servidor local (`_dev/serve.ps1`). Em produção precisa do backend (ver `docs/BANCO-DE-DADOS.md → Fotos em produção`).

> Atenção: os testes apagam as contas/pedidos de teste **deste navegador**.

## 5. Pontos técnicos já conhecidos

- ~~No celular a página era mais larga que a tela~~ — **corrigido em 24/11** (era a grade de produtos; ver `docs/MELHORIAS-2026-11-24.md`).
- `og:image` (prévia ao compartilhar) usa caminho relativo: trocar pelo endereço completo quando houver domínio.
- Conferir preços que parecem baixos vindos do PDF (ex.: "Mix de Amendoim" R$ 2,80/kg) — agora dá para corrigir pelo admin (Produtos e fotos).
- Fotos do Codex: chegam em `fotos/` e o `tools/sincronizar-fotos.ps1` gera `assets/produtos/`. Conferir se todas as fotos novas estão no site antes de entregar.
- Ainda há 38 fotos do Unsplash com cópia local e o restante do banco carregado da internet (Unsplash/Pixabay) — conferir licenças/créditos.

## 6. Varredura completa (fazer na revisão)

- Textos, ortografia, preços e nomes de produtos
- Todos os links e botões de WhatsApp (número e mensagens)
- SEO: título, descrição, Open Graph, favicon, `robots`/`sitemap`
- Desempenho: peso das imagens, tempo de carregamento, Lighthouse
- Acessibilidade: contraste, foco no teclado, textos alternativos
- Celular e desktop em todas as telas (site, conta, checkout, admin)
- Segurança do admin e textos de LGPD/privacidade
- Limpar dados de teste do navegador antes da apresentação (`Ctrl+F5`)
