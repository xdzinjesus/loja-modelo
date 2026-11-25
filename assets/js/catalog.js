/* ==========================================================================
   LOJA — Motor de catálogo (sem UI)
   Normaliza os produtos, monta índice de busca e aplica filtros/ordenação.
   Feito para escalar a +2.000 itens: índice pré-computado uma única vez,
   filtros em O(n) e a UI renderiza só a página visível (scroll infinito).
   ========================================================================== */
(function () {
  const CFG = window.LOJA_CONFIG;
  const IMG_BASE = 'https://images.unsplash.com/photo-';

  const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Para a busca, hífen e barra viram espaço: "castanha-do-pará" = "castanha do pará", "CAS-0101" = "cas 0101"
  const normBusca = (s) => norm(s).replace(/[-/]/g, ' ');
  const catBySlug = Object.fromEntries(CFG.categorias.map((c) => [c.slug, c]));

  const FOTOS = window.LOJA_FOTOS || {};

  /** URL de imagem redimensionada (Unsplash aceita w/h/fit/q; outras fontes vão como estão). */
  function imgUrl(src, w = 600, h) {
    if (!src) return '';
    // Cópia local de fotos do Unsplash (data/fotos-unsplash.js → assets/fotos-unsplash/<id>.jpg)
    const LOCAIS = window.LOJA_FOTOS_LOCAIS;
    if (LOCAIS) {
      const id = src.split('?')[0].replace(/^https:\/\/images\.unsplash\.com\/photo-/, '');
      if (LOCAIS.has(id)) return `assets/fotos-unsplash/${id}.jpg`;
    }
    if (src.startsWith('assets/')) {
      // foto real da loja: até 480 px usa a miniatura (assets/produtos/mini/, gerada pelo sincronizador)
      const m = w <= 480 && src.match(/^assets\/produtos\/([^/?]+\.jpg)$/);
      return m ? `assets/produtos/mini/${m[1]}` : src;
    }
    if (src.includes('images.pexels.com')) return src.replace(/w=\d+&h=\d+/, `w=${w}&h=${h || w}`);
    if (src.startsWith('http') && !src.includes('images.unsplash.com')) return src;
    const base = src.startsWith('http') ? src.split('?')[0] : IMG_BASE + src;
    return `${base}?w=${w}${h ? `&h=${h}` : ''}&fit=crop&auto=format&q=72`;
  }

  const REAIS = window.LOJA_FOTOS_REAIS || {};

  /** Imagem: foto real da loja → foto única do banco (data/fotos.js) → null.
      Sem foto própria o site desenha uma arte de embalagem única (nunca repete foto). */
  const OCULTAS = new Set(window.LOJA_FOTOS_OCULTAS || []); // fotos de banco ocultadas no admin
  function resolverImagem(p) {
    if (REAIS[p.codigo_sku]) return REAIS[p.codigo_sku];
    const f = FOTOS[p.codigo_sku]; if (f && f.url && !OCULTAS.has(p.codigo_sku)) return f.url;
    return null;
  }

  /** Descrição automática quando o produto não tem uma (catálogo vindo do PDF). */
  const TEXTO_CAT = {
    castanhas: 'Oleaginosa selecionada, fonte de gorduras boas e energia para o dia a dia.',
    graos: 'Grão selecionado para uma alimentação nutritiva e variada.',
    farinhas: 'Ideal para receitas saudáveis, panificação e o café da manhã.',
    temperos: 'Tempero aromático para dar sabor de verdade às suas receitas.',
    suplementos: 'Suplemento para complementar sua rotina de saúde e performance.',
    chas: 'Planta selecionada para chás e infusões tradicionais.',
    restricoes: 'Opção pensada para quem tem restrição alimentar, sem abrir mão do sabor.',
    desidratadas: 'Doçura e sabor na medida certa para lanches e sobremesas.',
    pastas: 'Prático e saboroso para o seu dia a dia.',
    bemestar: 'Cuidado natural para o corpo e o bem-estar.',
    mercearia: 'Item da nossa mercearia saudável, prático para a rotina.',
    kits: 'Ótima opção para presentear com carinho.'
  };
  function descricaoAuto(p, granel) {
    const base = TEXTO_CAT[p.categoria] || 'Produto selecionado.';
    const venda = granel
      ? ' Vendido a granel: escolha a quantidade e nós pesamos e embalamos na hora, com o frescor do balcão.'
      : ` Produto embalado${p.conteudo ? ` (${p.conteudo})` : ''}. Sabores e disponibilidade podem variar — confirme pelo WhatsApp.`;
    return base + venda;
  }

  function preparar(p, i) {
    const cat = catBySlug[p.categoria];
    const granel = p.unidade_medida === 'kg';
    return {
      ...p,
      id: p.codigo_sku || `P${i}`,
      descricao: p.descricao || descricaoAuto(p, granel),
      _img: resolverImagem(p),
      _credito: REAIS[p.codigo_sku] ? { real: true } : (FOTOS[p.codigo_sku] || null),
      _imgAlt: null,
      _cat: cat,
      _granel: granel,
      _variacoes: granel ? (p.variacoes || [100, 250, 500, 1000]) : null,
      _vendidos: (p.destaque || 0) * 100 + (p.vendidos || 0),
      _selos: p.selos || [],
      _tags: p.tags_restricao || [],
      _obj: p.objetivos || [],
      _busca: normBusca([p.nome, p.codigo_sku, p.subcategoria, cat && cat.nome, p.beneficios, p.descricao].join(' ')),
      _nomeNorm: norm(p.nome)
    };
  }

  // Ajustes do admin (nome/preco/descricao) sobrepoem o catalogo importado do PDF
  const AJUSTES = window.LOJA_AJUSTES || {};
  const produtos = (window.LOJA_PRODUTOS || []).map((p) => (AJUSTES[p.codigo_sku] ? { ...p, ...AJUSTES[p.codigo_sku] } : p)).map(preparar);
  const porId = new Map(produtos.map((p) => [p.id, p]));

  /** Preço de uma variação (gramas) para granel; para "un" devolve o preço. */
  function precoDe(p, gramas) {
    if (!p._granel) return p.preco;
    return Math.round(p.preco * (gramas / 1000) * 100) / 100;
  }
  /** Menor preço exibível (usado em filtro de faixa e "a partir de"). */
  function precoBase(p) { return p._granel ? precoDe(p, p._variacoes[0]) : p.preco; }

  const rotuloPeso = (g) => (g >= 1000 ? `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}kg` : `${g}g`); // 1500 → "1,5kg"
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /* ---------- Busca ----------
     - todos os termos precisam aparecer (sem acento, sem diferença de maiúsculas);
     - plural simples: "castanhas" também acha "castanha";
     - sinônimos: "castanha do brasil" também acha "castanha do pará" (lista abaixo, editável);
     - erro de digitação: corrigir() sugere a palavra mais próxima do catálogo ("colagem" → "colágeno"). */
  const SINONIMOS = [
    ['castanha do para', 'castanha do brasil'],
    ['curcuma', 'acafrao da terra', 'acafrao'],
    ['uva passa', 'passas'],
    ['aveia em flocos', 'flocos de aveia'],
    ['pre treino', 'pretreino'],
    ['multivitaminico', 'polivitaminico'],
    ['vitamina c', 'acido ascorbico'],
    ['sem acucar', 'zero acucar'],
    ['sal rosa', 'sal do himalaia'],
    ['erva mate', 'chimarrao'],
    ['pasta de amendoim', 'manteiga de amendoim'],
    ['psyllium', 'psilio'],
    ['spirulina', 'espirulina'],
    ['cacau', 'cacao'],
    ['xilitol', 'xylitol'],
    ['eritritol', 'erythritol'],
    ['stevia', 'estevia'],
    ['colageno', 'collagen'],
    ['creatina', 'creatine'],
    ['noz peca', 'pecan'],
    ['gengibre', 'ginger'],
    ['cha verde', 'green tea'],
    ['sem gluten', 'gluten free']
  ];

  /** A busca digitada + as versões com sinônimos trocados (máx. 16). */
  function variantes(qn) {
    const vs = [qn];
    for (const grupo of SINONIMOS) {
      for (let i = 0; i < vs.length && vs.length < 16; i++) {
        const v = ` ${vs[i]} `;
        for (const frase of grupo) {
          if (!v.includes(` ${frase} `)) continue;
          for (const outra of grupo) {
            if (outra === frase) continue;
            const nova = v.replace(` ${frase} `, ` ${outra} `).trim();
            if (!vs.includes(nova) && vs.length < 16) vs.push(nova);
          }
        }
      }
    }
    return vs;
  }
  /** Formas aceitas de um termo: ele mesmo e, se terminar em "s", o singular. */
  const formas = (t) => (t.length > 4 && t.endsWith('s') ? [t, t.slice(0, -1)] : [t]);

  function buscar(q, lista = produtos) {
    const qn = normBusca(q).split(/\s+/).filter(Boolean).join(' ');
    if (!qn) return lista;
    const melhor = new Map(); // produto -> maior pontuação entre as variantes
    for (const v of variantes(qn)) {
      const termos = v.split(' ').map(formas);
      for (const p of lista) {
        let score = 0, ok = true;
        for (const alts of termos) {
          const t = alts.find((a) => p._busca.includes(a));
          if (!t) { ok = false; break; }
          if (p._nomeNorm.startsWith(t)) score += 6;
          else if (p._nomeNorm.includes(t)) score += 4;
          if (norm(p.codigo_sku).includes(t)) score += 5;
        }
        if (!ok) continue;
        const s = score + p._vendidos / 2000;
        if (!melhor.has(p) || melhor.get(p) < s) melhor.set(p, s);
      }
    }
    return [...melhor].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  /* Vocabulário do catálogo (palavras dos nomes e subcategorias) para corrigir erros de digitação */
  let VOCAB = null;
  function vocabulario() {
    if (VOCAB) return VOCAB;
    const cont = new Map(); // palavra normalizada -> { n, formas: Map(original -> n) }
    for (const p of produtos) {
      for (const w of `${p.nome} ${p.subcategoria}`.split(/[\s\-/(),.+&:;"'!?]+/)) {
        const n = norm(w);
        if (n.length < 3 || /\d/.test(n)) continue;
        const e = cont.get(n) || { n: 0, formas: new Map() };
        e.n++; const o = w.toLowerCase(); e.formas.set(o, (e.formas.get(o) || 0) + 1);
        cont.set(n, e);
      }
    }
    VOCAB = [...cont].map(([n, e]) => ({ n, freq: e.n, orig: [...e.formas].sort((a, b) => b[1] - a[1])[0][0] }));
    return VOCAB;
  }
  /** Distância de edição (com troca de letras vizinhas); para de calcular acima de `lim`. */
  function distancia(a, b, lim) {
    if (Math.abs(a.length - b.length) > lim) return lim + 1;
    let ant2 = null, ant = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let minLinha = i;
      for (let j = 1; j <= b.length; j++) {
        const custo = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + custo);
        if (ant2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ant2[j - 2] + 1);
        cur[j] = v; if (v < minLinha) minLinha = v;
      }
      if (minLinha > lim) return lim + 1;
      ant2 = ant; ant = cur;
    }
    return ant[b.length];
  }
  /**
   * "Você quis dizer…": troca as palavras que não existem no catálogo pela mais parecida.
   * Devolve { q: 'busca corrigida (com acentos)', total } ou null quando não há correção que encontre produtos.
   */
  function corrigir(q) {
    const termos = normBusca(q).split(/\s+/).filter(Boolean);
    if (!termos.length) return null;
    let mudou = false;
    const saida = termos.map((t) => {
      if (t.length < 4 || /\d/.test(t) || produtos.some((p) => formas(t).some((a) => p._busca.includes(a)))) return { n: t, o: t };
      // candidatas até `lim` letras de diferença; vence a mais comum no catálogo, pesando a distância
      // (ex.: "colagem" → "colágeno", que aparece em muitos produtos, e não "colagen", de uma marca só)
      const lim = t.length <= 5 ? 1 : 2;
      let achou = null, nota = 0;
      for (const w of vocabulario()) {
        const d = distancia(t, w.n, lim);
        if (d > lim) continue;
        const n = w.freq / ((d + 1) * (d + 1));
        if (n > nota) { achou = w; nota = n; }
      }
      if (!achou) return { n: t, o: t };
      mudou = true;
      return { n: achou.n, o: achou.orig };
    });
    if (!mudou) return null;
    const total = buscar(saida.map((x) => x.n).join(' ')).length;
    return total ? { q: saida.map((x) => x.o).join(' '), total } : null;
  }

  /** Número do código do produto (para "Mais novos": código maior = cadastrado depois no sistema da loja). */
  const numCodigo = (p) => parseInt(String(p.codigo_sku).replace(/\D.*$/, ''), 10) || 0;

  /**
   * filtros = { q, categoria, subcategoria, restricoes:[], objetivo, min, max, comFoto, ordem }
   * ordem: 'relevancia' | 'vendidos' | 'menor' | 'maior' | 'az' | 'novos'
   */
  function filtrar(f = {}) {
    let lista = f.q ? buscar(f.q) : produtos.slice();
    lista = lista.filter((p) => {
      if (f.comFoto && !p._img) return false;
      if (f.categoria && p.categoria !== f.categoria) return false;
      if (f.subcategoria && p.subcategoria !== f.subcategoria) return false;
      if (f.objetivo && !p._obj.includes(f.objetivo)) return false;
      if (f.restricoes && f.restricoes.length && !f.restricoes.every((r) => p._tags.includes(r))) return false;
      const pb = precoBase(p);
      if (f.min != null && pb < f.min) return false;
      if (f.max != null && pb > f.max) return false;
      return true;
    });
    const ord = f.ordem || (f.q ? 'relevancia' : 'destaque');
    const cmp = {
      destaque: (a, b) => b._vendidos - a._vendidos,
      vendidos: (a, b) => b._vendidos - a._vendidos,
      menor: (a, b) => precoBase(a) - precoBase(b),
      maior: (a, b) => precoBase(b) - precoBase(a),
      az: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      novos: (a, b) => numCodigo(b) - numCodigo(a)
    }[ord];
    if (cmp) lista.sort(cmp);
    // Destaques escolhidos no admin (data/destaques.js) vêm primeiro, na ordem escolhida — só na ordem "Destaques" e sem busca
    if (ord === 'destaque' && !f.q) {
      const skus = destaquesDe(chaveDestaque(f));
      if (skus.length) {
        const pos = new Map(skus.map((s, i) => [s, i]));
        const frente = lista.filter((p) => pos.has(p.codigo_sku)).sort((a, b) => pos.get(a.codigo_sku) - pos.get(b.codigo_sku));
        if (frente.length) lista = frente.concat(lista.filter((p) => !pos.has(p.codigo_sku)));
      }
    }
    return lista;
  }
  /** Qual lista de destaques vale para o filtro: departamento > objetivo > vitrine inicial ("todos"). */
  function chaveDestaque(f = {}) { return f.categoria ? f.categoria : f.objetivo ? 'obj:' + f.objetivo : 'todos'; }
  function destaquesDe(chave) { const d = window.LOJA_DESTAQUES || {}; return Array.isArray(d[chave]) ? d[chave].map(String) : []; }

  function contagemPorCategoria() {
    const c = {};
    for (const p of produtos) c[p.categoria] = (c[p.categoria] || 0) + 1;
    return c;
  }

  /** Subcategorias de um departamento, ordenadas por quantidade de produtos. */
  const _subs = {};
  for (const p of produtos) { (_subs[p.categoria] ||= {}); _subs[p.categoria][p.subcategoria] = (_subs[p.categoria][p.subcategoria] || 0) + 1; }
  const subcategorias = (cat) => Object.entries(_subs[cat] || {}).sort((a, b) => b[1] - a[1]).map(([s]) => s);

  const faixaPrecos = () => {
    const v = produtos.map(precoBase);
    return { min: Math.floor(Math.min(...v)), max: Math.ceil(Math.max(...v)) };
  };

  window.LojaCatalog = { produtos, porId, descricaoAuto, filtrar, chaveDestaque, destaquesDe, MAX_DESTAQUES: 16, buscar, corrigir, SINONIMOS, precoDe, precoBase, rotuloPeso, brl, imgUrl, norm, catBySlug, contagemPorCategoria, faixaPrecos, subcategorias, info: window.LOJA_CATALOGO_INFO || null };
})();
