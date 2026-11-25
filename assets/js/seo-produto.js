/* Metadados da espiada rápida. O JSON-LD da loja permanece na página. */
(function () {
  'use strict';

  const originais = new Map();
  let tituloOriginal;
  let dadosProduto;

  function definirMeta(atributo, chave, conteudo) {
    let meta = document.head.querySelector(`meta[${atributo}="${chave}"]`);
    const anterior = meta?.getAttribute('content') ?? null;
    const criada = !meta;
    if (criada) {
      meta = document.createElement('meta');
      meta.setAttribute(atributo, chave);
      document.head.append(meta);
    }
    if (!originais.has(meta)) originais.set(meta, { anterior, criada });
    meta.content = conteudo;
  }

  function mostrar(produto, url, preco) {
    tituloOriginal ??= document.title;
    const titulo = `${produto.nome} | ${window.LOJA_CONFIG.loja.nomeCurto}`;
    const descricao = produto.descricao.replace(/\s+/g, ' ').trim();
    const imagem = produto._img
      ? new URL(window.LojaCatalog.imgUrl(produto._img, 900, 900), document.baseURI).href
      : '';

    document.title = titulo;
    definirMeta('name', 'description', descricao);
    definirMeta('property', 'og:type', 'product');
    definirMeta('property', 'og:title', titulo);
    definirMeta('property', 'og:description', descricao);
    definirMeta('property', 'og:url', url);
    if (imagem) definirMeta('property', 'og:image', imagem);

    const dados = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: produto.nome,
      description: descricao,
      sku: String(produto.codigo_sku || produto.id),
      url,
      offers: { '@type': 'Offer', price: Number(preco.toFixed(2)), priceCurrency: 'BRL', url }
    };
    if (imagem) dados.image = imagem;
    if (produto.marca?.trim()) dados.brand = { '@type': 'Brand', name: produto.marca.trim() };

    if (!dadosProduto) {
      dadosProduto = document.createElement('script');
      dadosProduto.type = 'application/ld+json';
      dadosProduto.id = 'seo-produto-jsonld';
      document.head.append(dadosProduto);
    }
    dadosProduto.textContent = JSON.stringify(dados).replace(/</g, '\\u003c');
  }

  function restaurar() {
    if (!dadosProduto) return;
    dadosProduto.remove();
    dadosProduto = undefined;
    document.title = tituloOriginal;
    tituloOriginal = undefined;
    for (const [meta, { anterior, criada }] of originais) {
      if (criada) meta.remove();
      else if (anterior === null) meta.removeAttribute('content');
      else meta.content = anterior;
    }
    originais.clear();
  }

  window.LojaSeoProduto = { mostrar, restaurar };
})();
