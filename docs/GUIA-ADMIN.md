# Guia da área administrativa

## Como abrir

1. Dê dois cliques em **`INICIAR-SITE.bat`** (pasta do projeto). Ele liga o site e o sincronizador de fotos.
2. No site, role até o **final da página** e clique em **"Área administrativa"** (rodapé, ao lado do ©).
   Ou acesse direto **http://localhost:5510/admin/**
3. Digite o PIN: **`2026`** (trocar em `assets/js/config.js → contas.painelPin`).
4. Para sair, clique em **Sair** (embaixo, no menu da esquerda). Fechar a aba também desconecta.

> Hoje as contas estão no **modo local**: o admin mostra só os clientes e pedidos feitos **no mesmo navegador**.
> Para testar: abra o site (http://localhost:5510), crie uma conta, faça um pedido e volte ao admin.
> Quando o servidor de contas estiver pronto (`docs/API-CONTAS.md`), o admin passa a mostrar todos os clientes.

## Menu

| Seção | Para que serve |
|---|---|
| **Visão geral** | Faturamento e pedidos dos últimos 30 dias, gráfico de 14 dias (varejo × atacado), produtos e clientes que mais compram e o quadro **"Precisa de atenção"**. |
| **Pedidos** | Todos os pedidos, com filtros e mudança de status. |
| **Clientes** | Lista de contas; clique em um cliente para abrir a **ficha**. |
| **Atacado** | Solicitações de CNPJ, empresas aprovadas e descontos. |
| **Fotos** | Enviar, trocar ou remover a foto de cada produto do site. |
| **Destaques** | Escolher quais produtos aparecem **primeiro** na vitrine, em cada departamento e em cada objetivo. |
| **Acessos** | Registro de logins, senhas erradas, cadastros e ações da loja. |

Os números vermelhos no menu mostram o que precisa de ação (pedidos novos, atacado para analisar, senhas erradas).
O botão **Atualizar** (canto superior direito) recarrega os dados.

## Tarefas do dia a dia

### Atender um pedido novo
1. **Pedidos** → aba **Novos**.
2. Clique no pedido para abrir os itens, o cliente e o endereço.
3. Em **Mudar status**, escolha (ex.: *Confirmado*, *Separando*, *Pronto para retirada*, *Enviado*, *Entregue*).
4. Se quiser, escreva um **recado** (ex.: código de rastreio, horário de retirada).
5. **Salvar status** — o cliente vê na hora em *Minha conta › Meus pedidos*.
6. O botão **WhatsApp** abre a conversa com o cliente já falando do pedido.

### Aprovar uma empresa no atacado
1. **Atacado** → aba **Para analisar**.
2. **Consultar CNPJ na Receita** para conferir a empresa.
3. Se quiser, preencha o **desconto** só dessa empresa (vazio = desconto padrão da loja).
4. **Aprovar** ou **Recusar** (a observação aparece para o cliente quando recusa).
5. Em **Empresas ativas** dá para mudar o desconto ou **Revogar** o acesso depois.

### Cliente esqueceu a senha
1. **Clientes** → clique no cliente → **Acesso e segurança** → **Gerar senha temporária**.
2. Envie a senha pelo WhatsApp. Ao entrar, o site pede para ele criar uma senha nova.

### Bloquear ou excluir um cliente
- Na ficha → **Acesso e segurança**:
  - **Bloquear conta** (escreva o motivo): o cliente é desconectado e não entra mais. **Desbloquear** desfaz.
  - **Excluir conta (LGPD)**: digite `EXCLUIR` para confirmar. Apaga o login e os dados; os pedidos ficam guardados para controle fiscal. **Não tem volta.**

### Outras coisas na ficha do cliente
- **Dados da conta**: corrigir nome, e-mail de login e WhatsApp.
- **Observação interna**: anotações que **o cliente nunca vê** (ex.: "retira sábado").
- **Pedidos** e **Atividade recente** do cliente.

### Ficar de olho em invasões
- **Acessos** mostra um alerta quando uma conta tem **3 ou mais senhas erradas em 24 h**.
- Se não foi o cliente: abra a ficha e **bloqueie** ou **gere senha temporária**.

### Fotos dos produtos
1. Menu **Fotos**. Os números mostram quantos produtos têm foto real, foto de banco de imagens ou nenhuma.
2. Filtre (*Sem foto*, departamento) ou busque pelo nome/código e clique no produto.
3. **Enviar/Trocar a foto**: arraste a foto para a área verde ou clique para escolher (JPG, PNG ou WEBP).
   Em poucos segundos ela aparece no site (900×900, fundo branco). A anterior vai para `fotos/_removidas/`.
4. **Remover foto real**: o site volta a mostrar a arte de embalagem (o original fica em `fotos/_removidas/`).
5. Produto com foto de **banco de imagens**: **Ocultar** (se a foto não combina) ou **Voltar a mostrar**.
> Funciona com o admin aberto pelo **INICIAR-SITE.bat** (`http://localhost:5510/admin/`).
> As fotos do Codex continuam entrando sozinhas pela pasta `fotos/`.

### Planilhas
- **Pedidos**, **Clientes** e **Acessos** têm o botão **Exportar planilha** (abre no Excel). Exporta o que está filtrado na tela.

## Produtos: nome, preço e descrição

Menu **Produtos e fotos** → clique no produto → bloco **Dados do produto**:
- altere **Nome**, **Preço** (por unidade, ou por kg nos produtos a granel) e **Descrição** → **Salvar alterações**. Vale no site na hora (o cliente vê ao recarregar).
- Descrição vazia = o site usa o texto automático (aparece em cinza no campo).
- **Voltar ao original** desfaz tudo e volta aos dados do catálogo (PDF).
- Produtos alterados mostram "editado" na grade.

Onde fica salvo: `data/produtos-ajustes.js` (só o que mudou; o catálogo do PDF `data/produtos.js` não é tocado, então importar um PDF novo não apaga os ajustes).
Precisa do site aberto pelo **INICIAR-SITE.bat** (grava pelo servidor local, protegido pelo PIN). Em produção: `PATCH /admin/produtos/:codigo` (ver `docs/API-CONTAS.md`).
## Cupons de desconto

Hoje os cupons ficam no arquivo `assets/js/config.js`, na lista `cupons` (ainda não tem tela no admin).
Cada cupom é uma linha, por exemplo:

```js
{ codigo: 'BEMVINDO10', tipo: 'percentual', valor: 10, minimo: 0, validade: '2026-12-31', primeiroPedido: true, ativo: true, descricao: '10% no primeiro pedido' }
```

| Campo | O que é |
|---|---|
| `codigo` | O que o cliente digita (maiúsculas e minúsculas tanto faz) |
| `tipo` | `'percentual'` (valor = %), `'valor'` (valor = R$) ou `'frete'` (frete grátis) |
| `valor` | O número do desconto |
| `minimo` | Pedido mínimo em R$; `0` = sem mínimo |
| `validade` | Último dia que vale, no formato `'AAAA-MM-DD'`; `''` = sem prazo |
| `primeiroPedido` | `true` = só no primeiro pedido da conta |
| `ativo` | `false` = desligado, sem apagar |

O campo "Tenho um cupom" só aparece no site quando existe pelo menos um cupom ativo.
O pedido mostra o cupom usado: na lista de pedidos do admin, no CSV, em "Meus pedidos" do cliente e na mensagem do WhatsApp.

## Destaques da vitrine

Escolhe quais produtos aparecem **primeiro**, e em que ordem, nas 4 primeiras fileiras da vitrine (até 16 produtos).

1. Menu **Destaques** → em **Lista**, escolha onde:
   - **Vitrine inicial**: quem abre o site sem filtro;
   - um **departamento** (ex.: Castanhas & Oleaginosas);
   - um **objetivo** (ex.: Treino & Massa Muscular).
2. Em **Adicionar produto**, busque pelo nome ou código e clique em **Adicionar**. Na busca só aparecem produtos daquela lista.
3. Ajuste a ordem com **↑ ↓** e tire com **✕**. O quadro **"Como fica no site"** mostra os 16 primeiros como vão aparecer.
4. Clique em **Salvar destaques**. O site já mostra a nova ordem para quem abrir ou recarregar a página.

- **Depois dos escolhidos:** vêm os demais produtos, dos mais vendidos para os menos.
- **Quando vale:** só com a vitrine na ordem **"Destaques"**, que é a ordem padrão, e sem busca. Se o cliente escolher "Menor preço" ou buscar uma palavra, a ordem é a dele.
- **Voltar ao padrão:** **Limpar lista** + **Salvar** faz a lista voltar a mostrar os mais vendidos.
- **Como chega à hospedagem:** fica gravado em `data/destaques.js` e vai para o GitHub junto com o próximo envio de fotos (`tools/publicar-fotos.ps1`).
