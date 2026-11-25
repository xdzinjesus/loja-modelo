/* ==========================================================================
   LOJA — Configuração da loja
   Tudo que é "dado institucional" fica aqui (contato, horários, categorias,
   objetivos, banco de imagens por categoria). Alterar aqui reflete no site todo.
   ========================================================================== */
window.LOJA_CONFIG = {
  loja: {
    // [TROCAR] Dados da empresa — aparecem no site todo (cabeçalho, rodapé, contato, WhatsApp, mapa)
    nome: 'Sua Loja',
    nomeCurto: 'Sua Loja',
    subtitulo: 'Atacado e Varejo',
    slogan: 'Qualidade e bom atendimento',
    endereco: 'Rua Exemplo, 100',
    bairro: 'Centro',
    cidade: 'Cidade',
    uf: 'UF',
    cep: '00000-000',
    whatsapp: '5500000000000',            // somente dígitos, com DDI 55
    whatsappExibicao: '(00) 00000-0000',
    telefone: '550000000000',
    telefoneExibicao: '(00) 0000-0000',
    instagram: 'sualoja',
    instagramSeguidores: '',
    googleNota: '',
    googleResumo: '',
    googleUrl: 'https://www.google.com/maps',
    mapaEmbed: 'https://maps.google.com/maps?q=Brasil&z=4&output=embed',
    // dia da semana (0 = domingo) -> [abre, fecha] em "HH:MM"; null = fechado
    horarios: { 0: null, 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: ['08:00', '12:00'] },
    totalItensCatalogo: '',
    freteGratisAcima: 0,
    // venda por peso: "Outra quantidade" na espiada rápida aceita de granelGramasMin até granelGramasMax gramas
    granelGramasMin: 100,
    granelGramasMax: 50000,
    pedidoMinimoAtacado: 'Consulte condições',
    // [TROCAR] endereço do site publicado, ex.: 'https://www.sualoja.com.br' (usado por tools/gerar-sitemap.ps1)
    dominio: ''
  },

  /* Contas de clientes (login, pedidos, atacado) — ver docs/API-CONTAS.md
     modo 'local': tudo funciona no navegador (demonstração/testes; cada navegador tem seus próprios dados).
     modo 'api'  : usa o backend em `apiUrl` (Cloudflare Workers, Vercel etc.), que implementa o contrato da doc. */
  contas: {
    modo: 'local',
    apiUrl: '',                 // ex.: 'https://api.sualoja.com.br' (sem barra no fim)
    painelPin: '2026',          // [TROCAR] PIN do painel da loja no modo local (tools/painel-loja.html)
    atacado: {
      // [A CONFIRMAR COM O CLIENTE] desconto aplicado no checkout para contas atacado aprovadas (0 = sem desconto automático)
      descontoPercentual: 0,
      beneficios: [
        'Tabela de preços de atacado enviada pelo comercial',
        'Atendimento prioritário no WhatsApp comercial',
        'Pedidos identificados como atacado para a equipe da loja'
      ]
    }
  },

  /* Cupons de desconto (assets/js/cupons.js). O campo "Tenho um cupom" só aparece no checkout se houver cupom ativo.
     tipo: 'percentual' (valor = %), 'valor' (valor = R$) ou 'frete' (frete grátis)
     minimo: pedido mínimo em R$ (0 = sem mínimo) · validade: 'AAAA-MM-DD' = último dia que vale ('' = sem prazo)
     primeiroPedido: true = só no 1º pedido da conta · ativo: false = desligado
     [A CONFIRMAR COM O CLIENTE] os exemplos abaixo estão DESLIGADOS (ativo: false); ligue/crie os que a loja quiser. */
  cupons: [
    { codigo: 'BEMVINDO10', tipo: 'percentual', valor: 10, minimo: 0, validade: '', primeiroPedido: true, ativo: false, descricao: '10% no primeiro pedido' },
    { codigo: 'FRETEGRATIS', tipo: 'frete', valor: 0, minimo: 150, validade: '', primeiroPedido: false, ativo: false, descricao: 'Frete grátis acima de R$ 150' }
  ],

  /* Departamentos — `slug` é a chave usada em `produto.categoria`.
     As subcategorias são lidas dos próprios produtos (data/produtos.js). */
  categorias: [
    // ex.: { slug: 'bebidas', nome: 'Bebidas', curto: 'Bebidas', img: '' }
  ],

  /* Selos de restrição alimentar (chave usada em `produto.tags_restricao`) */
  restricoes: [
    // ex.: { id: 'promocao', nome: 'Promoção' }  ('granel' = produtos vendidos por peso)
    { id: 'granel', nome: 'Por peso' }
  ],

  /* "Compre por objetivo" — chave usada em `produto.objetivos` */
  objetivos: [
    // ex.: { id: 'promocoes', nome: 'Promoções', texto: 'Ofertas da semana.', img: '' }
  ],

  /* Banco de imagens automáticas (FASE 2):
     Quando um produto vier do PDF sem `imagem_url`, a imagem é escolhida por
     palavra-chave no nome; se nada casar, usa a imagem da categoria. */
  imagensPorPalavra: [],

  // Buscas sugeridas ao clicar na busca (vazio = usa os nomes das categorias)
  buscasPopulares: [],

  // Posts na seção Instagram: [imagem (URL ou id), título, texto, etiqueta]; vazio = seção escondida
  instagramPosts: [],

  avaliacoes: [
    // ex.: { nome: 'Cliente', texto: 'Ótimo atendimento!' }
  ]
};
