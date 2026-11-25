# Contas de clientes — contrato da API

O site fala com as contas só através de `assets/js/conta-api.js` (`window.LojaContas`).
Esse arquivo tem dois modos, escolhidos em `assets/js/config.js → contas.modo`:

| Modo | Onde ficam os dados | Para que serve |
|---|---|---|
| `local` (atual) | `localStorage` do navegador; senha com PBKDF2-SHA256 (120 mil iterações) | Testar e apresentar sem servidor. Cada navegador tem seus próprios dados. |
| `api` | Backend REST em `contas.apiUrl` | Produção. Contas valem em qualquer aparelho e a loja vê tudo no painel. |

Para ir para produção: implementar os endpoints abaixo, publicar, e trocar em `config.js`:

```js
contas: { modo: 'api', apiUrl: 'https://api.seudominio.com.br', ... }
```

Nada mais no site precisa mudar.

---

## Convenções

- JSON em tudo (`Content-Type: application/json`), UTF-8.
- Autenticação: `Authorization: Bearer <token>` (token devolvido no login/cadastro).
  O painel da loja usa um token de administrador separado.
- Erros: status HTTP 4xx/5xx com corpo `{ "erro": "Mensagem para o cliente", "campo": "email" }`.
  `campo` é opcional; quando vem, a interface destaca o campo do formulário
  (`nome`, `email`, `fone`, `senha`, `atual`, `nova`, `cnpj`, `razaoSocial`, `cidade`, `ramo`).
- `401` em rotas de cliente → o site encerra a sessão e pede login de novo.
- Datas em ISO 8601 (`2026-11-23T14:05:00.000Z`).
- CORS: liberar o domínio do site (`Access-Control-Allow-Origin`, métodos `GET, POST, PATCH`, header `Authorization`).

## Modelos

### Usuario (nunca inclui a senha)

```json
{
  "id": "uuid",
  "nome": "Maria Souza",
  "email": "maria@exemplo.com",
  "fone": "49999999999",
  "criadoEm": "2026-11-23T14:05:00.000Z",
  "senhaTemporaria": false,
  "atacado": {
    "status": "nenhum | pendente | aprovado | recusado",
    "cnpj": "11222333000181",
    "razaoSocial": "Empório Exemplo Ltda",
    "cidade": "Concórdia/SC",
    "ramo": "Mercado / Empório",
    "solicitadoEm": "…",
    "respondidoEm": "…",
    "motivo": "texto opcional da loja"
  }
}
```

### Pedido

```json
{
  "id": "KD482913",
  "usuarioId": "uuid",
  "criadoEm": "…",
  "status": "recebido | confirmado | separando | pronto | enviado | entregue | cancelado",
  "historico": [{ "status": "recebido", "em": "…", "nota": "opcional" }],
  "atacado": false,
  "itens": [{ "id": "1830", "sku": "1830", "nome": "Castanha-do-pará", "g": 500, "conteudo": null, "qty": 2, "unitario": 59.95, "total": 119.9 }],
  "subtotal": 119.9, "frete": 0, "descontoPix": 6.0, "descontoAtacado": 0, "total": 113.9,
  "entrega": {
    "tipo": "retirada | entrega",
    "apelido": "Casa", "cep": "89700125", "logradouro": "Rua Marechal Deodoro", "numero": "450", "semNumero": false,
    "complemento": "Bloco B, apto 302", "bairro": "Centro", "cidade": "Concórdia", "uf": "SC",
    "referencia": "Em frente à padaria", "tipoLocal": "casa | apto | condominio | comercial | outro",
    "instrucoes": "Deixar na portaria; Interfone 302", "recebedor": { "nome": "Maria", "fone": "(49) 98888-7777" } ,
    "lat": null, "lon": null
  },
  "pagamento": "pix | cartao | dinheiro",
  "cliente": { "nome": "Maria Souza", "fone": "(49) 99999-9999" }
}
```

`pronto` = pronto para retirada; `enviado` = saiu para entrega. O cliente só pode cancelar com status `recebido`.
Na retirada, `entrega` é só `{ "tipo": "retirada" }`. Pedidos antigos podem ter o formato anterior
(`{ tipo, cep, cidade: "Concórdia/SC", logradouro, bairro }`); `LojaEndereco.formatar()` exibe os dois.
O backend deve **recalcular o frete** a partir do endereço, sem confiar no valor enviado.

### Endereço salvo (`assets/js/endereco.js`)

Mesmo formato de `entrega` (sem `tipo`), mais `id`, `padrao` (boolean), `instrucoesRapidas` (atalhos marcados) e `instrucoesTexto`.
Hoje fica em `localStorage["loja:enderecos:<usuarioId>"]`; no backend, uma tabela por usuário (até 12 endereços).

---

## Endpoints do cliente

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/cadastro` | `{ nome, email, fone, senha }` | `201 { token, usuario }` · `409` se o e-mail já existe (`campo: "email"`) |
| `POST /auth/entrar` | `{ email, senha }` | `{ token, usuario }` · `401 { erro: "E-mail ou senha incorretos.", campo: "senha" }` |
| `POST /auth/sair` | — | `204` (invalida o token) |
| `POST /auth/recuperar` | `{ email }` | `204` **sempre** (não revela se o e-mail existe). Envia e-mail com link `https://SITE/?redefinir=<token>` válido por 1 h |
| `POST /auth/redefinir` | `{ token, senha }` | `{ token, usuario }` (já entra logado) · `400` token inválido/expirado |
| `GET /me` | — | `{ usuario }` |
| `PATCH /me` | `{ nome, fone }` | `{ usuario }` |
| `POST /me/senha` | `{ atual, nova }` | `{ usuario }` · `400 campo: "atual"` se a senha atual não confere. Remove `senhaTemporaria` |
| `POST /me/atacado` | `{ cnpj, razaoSocial, cidade, ramo }` | `{ usuario }` com `atacado.status = "pendente"` · `409` se já pendente/aprovado ou CNPJ em outra conta |
| `GET /me/pedidos` | — | `{ pedidos: Pedido[] }` (mais recente primeiro) |
| `POST /me/pedidos` | Pedido **sem** `id/usuarioId/status/historico/criadoEm/atacado` | `201 { pedido }` |
| `POST /me/pedidos/:id/cancelar` | — | `{ pedido }` · `409` se o status não for `recebido` |
| `GET /me/enderecos` | — | `{ enderecos: Endereco[] }` (padrão primeiro) |
| `POST /me/enderecos` | Endereço sem `id` | `201 { endereco }` · o primeiro vira `padrao` |
| `PATCH /me/enderecos/:id` | campos alterados (inclui `padrao: true` para tornar padrão) | `{ endereco }` |
| `DELETE /me/enderecos/:id` | — | `204` · se era o padrão, o mais recente vira padrão |

## Endpoints da área administrativa (`/admin/`)

No admin, `Usuario` vem **completo** (menos a senha): inclui também
`ultimoAcesso`, `acessos` (contador), `notaInterna`, `bloqueado: { em, motivo }` e `atacado.descontoPercentual`.
Esses campos internos **não** podem aparecer nas rotas `/me` do cliente (exceto `atacado.descontoPercentual`).

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /admin/entrar` | `{ email, senha }` | `{ token }` (token de administrador) |
| `GET /admin/usuarios` | — | `{ usuarios: Usuario[] }` |
| `PATCH /admin/usuarios/:id` | `{ nome?, email?, fone?, notaInterna? }` | `{ usuario }` · `409 campo: "email"` se o e-mail for de outra conta |
| `POST /admin/usuarios/:id/bloqueio` | `{ bloqueado: boolean, motivo? }` | `{ usuario }`. Bloquear **invalida as sessões** do cliente; login de conta bloqueada → `403 { erro: "Sua conta está bloqueada…" }` |
| `DELETE /admin/usuarios/:id` | — | `204`. Apaga login e dados pessoais; pedidos ficam com `contaExcluida: true` |
| `POST /admin/usuarios/:id/senha-temporaria` | — | `{ senha }` e marca `senhaTemporaria: true` |
| `POST /admin/usuarios/:id/atacado` | `{ aprovado: boolean, motivo? }` | `{ usuario }` (aprovar, recusar ou revogar) |
| `PATCH /admin/usuarios/:id/atacado` | `{ descontoPercentual: number \| null }` | `{ usuario }` (0–50; `null` = padrão da loja) |
| `GET /admin/pedidos` | — | `{ pedidos: (Pedido & { conta: { nome, email, fone } })[] }` |
| `PATCH /admin/pedidos/:id` | `{ status, nota? }` | `{ pedido }` (acrescenta item ao `historico`) |
| `GET /admin/atividade` | — | `{ eventos: Evento[] }` (mais recente primeiro; sugestão: últimos 90 dias) |

### Fotos dos produtos (seção "Fotos" do admin)

| Método e rota | Corpo | Resposta |
|---|---|---|
| `PUT /admin/produtos/:codigo/foto` | imagem JPEG (`Content-Type: image/jpeg`, já reduzida a ≤1600 px pelo navegador) | `{ ok: true, arquivo: "https://…/produtos/1830.jpg", substituida: boolean }` |
| `DELETE /admin/produtos/:codigo/foto` | — | `{ ok: true, removida: "real" \| "banco" }` (sem foto real → oculta a do banco) |
| `PATCH /admin/produtos/:codigo/foto-banco` | `{ oculta: boolean }` | `{ ok: true }` |
| `PUT /admin/destaques/:chave` | `{ skus: string[] }` (até 16, na ordem; vazio = volta ao padrão). `chave` = `todos`, slug do departamento ou `obj:<id>` | `{ ok: true }`. O site lê as listas em `GET /destaques` (mesmo formato de `data/destaques.js`) |
| `GET /catalogo/fotos-reais.js` (público) | — | `window.LOJA_FOTOS_REAIS = {"1830":"https://…/1830.jpg",…};` e `window.LOJA_FOTOS_OCULTAS = [...]` |

O servidor deve: validar que é imagem de verdade (assinatura do arquivo), padronizar em 900×900 com fundo branco
(mesmo resultado de `tools/sincronizar-fotos.ps1`), guardar no armazenamento (R2 / Vercel Blob) e manter a tabela `produtos_fotos`.
Ver `docs/BANCO-DE-DADOS.md`.

### Evento (registro de atividade)

```json
{ "em": "…", "tipo": "login", "usuarioId": "uuid | null", "email": "maria@exemplo.com", "detalhe": "texto opcional" }
```

Tipos usados pelo admin: `login`, `login-falhou`, `login-limite`, `login-bloqueado`, `cadastro`, `senha-alterada`,
`atacado-solicitado`, `pedido`, `admin-login`, `admin-login-falhou`, `admin-editou`, `admin-bloqueou`,
`admin-desbloqueou`, `admin-excluiu`, `admin-desconto`, `admin-pedido`, `admin-atacado-aprovou`,
`admin-atacado-recusou`, `admin-senha-temporaria`. Registre `login-falhou` também para e-mails não cadastrados
(com `usuarioId: null`) — é assim que o painel detecta tentativas de invasão.

---

## Regras de segurança que o backend precisa cumprir

1. **Senhas**: guardar só o hash (Argon2id, bcrypt ou PBKDF2-SHA256 ≥ 100 mil iterações, com sal por usuário). Nunca devolver o hash.
2. **Preços**: no `POST /me/pedidos`, **recalcular** `unitario`, `total`, frete e descontos a partir do catálogo do servidor. O navegador pode ser adulterado; os valores enviados servem só de conferência.
   **Cupom**: o pedido pode trazer `cupom: { codigo, desconto, freteGratis }`. O servidor confere de novo o cupom (lista própria, validade, mínimo, "só no 1º pedido" pelos pedidos da conta) e recalcula o desconto; cupom inválido = rejeitar ou zerar o desconto.
3. **Desconto atacado**: só aplicar se `atacado.status === "aprovado"` no banco (não confiar no front), usando `atacado.descontoPercentual` da conta ou, se vazio, o padrão da loja.
4. **Limite de tentativas** em `/auth/entrar`, `/auth/recuperar` e `/admin/entrar` (ex.: 5 por minuto por IP + e-mail).
5. **Tokens**: aleatórios (≥ 32 bytes) ou JWT assinado, com expiração (sugestão: 30 dias cliente, 12 h admin). Guardar hash do token se for sessão em banco.
6. **Isolamento**: rotas `/me/*` só enxergam dados do próprio usuário; rotas `/admin/*` exigem token de admin.
7. **LGPD**: o cadastro registra o aceite de contato/uso de dados; prever exclusão de conta a pedido do cliente.

## Hospedagem — caminhos possíveis

- **Cloudflare**: site em Cloudflare Pages + API em **Workers** + banco **D1** (SQLite). Tudo no plano gratuito para esse volume. E-mail de recuperação via serviço externo (Resend, Mailchannels etc.).
- **Vercel**: site estático + **Functions** (`/api/*`) + banco Postgres (Neon/Vercel Postgres) ou **Supabase**.
  Com Supabase, dá para usar o Auth pronto dele e escrever só um adaptador fino que traduz este contrato.

Em ambos os casos o site continua estático; só muda `contas.modo` e `contas.apiUrl`.

## Editar produto (admin)

`PATCH /admin/produtos/:codigo` — corpo `{ "nome": string|null, "preco": number|null, "unidade_medida": "kg"|"un"|null, "descricao": string|null }`.
`null` = volta ao valor original do catálogo. Resposta `{ ok: true, ajuste: { ...campos alterados } }`.
O site lê os ajustes como `window.LOJA_AJUSTES = { "<codigo>": { nome?, preco?, unidade_medida?, descricao? } }` (hoje `data/produtos-ajustes.js`).