/* ==========================================================================
   LOJA — Interface (vitrine, busca, carrinho, favoritos, checkout, animações)
   Depende de: config.js → data/produtos.js → catalog.js
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.LOJA_CONFIG;
  const C = window.LojaCatalog;
  const { brl, imgUrl, rotuloPeso, precoDe, precoBase } = C;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
  const waLink = (msg) => `https://wa.me/${CFG.loja.whatsapp}?text=${encodeURIComponent(msg)}`;
  // Vitrine: quantos produtos por vez = 4 fileiras no PC (4 por linha → 16); no tablet/celular 12.
  // A vitrine NÃO cresce sozinha ao rolar (pedido do usuário, 25/11/2026): quem só passa por ela chega logo no Atacado.
  function tamPagina() {
    const cols = getComputedStyle($('#grid')).gridTemplateColumns.split(' ').filter(Boolean).length;
    return cols >= 4 ? cols * 4 : 12;
  }

  /* ---------- Armazenamento local seguro ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('loja:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('loja:' + k, JSON.stringify(v)); } catch { /* modo privado */ } }
  };

  /* ---------- Estado ---------- */
  const faixa = C.faixaPrecos();
  const state = {
    f: { q: '', categoria: '', subcategoria: '', restricoes: [], objetivo: '', selo: '', min: null, max: null, comFoto: false, ordem: 'destaque' },
    lista: [], shown: 0,
    corrigida: null,                        // busca sem resultado corrigida automaticamente ("colagem" → "colágeno")
    cart: store.get('cart', []),           // [{ key, id, g, qty }]
    fav: new Set(store.get('fav', [])),
    weight: {}                              // id -> gramas selecionadas no card
  };

  /* ======================================================================
     Links institucionais
     ====================================================================== */
  const hrefs = {
    google: CFG.loja.googleUrl,
    instagram: `https://www.instagram.com/${CFG.loja.instagram}/`,
    whatsapp: waLink(`Olá, ${CFG.loja.nomeCurto}! Vim pelo site e gostaria de atendimento.`),
    telefone: `tel:+${CFG.loja.telefone}`,
    rota: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${CFG.loja.endereco}, ${CFG.loja.cidade} ${CFG.loja.uf}`)}`
  };
  $$('[data-href]').forEach((a) => { a.href = hrefs[a.dataset.href]; if (a.dataset.href !== 'telefone') { a.target = '_blank'; a.rel = 'noopener'; } });

  /* Textos da loja vindos do config.js (nome, cidade, contatos, horários): <span data-cfg="chave"> */
  (function textosDaLoja() {
    const L = CFG.loja;
    const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const horarios = DIAS.map((d, i) => `<b>${d}</b> ${L.horarios?.[i] ? L.horarios[i].join(' às ') : 'Fechado'}`).join('<br>');
    const valores = {
      ...L,
      cidadeUf: [L.cidade, L.uf].filter(Boolean).join('/'),
      enderecoCompleto: [L.endereco, L.bairro, [L.cidade, L.uf].filter(Boolean).join(' – '), L.cep && `CEP ${L.cep}`].filter(Boolean).join(', ')
    };
    $$('[data-cfg]').forEach((el) => {
      const k = el.dataset.cfg;
      if (k === 'horariosHtml') el.innerHTML = horarios;
      else if (valores[k] != null && valores[k] !== '') el.textContent = valores[k];
    });
    document.title = `${L.nome}${L.subtitulo ? ' — ' + L.subtitulo : ''}`;
  })();
  $('#year').textContent = new Date().getFullYear();

  /* ======================================================================
     Estrutura: nav, mega menu, categorias, objetivos, avaliações, instagram
     ====================================================================== */
  const counts = C.contagemPorCategoria();

  $('#nav-links').innerHTML = CFG.categorias.slice(0, 7).map((c) => `<li><a href="#vitrine" data-cat="${c.slug}">${esc(c.curto)}</a></li>`).join('');
  $('#mega-inner').innerHTML = CFG.categorias.map((c) => `
    <a class="mega__cat" href="#vitrine" data-cat="${c.slug}">
      <img src="${imgUrl(c.img, 120, 120)}" alt="" loading="lazy">
      <span><b>${esc(c.nome)}</b><small>${esc(C.subcategorias(c.slug).slice(0, 4).join(' · '))}</small><em>${(counts[c.slug] || 0).toLocaleString('pt-BR')} produtos</em></span>
    </a>`).join('');
  $('#footer-cats').innerHTML = CFG.categorias.slice(0, 6).map((c) => `<li><a href="#vitrine" data-cat="${c.slug}">${esc(c.curto)}</a></li>`).join('');
  $('#menu-items').innerHTML = CFG.categorias.map((c) => `
    <button class="menu-cat" data-cat="${c.slug}" data-close><img src="${imgUrl(c.img, 100, 100)}" alt="" loading="lazy">${esc(c.nome)}${icon('right')}</button>`).join('');

  $('#cat-rail').innerHTML = CFG.categorias.map((c) => `
    <button class="cat" data-cat="${c.slug}" aria-label="${esc(c.nome)}">
      <span class="cat__img"><img src="${imgUrl(c.img, 280, 280)}" alt="" loading="lazy"><span class="cat__n">${counts[c.slug] || 0}</span></span>
      <b>${esc(c.nome)}</b>
    </button>`).join('');

  $('#goals').innerHTML = CFG.objetivos.map((o, i) => `
    <button class="goal reveal-stagger" data-goal="${o.id}">
      <img src="${imgUrl(o.img, 640, 800)}" alt="" loading="lazy">
      <span class="goal__n">0${i + 1}</span>
      <h3>${esc(o.nome)}</h3>
      <p>${esc(o.texto)}</p>
      <span class="goal__cta">Ver produtos ${icon('arrow')}</span>
    </button>`).join('');

  const avColors = ['#1D4ED8', '#2563EB', '#3B82F6'];
  $('#reviews').innerHTML = CFG.avaliacoes.map((r, i) => `
    <article class="review reveal-stagger">
      <div class="review__top">
        <span class="avatar" style="background:${avColors[i % 3]}">${esc(r.nome[0])}</span>
        <div><b>${esc(r.nome)}</b><small><span class="stars">${icon('star').repeat(5)}</span> no Google</small></div>
      </div>
      <p>${esc(r.texto)}</p>
      <span class="review__g" aria-hidden="true">G</span>
    </article>`).join('');

  // Posts do Instagram (config.js -> instagramPosts: [[imagem, titulo, texto, etiqueta], ...]); vazio = seção escondida
  const posts = CFG.instagramPosts || [];
  $('#insta').innerHTML = posts.map(([img, t, d, tag], i) => `
    <a class="ipost reveal-stagger" href="${hrefs.instagram}" target="_blank" rel="noopener" aria-label="${esc(t)} no Instagram">
      <img src="${imgUrl(img, i === 0 ? 720 : 360, i === 0 ? 720 : 360)}" alt="" loading="lazy">
      <span class="ipost__tag">${tag}</span>
      <span class="ipost__icon">${icon('insta')}</span>
      <span class="ipost__over"><b>${esc(t)}</b><small>${esc(d)}</small></span>
    </a>`).join('');
  /* Modelo: seções sem conteúdo no config.js ficam escondidas (categorias, objetivos, avaliações, Instagram) */
  [['#categorias', CFG.categorias], ['#objetivos', CFG.objetivos], ['#avaliacoes', CFG.avaliacoes], ['#instagram', posts]]
    .forEach(([sel, lista]) => { if (!lista?.length) { const s = $(sel); if (s) s.hidden = true; $$(`a[href="${sel}"]`).forEach((a) => a.closest('li')?.remove()); } });

  /* ======================================================================
     Filtros
     ====================================================================== */
  $('#f-restricoes').innerHTML = CFG.restricoes.map((r) => `<button class="chip" data-restr="${r.id}">${esc(r.nome)}</button>`).join('');
  $('#f-categorias').innerHTML = `<li><button data-fcat="" class="is-on">Todos os departamentos <small>${C.produtos.length}</small></button></li>` +
    CFG.categorias.map((c) => `<li><button data-fcat="${c.slug}">${esc(c.curto)} <small>${counts[c.slug] || 0}</small></button></li>`).join('');

  const fMin = $('#f-min'), fMax = $('#f-max');
  [fMin, fMax].forEach((r) => { r.min = faixa.min; r.max = faixa.max; r.step = 1; });
  fMin.value = faixa.min; fMax.value = faixa.max;

  function paintRange() {
    let a = +fMin.value, b = +fMax.value;
    if (a > b - 2) { if (document.activeElement === fMin) fMin.value = a = b - 2; else fMax.value = b = a + 2; }
    const pa = ((a - faixa.min) / (faixa.max - faixa.min)) * 100, pb = ((b - faixa.min) / (faixa.max - faixa.min)) * 100;
    $('#range-fill').style.cssText = `left:${pa}%;right:${100 - pb}%`;
    $('#f-min-v').textContent = brl(a); $('#f-max-v').textContent = brl(b);
  }
  let rangeT;
  [fMin, fMax].forEach((r) => r.addEventListener('input', () => {
    paintRange();
    clearTimeout(rangeT);
    rangeT = setTimeout(() => {
      state.f.min = +fMin.value > faixa.min ? +fMin.value : null;
      state.f.max = +fMax.value < faixa.max ? +fMax.value : null;
      aplicar();
    }, 140);
  }));
  paintRange();

  function setCategoria(slug) {
    state.f.categoria = slug || '';
    state.f.subcategoria = '';
    aplicar();
  }

  function syncFiltrosUI() {
    const f = state.f;
    $$('[data-restr]').forEach((b) => b.classList.toggle('is-on', f.restricoes.includes(b.dataset.restr)));
    $$('[data-comfoto]').forEach((b) => { b.classList.toggle('is-on', f.comFoto); b.setAttribute('aria-pressed', f.comFoto); });
    $$('[data-fcat]').forEach((b) => b.classList.toggle('is-on', b.dataset.fcat === f.categoria));
    $$('.cat').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === f.categoria));
    $$('.goal').forEach((b) => b.classList.toggle('is-active', b.dataset.goal === f.objetivo));
    $('#sort').value = f.ordem;

    const cat = C.catBySlug[f.categoria];
    $('#f-sub-wrap').hidden = !cat;
    if (cat) $('#f-sub').innerHTML = C.subcategorias(cat.slug).map((s) => `<button class="chip ${s === f.subcategoria ? 'is-on' : ''}" data-sub="${esc(s)}">${esc(s)}</button>`).join('');

    // chips de filtros ativos
    const chips = [];
    if (f.q) chips.push(['q', `“${f.q}”`]);
    if (cat) chips.push(['categoria', cat.curto]);
    if (f.subcategoria) chips.push(['subcategoria', f.subcategoria]);
    if (f.objetivo) chips.push(['objetivo', CFG.objetivos.find((o) => o.id === f.objetivo).nome]);
    if (f.selo) chips.push(['selo', 'Seleção']);
    f.restricoes.forEach((r) => chips.push(['restr:' + r, CFG.restricoes.find((x) => x.id === r).nome]));
    if (f.min != null || f.max != null) chips.push(['preco', `${brl(f.min ?? faixa.min)} – ${brl(f.max ?? faixa.max)}`]);
    if (f.comFoto) chips.push(['comFoto', 'Só com foto']);
    $('#active-filters').innerHTML = chips.length ? chips.map(([k, t]) => `<button class="chip chip--x" data-unset="${k}">${esc(t)} ${icon('x')}</button>`).join('') +
      `<button class="chip chip--x" data-unset="all" style="background:transparent;text-decoration:underline">Limpar tudo</button>` : '';
    const n = chips.length;
    $('#filters-count').hidden = !n; $('#filters-count').textContent = n;

    // título dinâmico
    let title = 'Nossos <em>destaques</em>';
    if (f.q) title = `Resultados para <em>“${esc(state.corrigida ? state.corrigida.q : f.q)}”</em>`;
    else if (f.objetivo) title = `<em>${esc(CFG.objetivos.find((o) => o.id === f.objetivo).nome)}</em>`;
    else if (cat) title = f.subcategoria ? `${esc(cat.curto)} · <em>${esc(f.subcategoria)}</em>` : `<em>${esc(cat.nome)}</em>`;
    else if (f.restricoes.length === 1 && f.restricoes[0] === 'granel') title = 'Tudo <em>a granel</em>';
    $('#vitrine-title').innerHTML = title;
  }

  function limparFiltros() {
    Object.assign(state.f, { q: '', categoria: '', subcategoria: '', restricoes: [], objetivo: '', selo: '', min: null, max: null, comFoto: false, ordem: 'destaque' });
    fMin.value = faixa.min; fMax.value = faixa.max; paintRange();
    $('#search-input').value = '';
    aplicar();
  }

  /* ======================================================================
     Vitrine: render paginado + scroll infinito (escala para +2.000 itens)
     ====================================================================== */
  const grid = $('#grid');

  const alturaHeader = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 120;
  const topoVitrine = () => $('#vitrine').getBoundingClientRect().top + scrollY - alturaHeader() - 10;

  function aplicar() {
    // Se o cliente já rolou para dentro da vitrine, a lista nova (bem menor) encolheria a página
    // e o navegador o jogaria para o rodapé. Então voltamos ao início dos produtos filtrados.
    const dentroDaVitrine = scrollY > topoVitrine() + 40;
    const comSelo = (l) => (state.f.selo ? l.filter((p) => p._selos.includes(state.f.selo)) : l);
    let lista = comSelo(C.filtrar(state.f));
    // Busca sem resultado por erro de digitação: mostra os produtos da palavra mais parecida e avisa
    state.corrigida = null;
    if (!lista.length && state.f.q) {
      const c = C.corrigir(state.f.q);
      const alt = c ? comSelo(C.filtrar({ ...state.f, q: c.q })) : [];
      if (alt.length) { state.corrigida = { de: state.f.q, q: c.q }; lista = alt; }
    }
    const aviso = $('#busca-corrigida');
    aviso.hidden = !state.corrigida;
    if (state.corrigida) aviso.innerHTML = `${icon('search')}<span>Não encontramos <b>“${esc(state.corrigida.de)}”</b>. Mostrando resultados para <b>“${esc(state.corrigida.q)}”</b>.</span>`;
    state.lista = lista; state.shown = 0;
    grid.innerHTML = '';
    syncFiltrosUI();
    $('#f-total').textContent = lista.length;
    $('#empty').hidden = lista.length > 0;
    renderMais();
    if (dentroDaVitrine) scrollTo({ top: topoVitrine(), behavior: 'instant' });
  }

  function renderMais() {
    const tam = tamPagina();
    if (!state.shown) state.primeira = tam;
    const next = state.lista.slice(state.shown, state.shown + tam);
    const frag = document.createDocumentFragment();
    const tmp = document.createElement('div');
    tmp.innerHTML = next.map((p, i) => cardHTML(p, i)).join('');
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    grid.appendChild(frag);
    state.shown += next.length;
    atualizarMais();
  }
  function atualizarMais() {
    const total = state.lista.length, faltam = total - state.shown;
    $('#more').hidden = total === 0;
    $('#more-info').textContent = `Exibindo ${state.shown.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} produto${total === 1 ? '' : 's'}`;
    $('#more-bar').style.width = total ? `${(state.shown / total) * 100}%` : '0';
    $('#more-btn').hidden = faltam <= 0;
    $('#more-btn').textContent = `Ver mais produtos (${faltam.toLocaleString('pt-BR')} restante${faltam === 1 ? '' : 's'})`;
    $('#less-btn').hidden = state.shown <= (state.primeira || tamPagina());
  }

  /* Mídia do produto: foto própria, ou arte de embalagem única (nome, ícone e cor do departamento) */
  const ARTE_ICONE = { castanhas: 'leaf', graos: 'wheat', farinhas: 'wheat', temperos: 'leaf', suplementos: 'capsule', chas: 'cup', restricoes: 'wheat',
    desidratadas: 'leaf', pastas: 'jar', bemestar: 'drop', mercearia: 'jar', kits: 'gift' };
  function midia(p, w, cls = '', alt = '') {
    if (p._img) {
      const src = imgUrl(p._img, w, w), full = imgUrl(p._img, 900, 900);
      return `<img class="${cls}" src="${src}"${src !== full ? ` data-full="${full}"` : ''} alt="${esc(alt)}" loading="lazy" decoding="async">`;
    }
    const nome = p.nome.replace(/\s*\d+[\d,.]*\s*(g|kg|ml|mg|L|caps|cápsulas|un)\b.*$/i, '').trim() || p.nome;
    const mini = w <= 160;
    return `<span class="arte arte--${p.categoria} ${mini ? 'arte--mini' : ''} ${cls}" role="img" aria-label="${esc(p.nome)}">
      <i class="arte__icone"><svg><use href="#i-${ARTE_ICONE[p.categoria] || 'leaf'}"/></svg></i>
      ${mini ? '' : `<b class="arte__nome">${esc(nome)}</b><small class="arte__info">${esc(p.conteudo || (p._granel ? 'A granel' : p.subcategoria))}</small><em class="arte__cod">cód. ${esc(p.codigo_sku)}</em>`}
    </span>`;
  }

  const seloTag = { 'mais-vendido': ['tag--best', 'Mais vendido'], novidade: ['tag--new', 'Novidade'], oferta: ['tag--sale', 'Oferta'] };
  const restrCurta = { 'sem-gluten': 'Sem glúten', 'sem-lactose': 'Sem lactose', vegano: 'Vegano', 'zero-acucar': 'Zero açúcar', light: 'Light', granel: 'Granel' };

  function badgesHTML(p) {
    const tags = p._selos.map((s) => seloTag[s]).filter(Boolean).map(([c, t]) => `<span class="tag ${c}">${t}</span>`);
    if (p._granel && tags.length < 2) tags.push('<span class="tag tag--new">A granel</span>');
    if (p._tags.includes('zero-acucar') && tags.length < 2) tags.push('<span class="tag tag--diet">Zero açúcar</span>');
    if (p._tags.includes('sem-gluten') && tags.length < 2) tags.push('<span class="tag tag--diet">Sem glúten</span>');
    if (p.preco_de) tags.unshift(`<span class="tag tag--sale">-${Math.round((1 - p.preco / p.preco_de) * 100)}%</span>`);
    return `<div class="pcard__badges">${[...new Set(tags)].slice(0, 2).join('')}</div>`;
  }

  function pesoInicial(p) {
    if (!p._granel) return null;
    return state.weight[p.id] ?? (p._variacoes[1] ?? p._variacoes[0]);
  }

  // Granel: além dos pesos prontos (100g, 250g…), o cliente escolhe "outra quantidade" em gramas (mínimo 100 g)
  const GRAMAS_MIN = CFG.loja.granelGramasMin || 100, GRAMAS_MAX = CFG.loja.granelGramasMax || 50000;
  /** Lê as gramas digitadas: inteiro entre o mínimo e o máximo; senão null. */
  function lerGramas(txt) {
    const n = Math.round(+String(txt).replace(/\D/g, ''));
    return n >= GRAMAS_MIN && n <= GRAMAS_MAX ? n : null;
  }
  function weightsHTML(p, g) {
    const v = p._variacoes, outro = g != null && !v.includes(g);   // peso personalizado vira mais um botão
    const n = v.length + (outro ? 1 : 0), i = outro ? v.length : v.indexOf(g);
    return `<div class="weights" role="radiogroup" aria-label="Peso" style="--n:${n};--i:${i}">
      <span class="pill" aria-hidden="true"></span>
      ${v.map((w) => `<button role="radio" aria-checked="${w === g}" class="${w === g ? 'is-on' : ''}" data-w="${w}">${rotuloPeso(w)}</button>`).join('')}
      ${outro ? `<button role="radio" aria-checked="true" class="is-on" data-w="${g}" data-wpersonal title="Quantidade personalizada">${rotuloPeso(g)}</button>` : ''}
    </div>`;
  }
  /** Guarda o peso escolhido na espiada e atualiza o cartão do produto na vitrine (mostra o peso personalizado). */
  function lembrarPeso(p, g) {
    state.weight[p.id] = g;
    const card = grid.querySelector(`.pcard[data-id="${CSS.escape(p.id)}"]`); if (!card) return;
    card.dataset.g = g;
    const w = $('.weights', card); if (w) w.outerHTML = weightsHTML(p, g);
    const pr = $('.pcard__foot .price', card); if (pr) pr.outerHTML = priceHTML(p, g);
  }
  /** Marca o botão de peso escolhido e move o fundo verde até ele. */
  function marcarPeso(btn) {
    const wrap = btn.parentElement, bs = $$('[data-w]', wrap);
    wrap.style.setProperty('--i', bs.indexOf(btn));
    bs.forEach((b) => { const on = b === btn; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
  }

  function priceHTML(p, g) {
    const v = precoDe(p, g);
    const de = p.preco_de ? (p._granel ? precoDe({ ...p, preco: p.preco_de }, g) : p.preco_de) : null;
    const sub = p._granel ? `${brl(p.preco)}/kg` : esc(p.conteudo || 'unidade');
    return `<div class="price">${de ? `<s>${brl(de)}</s>` : ''}<b data-price>${brl(v)}</b><small>${sub}</small></div>`;
  }

  function cardHTML(p, i) {
    const g = pesoInicial(p);
    const fav = state.fav.has(p.id);
    const hasAlt = p._imgAlt && p._imgAlt !== p._img;
    return `
    <article class="pcard is-new" style="--i:${i}" data-id="${esc(p.id)}" data-g="${g ?? ''}">
      <div class="pcard__media ${hasAlt ? 'has-alt' : ''}" data-qv>
        ${midia(p, 480, 'main', p.nome)}
        ${hasAlt ? `<img class="alt" src="${imgUrl(p._imgAlt, 480, 480)}" alt="" loading="lazy" decoding="async">` : ''}
        ${badgesHTML(p)}
        <button class="pcard__quick" data-qv>${icon('eye')}Espiada rápida</button>
      </div>
      <button class="pcard__fav ${fav ? 'is-on' : ''}" data-fav aria-pressed="${fav}" aria-label="Favoritar ${esc(p.nome)}">${icon('heart')}</button>
      <div class="pcard__body">
        <div class="pcard__meta"><span>${esc(p.subcategoria)}</span><span class="sku">${esc(p.codigo_sku)}</span></div>
        <h3 class="pcard__name" data-qv>${esc(p.nome)}</h3>
        <div class="pcard__restr">${p._tags.filter((t) => t !== 'granel').slice(0, 3).map((t) => `<span>${restrCurta[t]}</span>`).join('')}</div>
        ${p._granel ? weightsHTML(p, g) + `<button class="weights__outra" type="button" data-outra>Outra quantidade</button>` : `<div class="unit-info">${icon('box')} ${esc(p.conteudo || 'Unidade')}</div>`}
        <div class="pcard__foot">
          ${priceHTML(p, g)}
          <button class="add" data-add aria-label="Adicionar ${esc(p.nome)} ao carrinho">${icon('plus')}<span class="ok">${icon('check')}</span></button>
        </div>
      </div>
    </article>`;
  }

  // Delegação de eventos da vitrine
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.pcard'); if (!card) return;
    const p = C.porId.get(card.dataset.id);
    const wBtn = e.target.closest('[data-w]');
    if (wBtn) {
      const g = +wBtn.dataset.w;
      card.dataset.g = g; state.weight[p.id] = g;
      marcarPeso(wBtn);
      const foot = $('.pcard__foot', card);
      foot.querySelector('.price').outerHTML = priceHTML(p, g);
      const b = $('[data-price]', foot); b.classList.add('flip');
      return;
    }
    if (e.target.closest('[data-add]')) {
      const btn = e.target.closest('[data-add]');
      addToCart(p, card.dataset.g ? +card.dataset.g : null, 1, $('.main', card));
      btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 1200);
      return;
    }
    if (e.target.closest('[data-fav]')) return toggleFav(p, e.target.closest('[data-fav]'));
    if (e.target.closest('[data-outra]')) return openQuickView(p, card.dataset.g ? +card.dataset.g : null, { outra: true });
    if (e.target.closest('[data-qv]')) return openQuickView(p, card.dataset.g ? +card.dataset.g : null);
  });

  $('#more-btn').addEventListener('click', renderMais);
  // "Mostrar menos": volta para a 1ª leva e deixa a pessoa no fim da vitrine (com o Atacado logo abaixo)
  $('#less-btn').addEventListener('click', () => {
    const n = state.primeira || tamPagina();
    [...grid.querySelectorAll('.pcard')].slice(n).forEach((c) => c.remove());
    state.shown = Math.min(n, state.lista.length);
    atualizarMais();
    $('#more').scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  let indoParaAncora = false; // usado por irParaSecao (links internos)

  /* ---------- Links internos (#atacado, #sobre…): chegam exatamente na seção ---------- */
  function irParaSecao(alvo, suave = true) {
    indoParaAncora = true;
    // 'instant' (e não 'auto'): o CSS tem scroll-behavior:smooth, e 'auto' herdava a rolagem suave
    alvo.scrollIntoView({ behavior: suave && !reduz() ? 'smooth' : 'instant', block: 'start' });
    let fim = 0, ajustes = 0;
    const conferir = () => {
      clearTimeout(fim);
      fim = setTimeout(() => {
        // conteúdo carregado no caminho (fotos, vitrine) pode ter movido a seção: corrige sem animação
        const topo = alvo.getBoundingClientRect().top, esperado = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        // salto imediato (se fosse suave, a vitrine voltaria a carregar produtos no caminho) e confere de novo até assentar
        if (Math.abs(topo - esperado) > 6 && ajustes++ < 5) { alvo.scrollIntoView({ behavior: 'instant', block: 'start' }); conferir(); return; }
        window.removeEventListener('scroll', conferir);
        setTimeout(() => { indoParaAncora = false; }, 400);
      }, 180);
    };
    window.addEventListener('scroll', conferir, { passive: true });
    conferir();
  }
  const reduz = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1)); if (!id) return;
    const alvo = document.getElementById(id); if (!alvo || alvo.closest('.modal, .drawer')) return;
    e.preventDefault();
    if (a.closest('.drawer')) closeAll(true);
    history.pushState(null, '', '#' + id);
    irParaSecao(alvo);
  });
  // abriu o site já com #atacado (link compartilhado): espera montar a vitrine e vai direto
  if (location.hash.length > 1) {
    const alvo = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (alvo && !alvo.closest('.modal, .drawer')) setTimeout(() => irParaSecao(alvo, false), 60);
  }

  /* ---------- Eventos globais de filtro ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const catEl = t.closest('[data-cat]');
    if (catEl) { e.preventDefault(); closeMega(); closeAll(); setCategoria(catEl.dataset.cat); goVitrine(); return; }
    const goal = t.closest('[data-goal]');
    if (goal) { state.f.objetivo = state.f.objetivo === goal.dataset.goal ? '' : goal.dataset.goal; aplicar(); goVitrine(); return; }
    const fcat = t.closest('[data-fcat]');
    if (fcat) { setCategoria(fcat.dataset.fcat); return; }
    const sub = t.closest('[data-sub]');
    if (sub) { state.f.subcategoria = state.f.subcategoria === sub.dataset.sub ? '' : sub.dataset.sub; aplicar(); return; }
    const r = t.closest('[data-restr]');
    if (r) { const id = r.dataset.restr, a = state.f.restricoes; state.f.restricoes = a.includes(id) ? a.filter((x) => x !== id) : [...a, id]; aplicar(); return; }
    if (t.closest('[data-comfoto]')) { state.f.comFoto = !state.f.comFoto; aplicar(); return; }
    const fr = t.closest('[data-filter-restr]');
    if (fr) { e.preventDefault(); closeAll(true); limparFiltros(); state.f.restricoes = [fr.dataset.filterRestr]; aplicar(); goVitrine(); return; }
    const un = t.closest('[data-unset]');
    if (un) {
      const k = un.dataset.unset;
      if (k === 'all') return limparFiltros();
      if (k.startsWith('restr:')) state.f.restricoes = state.f.restricoes.filter((x) => x !== k.slice(6));
      else if (k === 'preco') { state.f.min = state.f.max = null; fMin.value = faixa.min; fMax.value = faixa.max; paintRange(); }
      else if (k === 'q') { state.f.q = ''; $('#search-input').value = ''; }
      else if (k === 'categoria') { state.f.categoria = ''; state.f.subcategoria = ''; }
      else if (k === 'comFoto') state.f.comFoto = false;
      else state.f[k] = '';
      aplicar();
    }
  });
  $('#sort').addEventListener('change', (e) => { state.f.ordem = e.target.value; aplicar(); });
  $('#f-clear').addEventListener('click', limparFiltros);
  $('#empty-clear').addEventListener('click', limparFiltros);
  $('[data-wa="busca"]').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(waLink(`Olá, ${CFG.loja.nomeCurto}! Procurei por "${state.f.q || 'um produto'}" no site e não encontrei. Vocês têm?`), '_blank', 'noopener');
  });

  function goVitrine() {
    const top = topoVitrine();
    if (Math.abs(top - scrollY) > 80) scrollTo({ top, behavior: 'smooth' });
  }

  /* ======================================================================
     Busca instantânea com autocomplete
     ====================================================================== */
  const sInput = $('#search-input'), sPanel = $('#search-results');
  let sIdx = -1, sItems = [];
  const hl = (txt, q) => {
    const termos = C.norm(q).split(/\s+/).filter(Boolean); if (!termos.length) return esc(txt);
    const n = C.norm(txt); const marks = new Array(txt.length).fill(false);
    termos.forEach((t) => { let i = n.indexOf(t); while (i > -1) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = n.indexOf(t, i + 1); } });
    let out = '', open = false;
    [...txt].forEach((ch, i) => { if (marks[i] && !open) { out += '<mark>'; open = true; } if (!marks[i] && open) { out += '</mark>'; open = false; } out += esc(ch); });
    return out + (open ? '</mark>' : '');
  };

  function renderSugestoes() {
    const q = sInput.value.trim();
    if (!q) {
      const pop = C.filtrar({ ordem: 'destaque' }).slice(0, 4);
      sItems = pop;
      sPanel.innerHTML = `<div class="sr-label">Buscas populares</div><div class="sr-chips">${(CFG.buscasPopulares || CFG.categorias.map((c) => c.curto.toLowerCase()).slice(0, 6)).map((t) => `<button class="chip" data-sq="${t}">${t}</button>`).join('')}</div>
        <div class="sr-label">Mais vendidos</div>${pop.map((p, i) => srItem(p, '', i)).join('')}`;
    } else {
      let res = C.buscar(q), corr = null;
      if (!res.length) { corr = C.corrigir(q); if (corr) res = C.buscar(corr.q); }
      sItems = res.slice(0, 6);
      const quis = corr ? `<div class="sr-quis">Você quis dizer <button type="button" class="sr-quis__btn" data-sq="${esc(corr.q)}">${esc(corr.q)}</button>?</div>` : '';
      const cats = CFG.categorias.filter((c) => C.norm(c.nome).includes(C.norm(q))).slice(0, 3);
      sPanel.innerHTML = quis + (cats.length ? `<div class="sr-label">Departamentos</div><div class="sr-chips">${cats.map((c) => `<button class="chip" data-cat="${c.slug}">${esc(c.nome)}</button>`).join('')}</div>` : '') +
        (sItems.length ? `<div class="sr-label">Produtos</div>${sItems.map((p, i) => srItem(p, corr ? corr.q : q, i)).join('')}<a class="sr-all" href="#vitrine" data-sall>Ver todos os ${res.length} resultados ${icon('arrow')}</a>`
          : `<div class="sr-empty">Nenhum produto para “${esc(q)}”. Busque por nome, benefício (ex.: <b>imunidade</b>) ou código (ex.: <b>CAS-0101</b>).</div>`);
    }
    sIdx = -1; sPanel.hidden = false;
  }
  const srItem = (p, q, i) => `<div class="sr-item" role="option" data-sid="${esc(p.id)}" data-i="${i}">
      ${midia(p, 96)}
      <div><b>${hl(p.nome, q)}</b><small>${esc(p.codigo_sku)} · ${esc(p._cat ? p._cat.curto : '')}</small></div>
      <span class="sr-price">${p._granel ? 'a partir de ' : ''}${brl(precoBase(p))}</span></div>`;

  function buscarNaVitrine(q) {
    state.f.q = q.trim(); state.f.ordem = state.f.q ? 'relevancia' : 'destaque';
    sPanel.hidden = true; sInput.blur(); aplicar(); goVitrine();
  }
  let sT;
  sInput.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(renderSugestoes, 90); });
  sInput.addEventListener('focus', renderSugestoes);
  sInput.addEventListener('keydown', (e) => {
    const rows = $$('.sr-item', sPanel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('is-active', i === sIdx)); rows[sIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sIdx > -1 && sItems[sIdx]) { sPanel.hidden = true; openQuickView(sItems[sIdx]); } else buscarNaVitrine(sInput.value);
    } else if (e.key === 'Escape') { sPanel.hidden = true; sInput.blur(); }
  });
  sPanel.addEventListener('mousedown', (e) => e.preventDefault());
  sPanel.addEventListener('click', (e) => {
    const it = e.target.closest('[data-sid]'); if (it) { sPanel.hidden = true; return openQuickView(C.porId.get(it.dataset.sid)); }
    const sq = e.target.closest('[data-sq]'); if (sq) { sInput.value = sq.dataset.sq; return buscarNaVitrine(sq.dataset.sq); }
    if (e.target.closest('[data-sall]')) { e.preventDefault(); buscarNaVitrine(sInput.value); }
  });
  sInput.addEventListener('blur', () => setTimeout(() => { sPanel.hidden = true; }, 120));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); sInput.focus(); }
  });

  /* ======================================================================
     Mega menu
     ====================================================================== */
  const mega = $('#mega'), megaBtn = $('#mega-toggle');
  function openMega() { mega.hidden = false; mega.classList.add('is-open'); megaBtn.setAttribute('aria-expanded', 'true'); }
  function closeMega() { mega.hidden = true; mega.classList.remove('is-open'); megaBtn.setAttribute('aria-expanded', 'false'); }
  megaBtn.addEventListener('click', () => (mega.hidden ? openMega() : closeMega()));
  let megaT;
  [megaBtn, mega].forEach((el) => {
    el.addEventListener('mouseenter', () => { clearTimeout(megaT); if (matchMedia('(hover:hover)').matches) openMega(); });
    el.addEventListener('mouseleave', () => { megaT = setTimeout(closeMega, 220); });
  });

  /* ======================================================================
     Drawers, modais e bottom sheet
     ====================================================================== */
  const scrim = $('#scrim');
  let lastFocus = null;
  function openPanel(id) {
    closeAll(true);
    const el = document.getElementById(id); if (!el) return;
    lastFocus = document.activeElement;
    if (id === 'drawer-cart') renderCart();
    if (id === 'drawer-fav') renderFav();
    if (id === 'modal-conta') window.LojaConta?.render();
    if (id === 'modal-rapido') abrirRapido();
    el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false');
    scrim.classList.add('is-on'); document.body.classList.add('lock');
    setTimeout(() => $('[data-close], button, a', el)?.focus({ preventScroll: true }), 60);
  }
  function closeAll(silent) {
    window.LojaSeoProduto?.restaurar();
    $$('.drawer.is-open, .modal.is-open, .filters.is-open').forEach((el) => { el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); });
    scrim.classList.remove('is-on'); document.body.classList.remove('lock');
    if (!silent && lastFocus) lastFocus.focus?.({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); openPanel(o.dataset.open); return; }
    const c = e.target.closest('[data-close]'); if (c && c.closest('.drawer, .modal, .filters')) { closeAll(); }
    if (e.target.classList.contains('modal')) closeAll();
    if (e.target.closest('[data-action="focus-search"]')) { scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => sInput.focus(), 350); }
  });
  scrim.addEventListener('click', () => closeAll());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); closeMega(); } });

  /* ======================================================================
     Toasts + animação "voar para o carrinho"
     ====================================================================== */
  function toast(html, opts = {}) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html;
    if (opts.action) { const b = document.createElement('button'); b.textContent = opts.action; b.onclick = () => { opts.onAction(); t.remove(); }; t.appendChild(b); }
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 360); }, opts.ms || 2800);
  }
  function flyToCart(imgEl) {
    const target = [...$$('.icon-link--cart, .bottom-nav [data-open="drawer-cart"]')].find((el) => el.offsetParent !== null);
    if (!imgEl || !target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = imgEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    let f;
    if (imgEl.tagName === 'IMG') { f = document.createElement('img'); f.src = imgEl.currentSrc || imgEl.src; }
    else { f = document.createElement('span'); f.style.background = getComputedStyle(imgEl).backgroundImage || 'var(--terra)'; }
    f.className = 'fly';
    f.style.left = `${a.left + a.width / 2 - 30}px`; f.style.top = `${a.top + a.height / 2 - 30}px`;
    document.body.appendChild(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 120}px) scale(.8)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: .3 }
    ], { duration: 780, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => f.remove();
  }

  /* ======================================================================
     Carrinho
     ====================================================================== */
  const keyOf = (id, g) => `${id}|${g ?? 'un'}`;
  const linePrice = (l) => { const p = C.porId.get(l.id); return p ? precoDe(p, l.g) * l.qty : 0; };
  const subtotal = () => state.cart.reduce((s, l) => s + linePrice(l), 0);
  const cartCount = () => state.cart.reduce((s, l) => s + l.qty, 0);
  state.cart = state.cart.filter((l) => C.porId.has(l.id));

  function saveCart() { store.set('cart', state.cart); updateBadges(); }
  function updateBadges(bump) {
    $$('[data-count="cart"]').forEach((b) => { const n = cartCount(); b.hidden = !n; b.textContent = n; if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } });
    $$('[data-count="fav"]').forEach((b) => { const n = state.fav.size; b.hidden = !n; b.textContent = n; });
  }

  function addToCart(p, g, qty = 1, imgEl) {
    const key = keyOf(p.id, g);
    const l = state.cart.find((x) => x.key === key);
    if (l) l.qty += qty; else state.cart.push({ key, id: p.id, g, qty });
    saveCart(); updateBadges(true); flyToCart(imgEl);
    toast(`${midia(p, 80, 'toast__img')}<span><b>${esc(p.nome)}</b><br><small>${g ? rotuloPeso(g) + ' · ' : ''}adicionado ao carrinho</small></span>`,
      { action: 'Ver carrinho', onAction: () => openPanel('drawer-cart') });
    if ($('#drawer-cart').classList.contains('is-open')) renderCart();
  }

  function renderCart() {
    const box = $('#cart-items');
    const n = cartCount();
    $('#cart-qty').textContent = n ? `(${n} ${n === 1 ? 'item' : 'itens'})` : '';
    $('#cart-foot').hidden = !n; $('#ship').hidden = !n;
    if (!n) {
      box.innerHTML = `<div class="drawer-empty">${icon('bag')}<h4>Seu carrinho está vazio</h4><p>Que tal começar pelos destaques da vitrine?</p><a href="#vitrine" class="btn btn--primary" data-close>Explorar produtos</a></div>`;
      return;
    }
    box.innerHTML = state.cart.map((l) => {
      const p = C.porId.get(l.id);
      return `<div class="line" data-key="${esc(l.key)}">
        ${midia(p, 144)}
        <div><b>${esc(p.nome)}</b><small>${l.g ? rotuloPeso(l.g) + ' · ' : esc(p.conteudo || '') + ' · '}${brl(precoDe(p, l.g))} cada</small>
          <div class="qty"><button data-q="-1" aria-label="Diminuir">${icon('minus')}</button><span>${l.qty}</span><button data-q="1" aria-label="Aumentar">${icon('plus')}</button></div></div>
        <div class="line__price"><b>${brl(linePrice(l))}</b><button class="rm" data-rm>${icon('trash')}Remover</button></div>
      </div>`;
    }).join('');
    const st = subtotal();
    $('#cart-subtotal').textContent = brl(st);
    const falta = CFG.loja.freteGratisAcima - st;
    $('#ship-text').innerHTML = falta > 0 ? `Faltam <b>${brl(falta)}</b> para ganhar <b>frete grátis</b> 🚚` : `<b>Parabéns!</b> Seu pedido tem <b>frete grátis</b> 🎉`;
    $('#ship-bar').style.width = `${Math.min(100, (st / CFG.loja.freteGratisAcima) * 100)}%`;
  }
  $('#cart-items').addEventListener('click', (e) => {
    const line = e.target.closest('.line'); if (!line) return;
    const l = state.cart.find((x) => x.key === line.dataset.key);
    const q = e.target.closest('[data-q]');
    if (q) { l.qty += +q.dataset.q; if (l.qty < 1) return removeLine(line, l); saveCart(); renderCart(); }
    if (e.target.closest('[data-rm]')) removeLine(line, l);
  });
  function removeLine(el, l) {
    el.classList.add('out');
    setTimeout(() => { state.cart = state.cart.filter((x) => x !== l); saveCart(); renderCart(); }, 300);
  }

  function resumoPedido(extra = '') {
    const linhas = state.cart.map((l) => {
      const p = C.porId.get(l.id);
      return `• ${l.qty}x ${p.nome} ${l.g ? `(${rotuloPeso(l.g)})` : p.conteudo ? `(${p.conteudo})` : ''} — ${brl(linePrice(l))}\n   cód. ${p.codigo_sku}`;
    });
    return `Olá, ${CFG.loja.nomeCurto}! Gostaria de fazer este pedido pelo site:\n\n${linhas.join('\n')}\n\n*Subtotal: ${brl(subtotal())}*${extra}\n\nPode confirmar disponibilidade e frete? Obrigado!`;
  }
  $('#cart-wa').addEventListener('click', () => window.open(waLink(resumoPedido()), '_blank', 'noopener'));

  /* ======================================================================
     Favoritos
     ====================================================================== */
  function toggleFav(p, btn) {
    const on = !state.fav.has(p.id);
    on ? state.fav.add(p.id) : state.fav.delete(p.id);
    store.set('fav', [...state.fav]);
    $$(`.pcard[data-id="${CSS.escape(p.id)}"] [data-fav]`).forEach((b) => { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    if (btn) btn.classList.toggle('is-on', on);
    updateBadges();
    toast(`${icon('heart')}<span>${on ? 'Salvo na sua lista de desejos' : 'Removido da lista de desejos'}</span>`, { ms: 1800 });
    if ($('#drawer-fav').classList.contains('is-open')) renderFav();
  }
  function renderFav() {
    const box = $('#fav-items');
    const items = [...state.fav].map((id) => C.porId.get(id)).filter(Boolean);
    if (!items.length) { box.innerHTML = `<div class="drawer-empty">${icon('heart')}<h4>Nenhum favorito ainda</h4><p>Toque no coração dos produtos para montar sua lista.</p><a href="#vitrine" class="btn btn--primary" data-close>Ver produtos</a></div>`; return; }
    box.innerHTML = items.map((p) => `<div class="line" data-fid="${esc(p.id)}">
      ${midia(p, 144)}
      <div><b>${esc(p.nome)}</b><small>${p._granel ? 'a partir de ' : ''}${brl(precoBase(p))}</small>
        <button class="btn btn--primary btn--sm" data-fadd>${icon('bag')}Adicionar</button></div>
      <div class="line__price"><span></span><button class="rm" data-frm>${icon('trash')}Remover</button></div></div>`).join('');
  }
  $('#fav-items').addEventListener('click', (e) => {
    const line = e.target.closest('[data-fid]'); if (!line) return;
    const p = C.porId.get(line.dataset.fid);
    if (e.target.closest('[data-fadd]')) addToCart(p, pesoInicial(p), 1, $('img, .arte', line));
    if (e.target.closest('[data-frm]')) toggleFav(p);
  });

  /* ======================================================================
     Vistos recentemente — últimos produtos abertos (só neste navegador)
     A faixa tem altura fixa: só muda de altura ao aparecer/sumir. Se ela for aparecer
     acima da tela (cliente já rolou a vitrine), espera ele voltar para cima — a página não "pula".
     ====================================================================== */
  /* Preço curto: granel = preço do kg com "/kg" (p.preco); embalado = preço da unidade.
     (precoBase() do granel é o da MENOR porção, ex. 50 g — não pode levar "/kg".) */
  const precoKg = (p, texto) => (p._granel ? `${brl(p.preco)}${texto ? '/kg' : '<small>/kg</small>'}` : brl(p.preco));
  const MAX_VISTOS = 12;
  state.vistos = store.get('vistos', []).filter((id) => C.porId.has(id)).slice(0, MAX_VISTOS);
  let vistosPendente = false;
  function renderVistos() {
    const box = $('#vistos'); if (!box) return;
    const itens = state.vistos.map((id) => C.porId.get(id)).filter(Boolean);
    if (box.hidden && itens.length && $('.shop').getBoundingClientRect().top < 0) { vistosPendente = true; return; }
    vistosPendente = false;
    box.hidden = !itens.length;
    $('#vistos-rail').innerHTML = itens.map((p) => `
      <button class="vistos__item" type="button" data-visto="${esc(p.id)}" title="${esc(p.nome)}">
        ${midia(p, 160)}<span>${esc(p.nome)}</span><b>${precoKg(p)}</b>
      </button>`).join('');
  }
  function registrarVisto(p) {
    state.vistos = [p.id, ...state.vistos.filter((id) => id !== p.id)].slice(0, MAX_VISTOS);
    store.set('vistos', state.vistos);
    renderVistos();
  }
  addEventListener('scroll', () => { if (vistosPendente && $('.shop').getBoundingClientRect().top >= 0) renderVistos(); }, { passive: true });
  $('#vistos-rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-visto]'); const p = b && C.porId.get(b.dataset.visto);
    if (p) openQuickView(p);
  });
  $('#vistos-limpar').addEventListener('click', () => { state.vistos = []; store.set('vistos', []); renderVistos(); });

  /* ======================================================================
     Espiada rápida (Quick View)
     ====================================================================== */
  /* Link direto do produto (?p=código): abre a espiada rápida; o botão "Compartilhar" usa o menu do celular ou copia o link */
  const linkProduto = (p) => `${location.origin === 'null' ? location.href.split('?')[0] : location.origin + location.pathname}?p=${encodeURIComponent(p.codigo_sku)}`;
  async function compartilhar(p) {
    const url = linkProduto(p);
    const texto = `${p.nome} — ${precoKg(p, true)} na ${CFG.loja.nomeCurto}`;
    if (navigator.share) { try { await navigator.share({ title: p.nome, text: texto, url }); return; } catch (err) { if (err.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${texto}\n${url}`); toast(`${icon('check')}<span>Link do produto copiado! Cole no WhatsApp.</span>`); }
    catch { window.open(waLink(`${texto}\n${url}`), '_blank', 'noopener'); }
  }

  /* "Combina com": até 4 produtos da mesma linha (subcategoria), preferindo os que têm foto */
  function relacionadosHTML(p) {
    const mesmos = C.produtos.filter((x) => x.id !== p.id && x.subcategoria === p.subcategoria);
    const lista = [...mesmos.filter((x) => x._img), ...mesmos.filter((x) => !x._img)].slice(0, 4);
    if (!lista.length) return '';
    return `<div class="qv__rel"><p class="ck__lbl">Combina com</p><div class="qv__relgrid">${lista.map((x) => `
      <button class="qv__relitem" type="button" data-rel="${esc(x.id)}">${midia(x, 160)}<span>${esc(x.nome)}</span><b>${precoKg(x)}</b></button>`).join('')}</div></div>`;
  }

  /* Moldura botânica da foto do produto: as mesmas folhas da abertura (#kd-leafshape / #kd-leaf do index.html) */
  const folha = (x, y, rot, s, cor = 'url(#kd-leaf)') =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><use href="#kd-leafshape" fill="${cor}"/><path d="M1.5 0H23" stroke="rgba(255,255,255,.38)" stroke-width=".6" fill="none" stroke-linecap="round"/></g>`;
  const RAMO = `<path d="M-8 12C40 18 90 50 150 150" stroke="#2563EB" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M60 31C80 20 100 15 124 17" stroke="#2563EB" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${folha(12, 14, -30, 1.7)}${folha(20, 16, 62, 1.5, '#3B82F6')}${folha(42, 22, -18, 1.9)}${folha(52, 26, 78, 1.6, '#374151')}
    ${folha(80, 22, -42, 1.25, '#5E9E3E')}${folha(96, 17, 38, 1.15)}${folha(121, 17, -6, 1.35, '#3B82F6')}
    ${folha(74, 38, 0, 2, '#5E9E3E')}${folha(84, 46, 98, 1.7)}${folha(104, 66, 18, 1.8, '#3B82F6')}${folha(112, 78, 112, 1.5)}
    ${folha(128, 104, 40, 1.7, '#2563EB')}${folha(138, 122, 120, 1.3, '#60A5FA')}${folha(148, 146, 58, 1.5)}`;
  const BOTANICA_FUNDO = `<div class="qv__botanica" aria-hidden="true">
      <svg class="qv__ramo qv__ramo--a" viewBox="0 0 220 220">${RAMO}</svg>
      <svg class="qv__ramo qv__ramo--b" viewBox="0 0 220 220">${RAMO}</svg>
      <svg class="qv__solta qv__solta--1" viewBox="-4 -14 34 28">${folha(0, 0, 0, 1, '#60A5FA')}</svg>
      <svg class="qv__solta qv__solta--2" viewBox="-4 -14 34 28">${folha(0, 0, 0, 1, '#3B82F6')}</svg>
    </div>`;
  const BOTANICA_FRENTE = `<svg class="qv__frente qv__frente--a" viewBox="0 0 90 90" aria-hidden="true">${folha(10, 52, -38, 1.9)}${folha(22, 60, 8, 1.6, '#3B82F6')}${folha(30, 40, -70, 1.4, '#60A5FA')}</svg>
    <svg class="qv__frente qv__frente--b" viewBox="0 0 90 90" aria-hidden="true">
      <path d="M38 64c-6-10 4-24 18-22 6 1 8 6 14 5 8-1 14 6 10 14-5 9-18 12-30 10-6-1-10-3-12-7z" fill="#3B82F6"/><path d="M46 60c8 3 20 2 28-4" stroke="#8F5E22" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${folha(6, 40, 20, 1.7, '#2563EB')}${folha(12, 34, -30, 1.3)}</svg>`;

  /* "Imagem ilustrativa" sob a foto do produto: hoje todas as fotos são ilustrativas.
     Quando a loja mandar fotos reais, liste os códigos em window.LOJA_FOTOS_LOJA (ex.: data/fotos-loja.js) para tirar o aviso. */
  const FOTOS_LOJA = new Set(window.LOJA_FOTOS_LOJA || []);

  function openQuickView(p, g, opts = {}) {
    g = p._granel ? (g || pesoInicial(p)) : null;
    let gramasRuim = false; // campo "outra quantidade" com valor fora do limite → não deixa adicionar
    let qty = 1;
    const box = $('#qv-content');
    const nutri = p.nutricional
      ? `<table class="ntable"><caption>Porção de ${esc(p.nutricional.porcao)}</caption>${p.nutricional.itens.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
      : '<p>Tabela nutricional disponível na embalagem e na loja. Solicite pelo WhatsApp se precisar antes da compra.</p>';
    const restr = p._tags.length ? `<div class="chips">${p._tags.map((t) => `<span class="chip">${CFG.restricoes.find((r) => r.id === t)?.nome || t}</span>`).join('')}</div>` : '<p>Sem selos de restrição.</p>';
    box.innerHTML = `
      <button class="icon-btn modal__x" data-close aria-label="Fechar">${icon('x')}</button>
      <div class="qv">
        <div class="qv__media">${BOTANICA_FUNDO}<div class="qv__quadro">${midia(p, 900, '', p.nome)}${BOTANICA_FRENTE}${FOTOS_LOJA.has(p.codigo_sku) ? '' : '<span class="qv__ilustr">Imagem ilustrativa</span>'}</div>${badgesHTML(p)}</div>
        <div class="qv__body">
          <span class="qv__cat">${esc(p._cat?.nome || '')} · ${esc(p.subcategoria)}</span>
          <h2>${esc(p.nome)}</h2>
          <span class="qv__sku">Cód. ${esc(p.codigo_sku)}</span>
          <div class="qv__price"><b id="qv-price"></b><small id="qv-unit"></small></div>
          ${p._granel ? weightsHTML(p, g) + `
          <div class="qv__outra">
            <label for="qv-gramas">Outra quantidade</label>
            <span class="qv__outrac"><input id="qv-gramas" type="text" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="ex.: 350"
              value="${p._variacoes.includes(g) ? '' : g}" aria-describedby="qv-gramas-msg"><em>gramas</em></span>
            <small id="qv-gramas-msg">Mínimo de ${GRAMAS_MIN} g</small>
          </div>` : `<div class="unit-info">${icon('box')} ${esc(p.conteudo || 'Unidade')}</div>`}
          <div class="qv__buy">
            <div class="qty qty--lg"><button data-qq="-1" aria-label="Diminuir">${icon('minus')}</button><span id="qv-qty">1</span><button data-qq="1" aria-label="Aumentar">${icon('plus')}</button></div>
            <button class="btn btn--primary btn--lg" id="qv-add">${icon('bag')}Adicionar</button>
            <button class="icon-btn pcard__fav ${state.fav.has(p.id) ? 'is-on' : ''}" style="position:static" id="qv-fav" aria-label="Favoritar">${icon('heart')}</button>
          </div>
          <div class="tabs" role="tablist"><button class="is-on" data-tab="d">Descrição</button><button data-tab="n">Tabela nutricional</button><button data-tab="r">Restrições</button></div>
          <div class="tabpanel" id="qv-tab"></div>
          <div class="qv__links">
            <a class="btn btn--soft btn--sm" target="_blank" rel="noopener" href="${waLink(`Olá! Tenho uma dúvida sobre ${p.nome} (cód. ${p.codigo_sku}).`)}">${icon('whats')}Tirar dúvida no WhatsApp</a>
            <button class="btn btn--soft btn--sm" id="qv-share" type="button">${icon('share')}Compartilhar</button>
          </div>
          ${relacionadosHTML(p)}
          ${p._credito && !p._credito.real && p._credito.pagina ? `<small class="qv__credito">Foto: <a href="${esc(p._credito.pagina)}" target="_blank" rel="noopener">${esc(p._credito.autor || '')}</a> · ${esc(p._credito.licenca || '')}</small>` : ''}
        </div>
      </div>`;
    const tabs = { d: `<p>${esc(p.descricao)}</p>`, n: nutri, r: restr };
    const paint = () => {
      $('#qv-price').textContent = brl(precoDe(p, g) * qty);
      $('#qv-unit').textContent = p._granel ? `${qty > 1 ? qty + '× ' : ''}${rotuloPeso(g)} · ${brl(p.preco)}/kg` : (qty > 1 ? `${qty}× ${brl(p.preco)}` : esc(p.conteudo || ''));
      $('#qv-qty').textContent = qty;
      $('#qv-add').disabled = gramasRuim;
    };
    $('#qv-tab').innerHTML = tabs.d; paint();
    // "Outra quantidade": vale a partir do mínimo; o peso digitado vira um botão a mais na fileira de pesos
    const campoG = $('#qv-gramas');
    if (campoG) {
      campoG.oninput = () => {
        const txt = campoG.value.replace(/\D/g, ''); if (txt !== campoG.value) campoG.value = txt;
        const n = lerGramas(txt), msg = $('#qv-gramas-msg'), wrap = $('.qv .weights', box);
        gramasRuim = !!txt && !n;
        msg.textContent = !txt ? `Mínimo de ${GRAMAS_MIN} g` : n ? `${rotuloPeso(n)} · ${brl(precoDe(p, n))}` : (+txt < GRAMAS_MIN ? `O mínimo é ${GRAMAS_MIN} g` : `O máximo é ${rotuloPeso(GRAMAS_MAX)}`);
        msg.classList.toggle('is-erro', gramasRuim);
        if (n) { g = n; wrap.outerHTML = weightsHTML(p, g); }
        else if (!txt && !p._variacoes.includes(g)) { g = pesoInicial(p); if (!p._variacoes.includes(g)) g = p._variacoes[1] ?? p._variacoes[0]; wrap.outerHTML = weightsHTML(p, g); }
        paint();
      };
      if (opts.outra) setTimeout(() => campoG.focus(), 350);
    }
    box.onclick = (e) => {
      const w = e.target.closest('[data-w]');
      if (w) {
        g = +w.dataset.w; marcarPeso(w);
        if (campoG && !w.hasAttribute('data-wpersonal')) { campoG.value = ''; gramasRuim = false; $('#qv-gramas-msg').textContent = `Mínimo de ${GRAMAS_MIN} g`; $('#qv-gramas-msg').classList.remove('is-erro'); }
        paint();
      }
      const q = e.target.closest('[data-qq]'); if (q) { qty = Math.max(1, qty + +q.dataset.qq); paint(); }
      const tb = e.target.closest('[data-tab]'); if (tb) { $$('[data-tab]', box).forEach((b) => b.classList.toggle('is-on', b === tb)); $('#qv-tab').innerHTML = tabs[tb.dataset.tab]; }
      if (e.target.closest('#qv-add')) {
        if (gramasRuim) { campoG.focus(); return; }
        addToCart(p, g, qty, $('.qv__media img, .qv__media .arte', box));
        if (p._granel) lembrarPeso(p, g);
        closeAll();
      }
      if (e.target.closest('#qv-fav')) toggleFav(p, $('#qv-fav'));
      if (e.target.closest('#qv-share')) compartilhar(p);
      const rel = e.target.closest('[data-rel]');
      if (rel) { openQuickView(C.porId.get(rel.dataset.rel)); $('#modal-qv .modal__card').scrollTo({ top: 0, behavior: 'smooth' }); }
    };
    openPanel('modal-qv');
    window.LojaSeoProduto?.mostrar(p, linkProduto(p), precoDe(p, pesoInicial(p)));
    registrarVisto(p);
  }

  /* ======================================================================
     Checkout simulado (3 etapas) — sem coleta de dados de cartão
     ====================================================================== */
  const ck = { step: 0, entrega: 'retirada', pagamento: 'pix', nome: '', fone: '', endereco: null, cupom: '', cupomMsg: '', temPedidos: null };
  const Contas = window.LojaContas;
  const Cupons = window.LojaCupons;
  const contaAtual = () => (Contas ? Contas.usuario() : null);
  // Módulo de endereço (assets/js/endereco.js): um só componente, reaproveitado a cada redesenho do checkout
  const endBox = document.createElement('div');
  let endApi = null;
  function moduloEndereco() {
    const KE = window.LojaEndereco; if (!KE) return null;
    const uid = contaAtual()?.id || '';
    if (!endApi) endApi = KE.montar(endBox, { usuarioId: uid, aoMudar: (e) => { ck.endereco = e; } });
    else if (endApi._uid !== uid) endApi.trocarUsuario(uid);
    endApi._uid = uid; ck.endereco = endApi.atual();
    return endApi;
  }  function abrirCheckout() {
    // Conta é pedida só aqui: sem login, abre "entrar/criar conta" e volta ao checkout em seguida
    if (Contas && window.LojaConta && !contaAtual()) { window.LojaConta.abrir('entrar', { depois: abrirCheckout, contexto: 'checkout' }); return; }
    ck.step = 0;
    const u = contaAtual();
    // Preenche com os dados da conta; se outra pessoa entrou neste navegador, troca os dados
    if (u && (ck.contaId !== u.id || !ck.nome)) { ck.nome = u.nome; ck.fone = Contas.fmt.fone(u.fone); ck.contaId = u.id; }
    renderCheckout(); openPanel('modal-checkout');
  }
  $('#go-checkout').addEventListener('click', abrirCheckout);

  // Totais do checkout (Pix 5% + desconto de atacado configurável em config.js → contas.atacado)
  function totaisCheckout() {
    const st = subtotal();
    const frete = ck.entrega === 'retirada' || st >= CFG.loja.freteGratisAcima ? 0 : 24.9;
    const u = contaAtual();
    // desconto individual da empresa (definido no admin) ou, se não houver, o padrão da loja
    const pctAtac = u && u.atacado && u.atacado.status === 'aprovado' ? +(u.atacado.descontoPercentual ?? CFG.contas?.atacado?.descontoPercentual ?? 0) : 0;
    const descAtac = pctAtac > 0 ? st * pctAtac / 100 : 0;
    // cupom (assets/js/cupons.js): sobre o subtotal já com o atacado; o Pix vem depois do cupom
    const cup = ck.cupom && Cupons ? Cupons.calcular(ck.cupom, { base: st - descAtac, frete, temPedidos: ck.temPedidos }) : null;
    const descCupom = cup && cup.ok ? cup.desconto : 0;
    const freteFinal = cup && cup.ok && cup.freteGratis ? 0 : frete;
    const desc = ck.pagamento === 'pix' ? (st - descAtac - descCupom) * 0.05 : 0;
    return { st, frete: freteFinal, desc, descAtac, pctAtac, cup, descCupom, total: st + freteFinal - desc - descAtac - descCupom };
  }
  /** Campo "Tenho um cupom" (só aparece se a loja tiver cupom ativo em config.js). */
  function cupomHTML(cup) {
    if (!Cupons || !Cupons.temAtivos()) return '';
    if (cup && cup.ok) {
      return `<div class="ck__cupom is-ok">${icon('tag')}<span><b>Cupom ${esc(Cupons.normalizar(ck.cupom))}</b><em>${esc(Cupons.rotulo(cup.cupom))}</em>${cup.motivo ? `<small>${esc(cup.motivo)}</small>` : ''}</span>
        <button type="button" class="end__lnk" data-ck="cupom-tirar">Remover</button></div>`;
    }
    const erro = (cup && cup.motivo) || ck.cupomMsg;
    return `<details class="ck__cupom" ${ck.cupom || ck.cupomMsg ? 'open' : ''}><summary>${icon('tag')}Tenho um cupom de desconto</summary>
      <div class="ck__cupomf"><div class="field ${erro ? 'is-error' : ''}"><input id="ck-cupom" placeholder=" " maxlength="30" autocomplete="off" autocapitalize="characters" value="${esc(ck.cupom || '')}"><label for="ck-cupom">Código do cupom</label></div>
      <button type="button" class="btn btn--soft" data-ck="cupom">Aplicar</button></div>
      ${erro ? `<p class="ck__cupomerro" role="alert">${esc(erro)}</p>` : ''}</details>`;
  }
  async function aplicarCupom() {
    const cod = Cupons.normalizar($('#ck-cupom')?.value);
    ck.cupom = cod; ck.cupomMsg = cod ? '' : 'Digite o código do cupom.';
    // "só no 1º pedido": confere se a conta já tem pedidos
    if (cod && Contas && contaAtual()) { try { ck.temPedidos = (await Contas.listarPedidos()).length > 0; } catch { ck.temPedidos = null; } }
    renderCheckout();
    if (ck.cupom && !totaisCheckout().cup?.ok) $('#ck-cupom')?.focus();
  }

  function renderCheckout() {
    const box = $('#checkout-content');
    const { st, frete, desc, descAtac, pctAtac, cup, descCupom, total } = totaisCheckout();
    const u = contaAtual();
    const steps = `<div class="ck__steps">${[0, 1, 2].map((i) => `<i class="${i <= ck.step ? 'is-on' : ''}"></i>`).join('')}</div>`;
    const sum = `<div class="ck__sum"><div><span>Subtotal</span><span>${brl(st)}</span></div><div><span>Frete</span><span>${frete ? brl(frete) : 'Grátis'}</span></div>${descAtac ? `<div><span>Desconto atacado (${pctAtac}%)</span><span>-${brl(descAtac)}</span></div>` : ''}${descCupom ? `<div><span>Cupom ${esc(cup.cupom.codigo)}</span><span>-${brl(descCupom)}</span></div>` : ''}${desc ? `<div><span>Desconto Pix (5%)</span><span>-${brl(desc)}</span></div>` : ''}<div><span>Total</span><span>${brl(total)}</span></div></div>`;
    const head = `<button class="icon-btn modal__x" data-close aria-label="Fechar">${icon('x')}</button>`;
    const contaInfo = u
      ? `<p class="ck__conta">${icon('user')}<span>Comprando como <b>${esc(u.nome.split(' ')[0])}</b>${u.atacado?.status === 'aprovado' ? ' · <em>cliente atacado</em>' : ''} — o pedido fica salvo em <b>Meus pedidos</b>.</span></p>`
      : '';
    let body = '';
    if (ck.step === 0) {
      body = `<h3>Como você quer receber?</h3>${steps}<p class="ck__lbl">Etapa 1 de 3 · Entrega</p>${contaInfo}
        <div class="opts">
          <label class="opt"><input type="radio" name="ent" value="retirada" ${ck.entrega === 'retirada' ? 'checked' : ''}>${icon('store')}<span><b>Retirar na loja</b><small>${esc(CFG.loja.endereco)} · ${esc(CFG.loja.cidade)}/${esc(CFG.loja.uf)} · grátis</small></span></label>
          <label class="opt"><input type="radio" name="ent" value="entrega" ${ck.entrega === 'entrega' ? 'checked' : ''}>${icon('truck')}<span><b>Receber em casa</b><small>Enviamos para todo o Brasil · grátis acima de ${brl(CFG.loja.freteGratisAcima)}</small></span></label>
        </div>
        <div class="field"><input id="ck-nome" placeholder=" " value="${esc(ck.nome)}"><label for="ck-nome">Nome completo</label></div>
        <div class="field"><input id="ck-fone" placeholder=" " inputmode="tel" value="${esc(ck.fone)}"><label for="ck-fone">WhatsApp</label></div>
        ${ck.entrega === 'entrega' ? `<div id="ck-end-slot"></div>` : ''}
        <p class="ck__priv">${icon('shield')}<span>Seus dados são usados só para preparar, entregar e falar com você sobre este pedido. <a href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a></span></p>
        ${sum}<div class="ck__nav"><button class="btn btn--primary btn--lg" data-ck="next">Continuar ${icon('arrow')}</button></div>`;
    } else if (ck.step === 1) {
      body = `<h3>Forma de pagamento</h3>${steps}<p class="ck__lbl">Etapa 2 de 3 · Pagamento</p>
        <div class="opts">
          <label class="opt"><input type="radio" name="pag" value="pix" ${ck.pagamento === 'pix' ? 'checked' : ''}>${icon('percent')}<span><b>Pix · 5% de desconto</b><small>Aprovação imediata</small></span></label>
          <label class="opt"><input type="radio" name="pag" value="cartao" ${ck.pagamento === 'cartao' ? 'checked' : ''}>${icon('tag')}<span><b>Cartão na ${ck.entrega === 'retirada' ? 'retirada' : 'entrega'}</b><small>Crédito ou débito na maquininha</small></span></label>
          <label class="opt"><input type="radio" name="pag" value="dinheiro" ${ck.pagamento === 'dinheiro' ? 'checked' : ''}>${icon('scale')}<span><b>Dinheiro</b><small>Pagamento no ato</small></span></label>
        </div>${cupomHTML(cup)}${sum}
        <div class="ck__nav"><button class="btn btn--soft btn--lg" data-ck="back">${icon('left')}Voltar</button><button class="btn btn--primary btn--lg" data-ck="next">Revisar ${icon('arrow')}</button></div>`;
    } else if (ck.step === 2) {
      body = `<h3>Revise seu pedido</h3>${steps}<p class="ck__lbl">Etapa 3 de 3 · Confirmação</p>
        <div style="margin:12px 0 16px;display:grid;gap:4px;font-size:14px">${state.cart.map((l) => { const p = C.porId.get(l.id); return `<div style="display:flex;justify-content:space-between;gap:10px"><span>${l.qty}× ${esc(p.nome)} ${l.g ? `<small style="color:var(--muted)">${rotuloPeso(l.g)}</small>` : ''}</span><b>${brl(linePrice(l))}</b></div>`; }).join('')}</div>
        ${ck.entrega === 'entrega' && ck.endereco ? `<div class="ck__end">${icon('truck')}<span><b>Entregar em ${esc(ck.endereco.apelido || '')}</b>
            <span>${esc(window.LojaEndereco.linha1(ck.endereco))}</span><small>${esc(window.LojaEndereco.linha2(ck.endereco))}</small>
            ${ck.endereco.referencia ? `<small>Referência: ${esc(ck.endereco.referencia)}</small>` : ''}
            ${ck.endereco.instrucoes ? `<small>Instruções: ${esc(ck.endereco.instrucoes)}</small>` : ''}
            ${ck.endereco.recebedor ? `<small>Quem recebe: ${esc(ck.endereco.recebedor.nome)} · ${esc(ck.endereco.recebedor.fone)}</small>` : ''}</span>
            <button type="button" class="end__lnk" data-ck="trocar-end">Alterar</button></div>` : ''}
        <p style="font-size:14px;color:var(--ink-2);margin:0 0 14px">${icon(ck.entrega === 'retirada' ? 'store' : 'truck')} ${ck.entrega === 'retirada' ? 'Retirada na loja' : 'Entrega'} · ${{ pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' }[ck.pagamento]} · ${esc(ck.nome)}</p>
        <div class="field"><textarea id="ck-obs" placeholder=" " rows="2" maxlength="300">${esc(ck.obs || '')}</textarea><label for="ck-obs">Observações do pedido (opcional) — ex.: moer a canela, é presente</label></div>
        ${sum}<div class="ck__nav"><button class="btn btn--soft btn--lg" data-ck="back">${icon('left')}Voltar</button><button class="btn btn--primary btn--lg" data-ck="confirm">${icon('check')}Confirmar pedido</button></div>`;
    } else {
      const num = ck.num;
      const proximo = ck.salvo
        ? `<button class="btn btn--primary btn--block" data-ck="pedidos" style="margin-top:10px">${icon('box')}Acompanhar em Meus pedidos</button>`
        : Contas && !u ? `<button class="btn btn--ghost btn--block" data-ck="criar" style="margin-top:10px">${icon('user')}Criar conta para acompanhar próximos pedidos</button>` : '';
      body = `<div class="ck__done"><div class="tick">${icon('check')}</div><h3>Pedido ${esc(num)} recebido!</h3>
        <p style="color:var(--muted);margin:6px 0 0">Obrigado, ${esc(ck.nome.split(' ')[0] || 'cliente')}! ${ck.salvo ? 'O pedido foi salvo na sua conta.' : 'Este é um checkout de demonstração.'}</p>
        ${ck.erroSalvar ? `<p class="ck__aviso">${esc(ck.erroSalvar)}</p>` : ''}
        ${ck.pagamento === 'pix' ? `<div class="pix"><div class="pix__qr"></div><div><b>Pix de ${brl(ck.totalPedido)}</b><br><small>QR Code ilustrativo — na versão final o Pix é gerado pelo gateway de pagamento.</small></div></div>` : '<div style="height:16px"></div>'}
        <button class="btn btn--wa btn--lg btn--block" data-ck="wa">${icon('whats')}Enviar comprovante e resumo no WhatsApp</button>
        ${proximo}
        <button class="btn btn--soft btn--block" data-close style="margin-top:10px">Continuar comprando</button></div>`;
    }
    ck.total = total;
    box.innerHTML = `${head}<div class="ck">${body}</div>`;
    const slot = $('#ck-end-slot');
    if (slot && moduloEndereco()) slot.appendChild(endBox);
  }

  // Foto do pedido no momento da compra (preços e nomes congelados)
  function snapshotPedido() {
    const t = totaisCheckout();
    const r2 = (n) => Math.round(n * 100) / 100;
    return {
      itens: state.cart.map((l) => {
        const p = C.porId.get(l.id);
        return { id: l.id, sku: p.codigo_sku, nome: p.nome, g: l.g ?? null, conteudo: p.conteudo || null, qty: l.qty, unitario: r2(precoDe(p, l.g)), total: r2(linePrice(l)) };
      }),
      subtotal: r2(t.st), frete: r2(t.frete), descontoPix: r2(t.desc), descontoAtacado: r2(t.descAtac), total: r2(t.total),
      ...(t.cup && t.cup.ok ? { cupom: { codigo: t.cup.cupom.codigo, desconto: r2(t.descCupom), freteGratis: !!t.cup.freteGratis } } : {}),
      entrega: ck.entrega === 'entrega' && ck.endereco
        ? (({ id, padrao, _temporario, instrucoesRapidas, instrucoesTexto, ...e }) => ({ tipo: 'entrega', ...e }))(ck.endereco)
        : { tipo: ck.entrega },
      pagamento: ck.pagamento,
      cliente: { nome: ck.nome, fone: ck.fone }
    };
  }

  async function confirmarPedido(btn) {
    btn.disabled = true; btn.classList.add('is-loading');
    if ($('#ck-obs')) ck.obs = $('#ck-obs').value.trim().slice(0, 300);
    // confere o cupom de novo na hora de confirmar (ex.: "só no 1º pedido" com pedido feito em outra aba)
    if (ck.cupom && Cupons) {
      if (Contas && contaAtual()) { try { ck.temPedidos = (await Contas.listarPedidos()).length > 0; } catch { ck.temPedidos = null; } }
      const c = totaisCheckout().cup;
      if (c && !c.ok) { ck.step = 1; renderCheckout(); toast(`${icon('tag')}<span>O cupom não vale mais: ${esc(c.motivo)}</span>`); return; }
    }
    const pedido = snapshotPedido();
    if (ck.obs) pedido.observacoes = ck.obs;
    ck.salvo = false; ck.erroSalvar = '';
    ck.num = 'KD' + String(Date.now()).slice(-6);
    if (Contas && contaAtual()) {
      try { const salvo = await Contas.criarPedido(pedido); ck.num = salvo.id; ck.salvo = true; }
      catch (err) { ck.erroSalvar = `Não foi possível salvar na sua conta (${err.message}). Envie o resumo pelo WhatsApp para garantir.`; }
    }
    ck.totalPedido = pedido.total;
    const entTxt = ck.entrega === 'retirada' ? 'Retirada na loja' : `*Entrega:*\n${window.LojaEndereco.formatarCompleto(ck.endereco)}\nMapa: ${window.LojaEndereco.mapsUrl(ck.endereco)}`;
    ck.lastMsg = resumoPedido(`\nPedido ${ck.num} · Pagamento: ${ck.pagamento}\n${entTxt}${ck.obs ? `\nObservações: ${ck.obs}` : ''}${pedido.cupom ? `\nCupom ${pedido.cupom.codigo}: ${pedido.cupom.freteGratis ? 'frete grátis' : `-${brl(pedido.cupom.desconto)}`}` : ''}\n*Total: ${brl(pedido.total)}*\nNome: ${ck.nome} · WhatsApp: ${ck.fone}`);
    ck.obs = ''; ck.cupom = ''; ck.cupomMsg = ''; ck.temPedidos = null; // próxima compra começa sem observação e sem cupom
    ck.step = 3; state.cart = []; saveCart(); renderCheckout();
    window.LojaConta?.pedidoCriado?.();
  }
  $('#checkout-content').addEventListener('change', (e) => {
    if (e.target.name === 'ent') { saveCkFields(); ck.entrega = e.target.value; renderCheckout(); }
    if (e.target.name === 'pag') { ck.pagamento = e.target.value; renderCheckout(); }
  });
  function saveCkFields() { ck.nome = $('#ck-nome')?.value.trim() ?? ck.nome; ck.fone = $('#ck-fone')?.value.trim() ?? ck.fone; }
  $('#checkout-content').addEventListener('click', (e) => {
    const a = e.target.closest('[data-ck]'); if (!a) return;
    const act = a.dataset.ck;
    if (act === 'next') {
      if (ck.step === 0) {
        saveCkFields();
        const bad = [['ck-nome', ck.nome.length > 2], ['ck-fone', ck.fone.replace(/\D/g, '').length >= 10]].filter(([, ok]) => !ok);
        if (bad.length) { bad.forEach(([id]) => { const f = $('#' + id).parentElement; f.classList.remove('is-error'); void f.offsetWidth; f.classList.add('is-error'); }); return; }
        if (ck.entrega === 'entrega') {
          const m = moduloEndereco();
          if (m && !m.validar()) { endBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
          ck.endereco = m ? m.atual() : null;
        }
      }
      ck.step++; renderCheckout();
    }
    if (act === 'back') { if ($('#ck-obs')) ck.obs = $('#ck-obs').value.trim(); ck.step--; renderCheckout(); }
    if (act === 'trocar-end') { if ($('#ck-obs')) ck.obs = $('#ck-obs').value.trim(); ck.step = 0; renderCheckout(); setTimeout(() => endBox.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    if (act === 'confirm') confirmarPedido(a);
    if (act === 'cupom') aplicarCupom();
    if (act === 'cupom-tirar') { ck.cupom = ''; ck.cupomMsg = ''; renderCheckout(); }
    if (act === 'wa') window.open(waLink(ck.lastMsg), '_blank', 'noopener');
    if (act === 'criar') window.LojaConta?.abrir('cadastro');
    if (act === 'pedidos') window.LojaConta?.abrir('pedidos');
  });
  // Enter no campo do cupom aplica (não avança de etapa)
  $('#checkout-content').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'ck-cupom') { e.preventDefault(); aplicarCupom(); }
  });

  /* ---------- Ponte para o módulo de conta (assets/js/conta.js) ---------- */
  window.LojaApp = {
    openPanel, closeAll, toast, icon, esc, waLink, brl, rotuloPeso,
    abrirCheckout,
    /** Adiciona itens de um pedido antigo ao carrinho; ignora produtos que saíram do catálogo. */
    repetirItens(itens) {
      let ok = 0; const fora = [];
      itens.forEach((it) => {
        if (!C.porId.has(it.id)) { fora.push(it.nome); return; }
        const key = keyOf(it.id, it.g ?? undefined);
        const l = state.cart.find((x) => x.key === key);
        if (l) l.qty += it.qty; else state.cart.push({ key, id: it.id, g: it.g ?? undefined, qty: it.qty });
        ok++;
      });
      saveCart(); updateBadges(true);
      return { ok, fora };
    }
  };

  /* ======================================================================
     Formulário Atacado → WhatsApp
     ====================================================================== */
  $('#b2b-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, v = (n) => f.elements[n].value.trim();
    const req = ['nome', 'cidade'].filter((n) => !v(n));
    req.forEach((n) => { const el = f.elements[n].parentElement; el.classList.remove('is-error'); void el.offsetWidth; el.classList.add('is-error'); });
    if (req.length) return;
    const msg = `Olá, ${CFG.loja.nomeCurto}! 📦 Gostaria de uma *cotação de atacado*.\n\n*Nome:* ${v('nome')}\n*Empresa/CNPJ:* ${v('empresa') || '—'}\n*Cidade:* ${v('cidade')}\n*Tipo de negócio:* ${v('tipo')}\n*Produtos/volumes:* ${v('itens') || 'Quero receber a tabela de atacado'}`;
    window.open(waLink(msg), '_blank', 'noopener');
    toast(`${icon('check')}<span>Abrindo o WhatsApp comercial…</span>`);
  });

  /* ======================================================================
     Pedido rápido de atacado — quantidades direto na lista → WhatsApp
     Itens e quantidades ficam salvos neste navegador; nome/empresa/cidade só na memória (LGPD: mínimo necessário).
     Granel em kg (aceita 0,5); embalados em unidades inteiras. Preços = referência do varejo.
     ====================================================================== */
  const PR_LINHAS = 60;          // linhas exibidas por vez (o catálogo tem +2.000 itens)
  const PR_MAX_QTD = 9999;
  const pr = { itens: {}, busca: '', cat: '', soEscolhidos: false, nome: '', empresa: '', cidade: '' };
  Object.entries(store.get('pedido-rapido', {})).forEach(([id, q]) => { if (C.porId.has(id) && +q > 0) pr.itens[id] = Math.min(PR_MAX_QTD, +q); });
  const prUnid = (p) => (p._granel ? 'kg' : 'un');
  // sem separador de milhar: o campo é lido de volta por prLer ("1.000" virava 1)
  const prNum = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
  /** Converte o número digitado no jeito brasileiro: "1.000" = mil, "1.234,5" = 1234,5, "2,5" e "2.5" = 2,5. */
  function prNumero(txt) {
    let s = String(txt).replace(/\s/g, '');
    if (s.includes(',')) {                                             // vírgula = decimal; pontos só como milhar certo
      if (!/^(\d{1,3}(\.\d{3})+|\d+),\d*$/.test(s)) return NaN;           // "1.2,3" não é número
      s = s.replace(/\./g, '').replace(',', '.');
    }
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  // só pontos em grupos de 3 = milhar
    return /^\d*\.?\d+$|^\d+\.$/.test(s) ? parseFloat(s) : NaN;
  }
  /** Converte o que foi digitado: kg arredonda a 0,1; unidades inteiras; nunca negativo. */
  function prLer(p, txt) {
    const v = prNumero(txt);
    if (!isFinite(v) || v <= 0) return 0;
    return Math.min(PR_MAX_QTD, p._granel ? Math.round(v * 10) / 10 : Math.round(v));
  }
  const prValor = (p, q) => p.preco * q; // granel: preço do kg × kg | embalado: preço da unidade × unidades
  const prEscolhidos = () => Object.entries(pr.itens).map(([id, q]) => [C.porId.get(id), q]).filter(([p, q]) => p && q > 0);
  function prSalvar() { store.set('pedido-rapido', pr.itens); }

  $('#pr-cat').innerHTML = `<option value="">Todos os departamentos</option>` + CFG.categorias.map((c) => `<option value="${c.slug}">${esc(c.curto)}</option>`).join('');

  function prLista() {
    if (pr.soEscolhidos) return prEscolhidos().map(([p]) => p);
    return C.filtrar({ q: pr.busca, categoria: pr.cat, ordem: pr.busca ? 'relevancia' : 'az' });
  }
  function renderRapido() {
    const lista = prLista(), vis = lista.slice(0, PR_LINHAS);
    $('#pr-lista').innerHTML = vis.length ? vis.map((p) => {
      const q = pr.itens[p.id] || 0;
      return `<div class="pr__linha ${q ? 'is-on' : ''}" role="listitem" data-prid="${esc(p.id)}">
        <div class="pr__nome"><b>${esc(p.nome)}</b><small>cód. ${esc(p.codigo_sku)} · ${p._granel ? `${brl(p.preco)}/kg` : `${brl(p.preco)} · ${esc(p.conteudo || 'unidade')}`}</small></div>
        <label class="pr__qtd"><span class="sr-only">Quantidade de ${esc(p.nome)} em ${p._granel ? 'quilos' : 'unidades'}</span>
          <input type="text" inputmode="decimal" autocomplete="off" value="${q ? prNum(q) : ''}" placeholder="0" data-prq>
          <em>${prUnid(p)}</em></label>
      </div>`;
    }).join('') : `<p class="pr__vazio">${pr.soEscolhidos ? 'Nenhum item escolhido ainda. Digite as quantidades na lista.' : 'Nenhum produto encontrado. Tente outro nome ou código.'}</p>`;
    $('#pr-mais').textContent = lista.length > PR_LINHAS ? `Mostrando ${PR_LINHAS} de ${lista.length.toLocaleString('pt-BR')} produtos — busque pelo nome ou código para achar os demais.` : '';
    renderRapidoResumo();
  }
  function renderRapidoResumo() {
    const escolhidos = prEscolhidos();
    const total = escolhidos.reduce((s, [p, q]) => s + prValor(p, q), 0);
    $('#pr-n').textContent = escolhidos.length;
    $('#pr-total').textContent = brl(total);
    $('#pr-so').textContent = pr.soEscolhidos ? 'Ver todos os produtos' : `Ver escolhidos (${escolhidos.length})`;
    $('#pr-so').setAttribute('aria-pressed', pr.soEscolhidos);
    ['#pr-wa', '#pr-copiar', '#pr-limpar'].forEach((s) => { $(s).disabled = !escolhidos.length; });
  }
  function prMensagem() {
    const linhas = prEscolhidos().map(([p, q]) => `• ${prNum(q)} ${prUnid(p)} — ${p.nome} (cód. ${p.codigo_sku})`);
    const total = prEscolhidos().reduce((s, [p, q]) => s + prValor(p, q), 0);
    return `Olá, ${CFG.loja.nomeCurto}! 📦 *Pedido rápido de atacado* (pelo site)\n\n*Nome:* ${pr.nome}\n*Empresa/CNPJ:* ${pr.empresa || '—'}\n*Cidade:* ${pr.cidade}\n\n${linhas.join('\n')}\n\n*Itens:* ${linhas.length} · *Referência no varejo:* ${brl(total)}\nAguardo a tabela de atacado e a confirmação de disponibilidade. Obrigado!`;
  }
  /** Nome e cidade são obrigatórios para o comercial responder; marca o campo que falta. */
  function prValidar() {
    pr.nome = $('#pr-nome').value.trim(); pr.empresa = $('#pr-empresa').value.trim(); pr.cidade = $('#pr-cidade').value.trim();
    const faltam = [['pr-nome', pr.nome.length >= 2], ['pr-cidade', pr.cidade.length >= 2]].filter(([, ok]) => !ok);
    faltam.forEach(([id]) => { const f = $('#' + id).parentElement; f.classList.remove('is-error'); void f.offsetWidth; f.classList.add('is-error'); });
    if (faltam.length) $('#' + faltam[0][0]).focus();
    return !faltam.length;
  }
  function abrirRapido() {
    // aproveita o que a pessoa já digitou no formulário de cotação ao lado
    const b2b = $('#b2b-form').elements;
    if (!$('#pr-nome').value) $('#pr-nome').value = b2b.nome.value.trim();
    if (!$('#pr-empresa').value) $('#pr-empresa').value = b2b.empresa.value.trim();
    if (!$('#pr-cidade').value) $('#pr-cidade').value = b2b.cidade.value.trim();
    renderRapido();
  }

  let prT;
  $('#pr-busca').addEventListener('input', (e) => { clearTimeout(prT); prT = setTimeout(() => { pr.busca = e.target.value.trim(); pr.soEscolhidos = false; renderRapido(); }, 120); });
  $('#pr-cat').addEventListener('change', (e) => { pr.cat = e.target.value; pr.soEscolhidos = false; renderRapido(); });
  $('#pr-lista').addEventListener('input', (e) => {
    const inp = e.target.closest('[data-prq]'); if (!inp) return;
    const linha = inp.closest('[data-prid]'), p = C.porId.get(linha.dataset.prid);
    const q = prLer(p, inp.value);
    if (q) pr.itens[p.id] = q; else delete pr.itens[p.id];
    linha.classList.toggle('is-on', !!q);
    prSalvar(); renderRapidoResumo();
  });
  // ao sair do campo, mostra o número como foi entendido (ex.: "1.25" → "1,3" kg; "2,7" un → "3")
  $('#pr-lista').addEventListener('focusout', (e) => {
    const inp = e.target.closest('[data-prq]'); if (!inp) return;
    const q = pr.itens[inp.closest('[data-prid]').dataset.prid] || 0;
    inp.value = q ? prNum(q) : '';
  });
  // Enter → próxima quantidade (digitação rápida em sequência)
  $('#pr-lista').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('[data-prq]')) return;
    e.preventDefault();
    const todos = $$('[data-prq]', $('#pr-lista')), i = todos.indexOf(e.target);
    (todos[i + 1] || e.target).focus(); todos[i + 1]?.select();
  });
  $('#pr-so').addEventListener('click', () => { pr.soEscolhidos = !pr.soEscolhidos; renderRapido(); });
  $('#pr-limpar').addEventListener('click', () => {
    if (!confirm('Tirar todos os itens do pedido rápido?')) return;
    pr.itens = {}; pr.soEscolhidos = false; prSalvar(); renderRapido();
  });
  $('#pr-wa').addEventListener('click', () => {
    if (!prEscolhidos().length || !prValidar()) return;
    window.open(waLink(prMensagem()), '_blank', 'noopener');
    toast(`${icon('check')}<span>Abrindo o WhatsApp comercial… Confira a mensagem e toque em enviar.</span>`, { ms: 4200 });
  });
  $('#pr-copiar').addEventListener('click', async () => {
    if (!prEscolhidos().length || !prValidar()) return;
    const txt = prMensagem().replace(/\*/g, '');
    try { await navigator.clipboard.writeText(txt); }
    catch {
      const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      if (!ok) { toast(`${icon('x')}<span>Não foi possível copiar. Use o botão do WhatsApp.</span>`); return; }
    }
    toast(`${icon('check')}<span>Lista copiada! Cole no WhatsApp ou no e-mail.</span>`);
  });

  /* ======================================================================
     Loja aberta agora? + mapa sob demanda
     ====================================================================== */
  function openStatus() {
    const el = $('#open-status'); const now = new Date();
    const h = CFG.loja.horarios[now.getDay()];
    const mins = now.getHours() * 60 + now.getMinutes();
    const toM = (s) => { const [a, b] = s.split(':'); return +a * 60 + +b; };
    const open = h && mins >= toM(h[0]) && mins < toM(h[1]);
    el.className = 'visit__status ' + (open ? 'is-open' : 'is-closed');
    let txt = open ? `Aberto agora · fecha às ${h[1]}` : 'Fechado agora';
    if (!open) {
      for (let d = 0; d < 7; d++) {
        const day = (now.getDay() + d) % 7, hh = CFG.loja.horarios[day];
        if (hh && (d > 0 || mins < toM(hh[0]))) { txt += ` · abre ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][day]} às ${hh[0]}`; break; }
      }
    }
    el.querySelector('span').textContent = txt;
  }
  openStatus(); setInterval(openStatus, 60000);
  const mapFrame = $('[data-src="mapa"]');
  new IntersectionObserver((ents, obs) => { if (ents[0].isIntersecting) { mapFrame.src = CFG.loja.mapaEmbed; obs.disconnect(); } }, { rootMargin: '400px' }).observe(mapFrame);

  /* ======================================================================
     Header, carrossel de categorias, brilho dos botões
     ====================================================================== */
  const header = $('#header');
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  $$('[data-rail]').forEach((b) => b.addEventListener('click', () => {
    const r = document.getElementById(b.dataset.rail); r.scrollBy({ left: +b.dataset.dir * r.clientWidth * 0.8, behavior: 'smooth' });
  }));
  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest?.('.btn'); if (!b) return;
    const r = b.getBoundingClientRect(); b.style.setProperty('--mx', `${e.clientX - r.left}px`); b.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // Bottom nav: destaca a seção atual
  const bnHome = $('.bottom-nav a[href="#inicio"]');
  addEventListener('scroll', () => bnHome.classList.toggle('is-active', scrollY < 400), { passive: true });

  /* ======================================================================
     Animações (GSAP + ScrollTrigger, com fallback CSS)
     ====================================================================== */
  /* Anel de folhas da abertura (gerado) */
  (function montarAnel() {
    const ring = $('#intro-ring'); if (!ring) return;
    let html = '<circle r="118"/>';
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360, r = 112 + (i % 2 ? 10 : 0), s = 0.75 + ((i * 37) % 10) / 20;
      html += `<use href="#kd-leafshape" class="ileaf" transform="rotate(${a}) translate(${r} 0) rotate(${(i % 2 ? 70 : 110)}) scale(${s})"/>`;
    }
    ring.innerHTML = html;
  })();

  /* ======================================================================
     Plantas na seção "Explore por categoria" — as mesmas folhas da abertura e da espiada rápida
     (#kd-leafshape / #kd-leaf). Ao aparecer: o caule "cresce" e as folhas brotam; depois balançam de leve.
     Só CSS (transform/opacity); pausa fora da tela; com "movimento reduzido" fica tudo parado e visível.
     ====================================================================== */
  (function plantasCategorias() {
    const sec = document.getElementById('categorias'); if (!sec) return;
    const n1 = (v) => Math.round(v * 10) / 10;
    const CORES = ['url(#kd-leaf)', '#3B82F6', '#5E9E3E', '#374151', '#60A5FA', '#2563EB'];
    // folha: posição (atributo) > broto (entrada, uma vez). O balanço contínuo é do galho inteiro (camada da placa de vídeo, leve).
    const folhaA = (x, y, rot, s, cor, d) => `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)}) scale(${n1(s)})"><g class="pl__f" style="--d:${n1(d)}s"><use href="#kd-leafshape" fill="${cor}"/><path class="pl__nervura" d="M1.5 0H23"/></g></g>`;
    // galho: caule em curva (Bézier) com folhas alternadas, menores na ponta
    function galho(p0, p1, p2, p3, { n = 8, s0 = 2, s1 = 1.1, d0 = 0, lado = 1, cor0 = 0 } = {}) {
      const pt = (t) => [0, 1].map((k) => { const u = 1 - t; return u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]; });
      const tg = (t) => [0, 1].map((k) => { const u = 1 - t; return 3 * u * u * (p1[k] - p0[k]) + 6 * u * t * (p2[k] - p1[k]) + 3 * t * t * (p3[k] - p2[k]); });
      const ang = (t) => { const [dx, dy] = tg(t); return Math.atan2(dy, dx) * 180 / Math.PI; };
      let html = `<path class="pl__haste" pathLength="1" style="--d:${d0}s" d="M${p0} C${p1} ${p2} ${p3}"/>`;
      for (let i = 0; i < n; i++) {
        const t = 0.14 + 0.8 * (i / Math.max(1, n - 1)), [x, y] = pt(t);
        html += folhaA(x, y, ang(t) + (i % 2 ? 1 : -1) * lado * 52, s0 + (s1 - s0) * t, CORES[(i + cor0) % CORES.length], d0 + 0.5 + i * 0.09);
      }
      const [x, y] = pt(1);
      return html + folhaA(x, y, ang(1), s1, CORES[cor0 % CORES.length], d0 + 0.5 + n * 0.09);
    }
    const solta = (cls, left, top, rot, w, cor, d, t) =>
      `<svg class="pl__solta ${cls}" viewBox="-4 -14 34 28" style="left:${left};top:${top};width:${w}px;--r:${rot}deg;--d:${d}s;--t:${t}s"><use href="#kd-leafshape" fill="${cor}"/><path class="pl__nervura" d="M1.5 0H23"/></svg>`;
    const SEMENTES = [
      '<path d="M8 30c-6-10 4-24 18-22 6 1 8 6 14 5 8-1 14 6 10 14-5 9-18 12-30 10C14 36 10 34 8 30z" fill="#3B82F6"/><path d="M16 26c8 3 20 2 28-4" stroke="#8F5E22" stroke-width="2" fill="none" stroke-linecap="round"/>',
      '<ellipse cx="30" cy="20" rx="10" ry="15" fill="#1D4ED8"/><path d="M30 7c-2 8-2 18 0 26" stroke="#1F2937" stroke-width="2" fill="none"/>',
      '<circle cx="30" cy="20" r="8" fill="#E6C48A"/><circle cx="27" cy="17" r="2.6" fill="#fff" opacity=".5"/>'];
    const semente = (cls, left, top, i, w, d, t) =>
      `<svg class="pl__solta pl__semente ${cls}" viewBox="0 0 60 40" style="left:${left};top:${top};width:${w}px;--r:0deg;--d:${d}s;--t:${t}s">${SEMENTES[i]}</svg>`;

    // galho lateral (telas largas): sobe do canto de baixo; o da direita é o mesmo desenho girado (pende do canto de cima)
    const lateral = galho([-6, 404], [40, 300], [70, 150], [210, 46], { n: 11, s0: 2.5, s1: 1.3 }) +
      galho([50, 262], [104, 236], [168, 256], [262, 196], { n: 6, s0: 1.8, s1: 1.1, d0: 0.5, lado: -1, cor0: 2 }) +
      galho([34, 340], [86, 356], [140, 330], [196, 352], { n: 5, s0: 1.6, s1: 1, d0: 0.8, cor0: 4 });
    const canto = galho([-4, 2], [60, 34], [120, 8], [232, 52], { n: 7, s0: 1.7, s1: 1, lado: -1 });
    sec.insertAdjacentHTML('afterbegin', `<div class="plantas" aria-hidden="true">
      <svg class="pl__lado pl__lado--e" viewBox="0 0 300 400" preserveAspectRatio="xMinYMax meet">${lateral}</svg>
      <svg class="pl__lado pl__lado--d" viewBox="0 0 300 400" preserveAspectRatio="xMaxYMin meet"><g transform="rotate(180 150 200)">${lateral}</g></svg>
      <svg class="pl__canto pl__canto--e" viewBox="0 0 240 100" preserveAspectRatio="xMinYMin meet">${canto}</svg>
      <svg class="pl__canto pl__canto--d" viewBox="0 0 240 100" preserveAspectRatio="xMaxYMin meet"><g transform="translate(240 0) scale(-1 1)">${canto}</g></svg>
      ${solta('', '31%', '9%', -24, 26, CORES[1], 1.1, 9)}${solta('', '57%', '6%', 148, 22, CORES[4], 1.3, 11)}
      ${solta('pl__solta--cel', '82%', 'calc(100% - 30px)', 32, 24, CORES[0], 1.5, 10)}${solta('', '44%', 'calc(100% - 26px)', -150, 20, CORES[2], 1.7, 12)}
      ${solta('pl__solta--cel', '9%', 'calc(100% - 34px)', 200, 22, CORES[3], 1.9, 9.5)}
      ${solta('pl__solta--lado', '4%', '42%', 60, 30, CORES[4], 1.2, 10.5)}${solta('pl__solta--lado', '95%', '58%', -120, 28, CORES[1], 1.4, 9)}
      ${semente('pl__solta--lado', '7%', '70%', 0, 46, 1.6, 8)}${semente('pl__solta--lado', '92.5%', '22%', 1, 30, 1.8, 9)}${semente('', '70%', '8%', 2, 26, 2, 7)}
    </div>`);
    // guirlanda no espaço vazio entre o título e as setas
    const rail = sec.querySelector('.rail-ctrl');
    if (rail) rail.insertAdjacentHTML('beforebegin', `<div class="pl__guirlanda" aria-hidden="true"><svg viewBox="0 0 520 90" preserveAspectRatio="xMidYMid meet">${galho([6, 60], [130, 6], [330, 100], [514, 34], { n: 10, s0: 1.6, s1: 1.1, d0: 0.3, cor0: 1 })}
      <circle class="pl__baga" cx="214" cy="44" r="4.5" fill="#3B82F6" style="--d:1.3s"/><circle class="pl__baga" cx="223" cy="50" r="3.5" fill="#1D4ED8" style="--d:1.4s"/><circle class="pl__baga" cx="404" cy="58" r="4" fill="#3B82F6" style="--d:1.6s"/></svg></div>`);

    const alvos = [sec.querySelector('.plantas'), sec.querySelector('.pl__guirlanda')].filter(Boolean);
    const intro = document.getElementById('intro') && !reduz() && !/[?&]noanim/.test(location.search);
    setTimeout(() => {   // não brota escondido atrás da abertura animada
      new IntersectionObserver((ents) => ents.forEach((e) => {
        alvos.forEach((a) => { a.classList.toggle('is-on', e.isIntersecting); if (e.isIntersecting) a.classList.add('is-in'); });
      }), { threshold: 0.15 }).observe(sec);
    }, intro ? 2300 : 0);
  })();

  /* Divide o título do hero em palavras/letras para a animação */
  function splitTitulo() {
    $$('.hero__title .tline > *').forEach((el) => {
      el.innerHTML = el.textContent.split(' ').map((w) => `<span class="w">${[...w].map((ch) => `<span class="c">${esc(ch)}</span>`).join('')}</span>`).join(' ');
    });
  }

  function animar() {
    // ?noanim desliga as animações (útil para capturas de tela e QA)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]noanim/.test(location.search);
    const intro = $('#intro');
    if (!window.gsap || reduce) {
      document.documentElement.classList.add('no-gsap');
      if (reduce && intro) intro.remove();
      return;
    }
    const { gsap } = window; gsap.registerPlugin(window.ScrollTrigger);
    splitTitulo();

    // 1) Abertura: anel de folhas + marca + cortina que se abre
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    if (intro) {
      intro.addEventListener('click', () => { if (tl.time() < tl.labels.revela) tl.seek('revela'); });
      tl.from('#intro-ring circle', { scale: 0, transformOrigin: '50% 50%', duration: 0.9, ease: 'back.out(1.5)' }, 0)
        .from('#intro-ring .ileaf', { opacity: 0, scale: 0, rotate: -90, transformOrigin: '50% 50%', stagger: { each: 0.025, from: 'random' }, duration: 0.7, ease: 'back.out(2.2)' }, 0.15)
        .from('.intro__logo', { clipPath: 'inset(0 100% 0 0)', duration: 0.9, ease: 'power4.inOut' }, 0.35)
        .from('.intro__logo', { y: 14, duration: 1 }, 0.35)
        .from('.intro__tag', { opacity: 0, y: 10, duration: 0.6 }, 0.9)
        .to('#intro-ring', { rotate: 40, duration: 2.2, ease: 'power1.inOut' }, 0)
        .addLabel('revela', 1.55)
        .to('.intro__stage', { scale: 0.86, opacity: 0, duration: 0.55, ease: 'power3.in' }, 'revela')
        .to('.intro__panel--a', { yPercent: -101, duration: 0.95, ease: 'expo.inOut' }, 'revela+=0.25')
        .to('.intro__panel--b', { yPercent: 101, duration: 0.95, ease: 'expo.inOut' }, 'revela+=0.25')
        .add(() => { intro.classList.add('is-done'); }, 'revela+=0.7')
        .set(intro, { display: 'none' }, 'revela+=1.25');
    }

    // 2) Hero: letras sobem com leve rotação 3D, imagens se revelam em arco, sementes caem
    const at = (d = 0) => (intro ? `revela+=${(0.45 + d).toFixed(2)}` : d);
    tl.from('.hero__title .c', { yPercent: 115, rotateX: -80, opacity: 0, filter: 'blur(6px)', duration: 1.1, stagger: 0.018, ease: 'expo.out' }, at())
      .from('.hero .reveal', { y: 28, opacity: 0, stagger: 0.08, duration: 1 }, at(0.35))
      .from('.arch--main', { clipPath: 'inset(100% 0% 0% 0% round 300px 300px 36px 36px)', duration: 1.5, ease: 'expo.inOut' }, at())
      .from('.arch--main img', { scale: 1.45, duration: 2.2 }, at())
      .from('.arch--side', { clipPath: 'inset(0% 0% 100% 0% round 36px 36px 300px 300px)', duration: 1.3, ease: 'expo.inOut' }, at(0.2))
      .from('.disc--small', { scale: 0, rotate: -120, duration: 1.1, ease: 'back.out(1.7)' }, at(0.55))
      .from('.seal', { scale: 0, rotate: 180, duration: 1.2, ease: 'back.out(1.6)' }, at(0.7))
      .from('.float', { y: -260, opacity: 0, rotate: () => gsap.utils.random(-180, 180), duration: 1.3, stagger: 0.09, ease: 'bounce.out' }, at(0.5))
      .from('.hero__ribbon-in > *', { y: 20, opacity: 0, stagger: 0.1, duration: 0.8 }, at(0.9));

    // Botões magnéticos no hero
    if (matchMedia('(hover:hover)').matches) {
      $$('.hero__ctas .btn').forEach((b) => {
        const qx = gsap.quickTo(b, 'x', { duration: 0.5, ease: 'power3' }), qy = gsap.quickTo(b, 'y', { duration: 0.5, ease: 'power3' });
        b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); qx((e.clientX - r.left - r.width / 2) * 0.25); qy((e.clientY - r.top - r.height / 2) * 0.35); });
        b.addEventListener('pointerleave', () => { qx(0); qy(0); });
      });
    }

    // Parallax por scroll e por mouse nas camadas do hero
    const layers = $$('#hero-art [data-depth]');
    layers.forEach((el) => gsap.to(el, { yPercent: -18 * +el.dataset.depth, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } }));
    const art = $('#hero-art');
    if (matchMedia('(hover:hover)').matches) {
      const setters = layers.map((el) => [gsap.quickTo(el, 'x', { duration: 1.2, ease: 'power3' }), gsap.quickTo(el, 'y', { duration: 1.2, ease: 'power3' }), +el.dataset.depth]);
      $('.hero').addEventListener('pointermove', (e) => {
        const r = art.getBoundingClientRect(); const dx = (e.clientX - r.left - r.width / 2) / r.width, dy = (e.clientY - r.top - r.height / 2) / r.height;
        setters.forEach(([sx, sy, d]) => { sx(dx * 30 * d); sy(dy * 22 * d); });
      });
    }

    // Revelação das seções
    $$('.section__head, .b2b__copy, .about__story').forEach((el) => gsap.from(el.children, { y: 40, opacity: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } }));
    // clearProps: ao terminar, devolve o cartão à posição do CSS (sem resto de deslocamento → cartões nivelados)
    ['#goals', '#reviews', '#insta'].forEach((sel) => gsap.from(`${sel} .reveal-stagger`, { y: 60, opacity: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: sel, start: 'top 85%' } }));
    gsap.from('.cat', { y: 30, opacity: 0, stagger: 0.05, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '#cat-rail', start: 'top 90%' } });
    gsap.from('.b2b__form', { y: 80, rotate: 2, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: '.b2b', start: 'top 75%' } });
    gsap.from('.perks li', { x: -30, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.perks', start: 'top 85%' } });
    gsap.from('.visit', { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.visit', start: 'top 85%' } });
    gsap.from('.reviews__score > *', { y: 30, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.reviews', start: 'top 80%' } });
    // Contador "+2.000"
    const cu = $('[data-countup]');
    if (cu) { const o = { v: 0 }; tl.to(o, { v: C.produtos.length, duration: 2.2, ease: 'power3.out', onUpdate: () => { cu.textContent = Math.round(o.v).toLocaleString('pt-BR'); } }, at(0.4)); }
  }

  /* Contagem real do catálogo no hero e na vitrine */
  (function infoCatalogo() {
    const total = C.produtos.length.toLocaleString('pt-BR');
    const cu = $('[data-countup]'); if (cu) cu.textContent = total;
    const granel = C.produtos.filter((p) => p._granel).length.toLocaleString('pt-BR');
    const info = C.info && C.info.fonte ? ` · tabela “${esc(C.info.fonte.replace(/\.pdf$/i, ''))}”` : '';
    $('#vitrine-info').innerHTML = `<b>${total}</b> produtos · ${granel} a granel${info}`;
  })();

  /* Voltar ao topo */
  const topoFab = $('#topo-fab');
  if (topoFab) {
    topoFab.hidden = false;
    addEventListener('scroll', () => topoFab.classList.toggle('on', scrollY > 1400), { passive: true });
    topoFab.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* Foto do cartão chegou → surge suavemente (CSS: .pcard__media img.main.ok) */
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
  // segurança: nunca deixa uma foto invisível (cache, navegador antigo etc.)
  setInterval(() => $$('.pcard__media img.main:not(.ok)').forEach((i) => { if (i.complete && i.naturalWidth) i.classList.add('ok'); }), 1500);

  /* Miniatura faltando (foto acabou de chegar) → usa a foto grande */
  document.addEventListener('error', (e) => {
    const i = e.target;
    if (i.tagName === 'IMG' && i.dataset.full && !i.dataset.trocou) { i.dataset.trocou = '1'; i.src = i.dataset.full; }
  }, true);

  /* ---------- Inicialização ---------- */
  updateBadges();
  renderVistos();
  aplicar();
  // ?p=código → abre o produto (link compartilhado); espera a abertura animada terminar
  (function abrirProdutoDoLink() {
    const cod = new URLSearchParams(location.search).get('p'); const p = cod && C.porId.get(cod);
    if (!p) return;
    const intro = $('#intro');
    setTimeout(() => openQuickView(p), intro && !/[?&]noanim/.test(location.search) && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 2600 : 300);
  })();
  animar(); // scripts "defer": o DOM já está pronto; não espera as fotos carregarem
  addEventListener('load', () => window.ScrollTrigger && window.ScrollTrigger.refresh());
})();
