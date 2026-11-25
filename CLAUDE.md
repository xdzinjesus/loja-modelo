# Loja modelo — instruções para o Claude

Modelo neutro de site/e-commerce (HTML + CSS + JS puro, sem build), criado a partir do projeto Kadosh em 25/11/2026.
Sem marca, sem produtos e sem fotos: serve de base para qualquer empresa. O usuário fala pt-BR — responder em português.

## Para começar uma empresa nova
1. `assets/js/config.js` → bloco `loja` (nome, endereço, WhatsApp, horários, Instagram, mapa), `categorias`, `objetivos`,
   `avaliacoes`, `instagramPosts`, `cupons` e `contas.painelPin` (PIN do admin — TROCAR).
   Os textos do site com `data-cfg="..."` (index.html) são preenchidos a partir do config.
2. Logo: trocar `assets/img/logo.svg`; ícones do celular: `assets/img/icone-*.png`; fotos do topo: `assets/img/hero-*.svg`.
3. Cores: tokens em `:root` de `assets/css/styles.css` e `admin/admin.css` (modelo: grafite + azul).
4. Textos fixos que pedem revisão: seção "Sobre" em `index.html`, `privacidade.html` (razão social, CNPJ, contatos — trechos entre [colchetes]),
   `manifest.webmanifest`, bloco JSON-LD no `<head>` do index.
5. Produtos: `data/produtos.js` (vazio). Importar com `tools/importar-catalogo.html` (PDF) ou `tools/csv-para-produtos.ps1`, ou cadastrar no admin.
   Fotos: pasta `fotos/` (nome = código) → `tools/sincronizar-fotos.ps1`.
6. Seções sem conteúdo (categorias, objetivos, avaliações, Instagram) ficam escondidas sozinhas.

## Como rodar
- `INICIAR-SITE.bat` (servidor `_dev/serve.ps1`, porta 5510; `-Port` para outra) · admin em `/admin/` (PIN do config).
- Os testes em `_dev/teste-*.html` vieram do projeto original e contam com o catálogo dele: com o catálogo vazio vários falham até haver produtos.
- Sem Node/Python: scripts em PowerShell; Edge headless com `--disable-extensions --disable-sync --disable-features=msImplicitSignin` e perfil novo.

## Git
- Repositório: `xdzinjesus/loja-modelo` (privado), branch `main`. `git pull` antes de mexer, commit + push ao terminar.
- Para cada empresa nova: copiar esta pasta (ou "Use this template" no GitHub) para um repositório próprio — não editar o modelo com dados de cliente.