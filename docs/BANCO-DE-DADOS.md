# Como funciona o banco de dados

## Resumo em uma frase

**Hoje** o site guarda contas e pedidos **no navegador de cada pessoa** (serve para testar e apresentar);
**em produção** tudo isso vai para **um banco de dados num servidor** (Cloudflare ou Vercel), e o site
conversa com ele por uma API — a interface do site e do admin **não muda**, só uma linha da configuração.

---

## 1. Os três tipos de dado do site

| Tipo | Exemplos | Onde fica hoje | Onde fica em produção |
|---|---|---|---|
| **Catálogo** | 2.413 produtos, preços, categorias | arquivo `data/produtos.js` (gerado do PDF da loja) | continua arquivo, publicado junto com o site |
| **Fotos dos produtos** | foto real, foto do banco de imagens | pasta `fotos/` → `assets/produtos/` + `data/fotos-reais.js` | arquivos num **armazenamento de fotos** (Cloudflare R2 ou Vercel Blob) + tabela `produtos_fotos` |
| **Dados de clientes** | contas, senhas, pedidos, atacado, acessos | `localStorage` do navegador | **banco de dados** no servidor |

O catálogo e as fotos são "públicos" (qualquer visitante vê). Os dados de clientes são **privados**
e por isso precisam de um servidor com regras de acesso.

---

## 2. Como está hoje (modo `local`)

`assets/js/config.js → contas.modo = 'local'`

O arquivo `assets/js/conta-api.js` grava tudo no **armazenamento do próprio navegador** (`localStorage`):

| Chave no navegador | O que guarda |
|---|---|
| `loja:db:usuarios` | contas (nome, e-mail, WhatsApp, senha **criptografada** PBKDF2, atacado, bloqueio, observação interna) |
| `loja:db:pedidos` | pedidos com itens, totais, status e histórico |
| `loja:db:log` | registro de acessos e ações (últimos 1.000) |
| `loja:sessao` | quem está logado neste navegador (30 dias) |
| `loja:db:tentativas` | controle de senhas erradas (bloqueio de 2 min após 5 erros) |
| `loja:cart`, `loja:fav` | carrinho e favoritos do visitante |

**Limitações (por isso é só para teste):**
- Cada navegador tem o seu "banco": a conta criada no celular não existe no computador.
- O admin só enxerga o que foi feito **no mesmo navegador**.
- Limpar os dados do navegador apaga tudo.
- Não há como enviar e-mail (recuperação de senha).

---

## 3. Como vai ficar em produção (modo `api`)

```
 Navegador do cliente ──┐                          ┌── Banco de dados (tabelas abaixo)
                        ├──►  API (servidor)  ─────┤
 Área administrativa ───┘   regras e segurança     └── Armazenamento de fotos (R2 / Blob)
```

- O navegador **nunca** acessa o banco direto: só a API, que confere quem é quem.
- A API valida tudo de novo (preço, desconto de atacado, permissões) — o navegador pode ser adulterado.
- O contrato exato da API (rotas, campos, erros) está em **`docs/API-CONTAS.md`**.
- Para ligar: publicar a API e trocar em `config.js` → `contas: { modo: 'api', apiUrl: 'https://…' }`.

### Tabelas

```
usuarios ─┬─< pedidos ─┬─< pedido_itens
          │            └─< pedido_historico
          ├── empresas_atacado (1 por usuário)
          ├─< sessoes
          ├─< recuperacao_senha
          └─< eventos
admins ─< sessoes_admin
produtos_fotos (por código de produto)
```

| Tabela | Campos principais | Para quê |
|---|---|---|
| **usuarios** | id, nome, email (único), fone, senha_hash, criado_em, ultimo_acesso, acessos, senha_temporaria, bloqueado_em, bloqueio_motivo, nota_interna | a conta do cliente |
| **empresas_atacado** | usuario_id, cnpj (único), razao_social, cidade, ramo, status (pendente/aprovado/recusado), desconto_percentual, solicitado_em, respondido_em, motivo | pedido e aprovação de atacado |
| **pedidos** | id (KD123456), usuario_id, criado_em, status, atacado, subtotal, frete, desconto_pix, desconto_atacado, total, entrega_tipo, cep, pagamento, cliente_nome, cliente_fone, conta_excluida | cabeçalho do pedido |
| **pedido_itens** | pedido_id, produto_codigo, nome, gramas, conteudo, qty, unitario, total | itens com preço **congelado** no momento da compra |
| **pedido_historico** | pedido_id, status, em, nota | linha do tempo e recados da loja |
| **sessoes** | token_hash, usuario_id, criado_em, expira_em | quem está logado (o token em si nunca é guardado) |
| **recuperacao_senha** | token_hash, usuario_id, expira_em, usado | link de "esqueci minha senha" (vale 1 h) |
| **eventos** | em, tipo, usuario_id, email, detalhe, ip | tela "Acessos" do admin |
| **admins** / **sessoes_admin** | email, senha_hash / token_hash, expira_em | login do dono da loja (substitui o PIN) |
| **produtos_fotos** | codigo, arquivo_url, origem (real/banco), oculta, atualizado_em | qual foto cada produto mostra |

### O que acontece em cada ação

- **Cliente cria conta** → API valida os dados, grava em `usuarios` (senha só como hash), cria uma `sessao`, registra `eventos: cadastro`.
- **Cliente finaliza a compra** → API recalcula preços pelo catálogo, aplica desconto de atacado **só se aprovado no banco**, grava `pedidos` + `pedido_itens` + `pedido_historico (recebido)`.
- **Dono muda o status no admin** → API confere a sessão de admin, acrescenta em `pedido_historico`; o cliente vê em "Meus pedidos".
- **Dono envia uma foto** → a foto vai para o armazenamento (R2/Blob), a API atualiza `produtos_fotos`; o site passa a mostrar a nova foto.
- **Dono exclui uma conta (LGPD)** → apaga `usuarios`, `sessoes`, `empresas_atacado`; os `pedidos` ficam (controle fiscal) marcados com `conta_excluida`.

### Fotos em produção

Hoje o site lê as fotos de `data/fotos-reais.js` (arquivo). Em produção há duas opções:
1. **Mais simples**: a API publica a lista no mesmo formato (`window.LOJA_FOTOS_REAIS = {…}`) num endereço
   como `https://api…/catalogo/fotos-reais.js`, e o `index.html` passa a carregar esse endereço no lugar do arquivo.
2. Continuar com arquivos: enviar as fotos pela pasta `fotos/` e republicar o site (sem envio pelo admin em produção).

A área administrativa já está pronta para a opção 1 (rotas em `docs/API-CONTAS.md → Fotos dos produtos`).

---

## 4. Onde hospedar (decisão pendente)

| | Cloudflare | Vercel |
|---|---|---|
| Site | Cloudflare Pages | Vercel (estático) |
| API | Workers | Functions (`/api/*`) |
| Banco | **D1** (SQLite) | **Postgres** (Neon / Vercel Postgres) ou **Supabase** |
| Fotos | **R2** | **Vercel Blob** (ou Supabase Storage) |
| E-mail (recuperar senha) | serviço externo (ex.: Resend) | serviço externo (ex.: Resend) |

Para o porte da Loja, os planos gratuitos dessas plataformas costumam atender no início — conferir limites
e preços atuais na hora de contratar. Os dois caminhos usam o **mesmo contrato** (`docs/API-CONTAS.md`).

## 5. Cópias de segurança e LGPD

- O banco em produção deve ter **backup automático** (D1 e Postgres oferecem recuperação por data).
- O admin já exporta **planilhas** de pedidos, clientes e acessos (cópia manual a qualquer momento).
- Senhas: só hash (nunca a senha). Observação interna: nunca enviada ao cliente.
- Cliente pode pedir exclusão: o admin tem **Excluir conta (LGPD)**.
