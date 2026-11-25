/* ==========================================================================
   LOJA — Área administrativa · Fotos dos produtos
   Enviar / trocar / remover a foto real de cada produto e ocultar foto do banco de imagens.
     • modo local: grava pelo servidor local (_dev/serve.ps1 → /_fotos/*), protegido pelo PIN
     • modo api:   PUT/DELETE {apiUrl}/admin/produtos/:codigo/foto (ver docs/API-CONTAS.md)
   ========================================================================== */
(function () {
  'use strict';
  const A = window.LojaAdmin, C = window.LojaCatalog, API = window.LojaContas;
  const CFG = window.LOJA_CONFIG;
  if (!A || !C) return;
  const { esc, ic, toast } = A;
  const $ = (s, el = document) => el.querySelector(s);

  const REAIS = window.LOJA_FOTOS_REAIS || (window.LOJA_FOTOS_REAIS = {});
  const BANCO = window.LOJA_FOTOS || {};
  const OCULTAS = new Set(window.LOJA_FOTOS_OCULTAS || []);
  const versao = {};                      // força recarregar a miniatura depois de trocar
  const MODO_API = API.modo === 'api';
  const F = { busca: '', seg: 'todos', cat: '', limite: 48, servidor: null, ocupado: false, aberto: null };

  const SIT = {
    real: ['Foto real', 'leaf'],
    banco: ['Banco de imagens', 'amber'],
    oculta: ['Foto do banco oculta', 'cinza'],
    sem: ['Sem foto (arte)', 'cinza']
  };
  const situacao = (p) => {
    const c = p.codigo_sku;
    if (REAIS[c]) return 'real';
    const b = BANCO[c];
    if (b && b.url) return OCULTAS.has(c) ? 'oculta' : 'banco';
    return 'sem';
  };
  const caminho = (src) => /^https?:/.test(src) ? src : '../' + src.replace(/^\.?\//, '');
  function fotoUrl(p, w) {
    const c = p.codigo_sku, s = situacao(p);
    if (s === 'real') return caminho(REAIS[c]) + '?v=' + (versao[c] || 1);
    if (s === 'banco' || s === 'oculta') return caminho(C.imgUrl(BANCO[c].url, w));
    return null;
  }
  const porCodigo = (c) => C.porId.get(c) || C.produtos.find((p) => p.codigo_sku === c);

  /* ---------------- Lista ---------------- */
  function filtrar() {
    const q = C.norm(F.busca.trim());
    return C.produtos.filter((p) => (!F.cat || p.categoria === F.cat)
      && (F.seg === 'todos' || situacao(p) === F.seg || (F.seg === 'sem' && situacao(p) === 'oculta'))
      && (!q || C.norm(p.nome + ' ' + p.codigo_sku).includes(q)));
  }
  const NOME_SIT = { real: 'Foto da loja/gerada', banco: 'Banco de imagens', oculta: 'Sem foto (banco oculto)', sem: 'Sem foto' };
  /** "Sem foto" por departamento, maior primeiro: mostra onde falta mais foto. */
  function porDepartamento(lista) {
    const n = {}; lista.forEach((p) => { n[p.categoria] = (n[p.categoria] || 0) + 1; });
    const itens = Object.entries(n).sort((a, b) => b[1] - a[1]);
    if (!itens.length) return '';
    return `<p class="contagem" data-fotos-depto>Sem foto por departamento: ${itens.map(([c, q]) => `<b>${esc(C.catBySlug[c]?.curto || c)}</b> ${q}`).join(' · ')}</p>`;
  }
  /** Planilha da lista que está na tela (respeita filtro, busca e departamento). */
  function baixarLista() {
    const lista = filtrar();
    A.baixarCSV(F.seg === 'sem' ? 'produtos-sem-foto' : 'produtos-fotos', ['Código', 'Nome', 'Departamento', 'Subcategoria', 'Situação da foto'],
      lista.map((p) => [p.codigo_sku, p.nome, C.catBySlug[p.categoria]?.nome || p.categoria, p.subcategoria || '', NOME_SIT[situacao(p)]]));
  }
  function render() {
    const lista = filtrar();
    const conta = { real: 0, banco: 0, sem: 0 };
    C.produtos.forEach((p) => { const s = situacao(p); conta[s === 'oculta' ? 'sem' : s]++; });
    const seg = [['todos', `Todos (${C.produtos.length})`], ['real', `Foto real (${conta.real})`], ['banco', `Banco de imagens (${conta.banco})`], ['sem', `Sem foto (${conta.sem})`]];
    const aviso = !MODO_API && F.servidor === false
      ? `<div class="aviso aviso--bad" style="margin-bottom:14px">Para <b>enviar ou remover fotos</b>, abra o admin pelo <b>INICIAR-SITE.bat</b> (endereço <b>http://localhost:5510/admin/</b>). Aberto direto pelo arquivo, dá só para ver.</div>` : '';
    return `${aviso}
      <div class="kpis">
        <div class="kpi"><span>Com foto real</span><b>${conta.real}</b><small>${Math.round((conta.real / C.produtos.length) * 100)}% do catálogo</small></div>
        <div class="kpi"><span>Banco de imagens</span><b>${conta.banco}</b><small>Pixabay/Unsplash</small></div>
        <div class="kpi ${conta.sem ? 'kpi--alerta' : ''}"><span>Sem foto</span><b>${conta.sem}</b><small>o site mostra uma arte de embalagem</small></div>
      </div>
      <div class="filtros"><div class="seg" data-fotos-seg>${seg.map(([k, t]) => `<button data-v="${k}" class="${F.seg === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="filtros">
        <input class="inp busca" type="search" data-ff="busca" placeholder="Buscar produto por nome ou código" value="${esc(F.busca)}">
        <select class="inp" data-ff="cat"><option value="">Todos os departamentos</option>${CFG.categorias.map((c) => `<option value="${c.slug}"${F.cat === c.slug ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
      </div>
      ${F.seg === 'sem' ? porDepartamento(lista) : ''}
      <p class="contagem">${lista.length} produto(s) · clique num produto para alterar preço, descrição ou foto
        ${lista.length ? `<button class="btn btn--soft btn--sm" data-fotos-csv style="margin-left:10px">Baixar planilha (CSV)</button>` : ''}</p>
      ${lista.length ? `<div class="fgrid">${lista.slice(0, F.limite).map(cardHTML).join('')}</div>` : '<div class="card vazio">Nenhum produto neste filtro.</div>'}
      ${lista.length > F.limite ? `<div style="text-align:center;margin-top:16px"><button class="btn btn--soft" data-fotos-mais>Mostrar mais (${lista.length - F.limite} restantes)</button></div>` : ''}`;
  }
  function cardHTML(p) {
    const s = situacao(p), url = fotoUrl(p, 300);
    return `<button class="fcard" data-foto="${esc(p.codigo_sku)}">
      <span class="fthumb${s === 'oculta' ? ' fthumb--oculta' : ''}">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<i>${ic('photo')}</i>`}</span>
      <b>${esc(p.nome)}</b>
      <small>cód. ${esc(p.codigo_sku)} · ${esc(C.brl(p.preco))}${p._granel ? '/kg' : ''}${(window.LOJA_AJUSTES || {})[p.codigo_sku] ? ' · <em>editado</em>' : ''}</small>
      <span class="pill pill--${SIT[s][1]}">${SIT[s][0]}</span>
    </button>`;
  }

  /* ---------------- Painel do produto ---------------- */
  const ficha = $('#foto-ficha'), painel = $('#foto-painel');
  function abrir(codigo) {
    const p = porCodigo(codigo);
    if (!p) { toast('Produto não encontrado.', true); return; }
    F.aberto = codigo;
    painel.innerHTML = painelHTML(p);
    ficha.classList.add('on'); ficha.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
  }
  function fechar(semHash) {
    if (!F.aberto && !ficha.classList.contains('on')) return;
    F.aberto = null; ficha.classList.remove('on'); ficha.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
    if (!semHash && /^#fotos\//.test(location.hash)) history.replaceState(null, '', '#fotos');
  }
  function painelHTML(p) {
    const s = situacao(p), url = fotoUrl(p, 900), c = p.codigo_sku;
    const cat = C.catBySlug[p.categoria];
    const podeGravar = MODO_API || F.servidor !== false;
    const explica = {
      real: `Esta é a <b>foto real</b> da loja. O original fica em <code>fotos/</code>; ao trocar, a anterior vai para <code>fotos/_removidas/</code>.`,
      banco: `Foto ilustrativa do <b>banco de imagens</b>${BANCO[c]?.autor ? ` (${esc(BANCO[c].autor)} · ${esc(BANCO[c].licenca || '')})` : ''}. Enviar uma foto real substitui esta.`,
      oculta: 'A foto do banco de imagens está <b>oculta</b>: o site mostra a arte de embalagem.',
      sem: 'Este produto ainda <b>não tem foto</b>: o site mostra uma arte de embalagem com o nome do produto.'
    }[s];
    return `<div class="ficha__topo">
        <div style="min-width:0"><h2>${esc(p.nome)}</h2><small>cód. ${esc(c)} · ${esc(cat?.nome || '')}${p.subcategoria ? ' · ' + esc(p.subcategoria) : ''}</small>
          <div class="pills"><span class="pill pill--${SIT[s][1]}">${SIT[s][0]}</span></div></div>
        <button class="ficha__x" data-fechar-foto aria-label="Fechar">${ic('x')}</button>
      </div>
      <div class="ficha__corpo">
        ${dadosHTML(p, podeGravar)}
        <h3 class="fsub">Foto</h3>
        <div class="fprev${s === 'oculta' ? ' fthumb--oculta' : ''}">${url ? `<img src="${esc(url)}" alt="Foto atual de ${esc(p.nome)}">` : `<div class="fprev__vazio">${ic('photo')}<span>Sem foto</span></div>`}</div>
        <p class="fexplica">${explica}</p>
        ${podeGravar ? `
        <label class="drop" data-drop>
          <input type="file" accept="image/jpeg,image/png,image/webp" data-arquivo hidden>
          ${ic('upload')}<b>${s === 'real' ? 'Trocar a foto' : 'Enviar foto real'}</b>
          <span>Arraste a foto aqui ou clique para escolher</span>
          <small>JPG, PNG ou WEBP · até 15 MB · o site ajusta para 900×900 com fundo branco</small>
        </label>
        <div class="fstatus" data-status hidden></div>
        <div class="linha">
          ${s === 'real' ? `<button class="btn btn--bad btn--sm" data-acao-foto="remover">${ic('trash')}Remover foto real</button>` : ''}
          ${s === 'banco' ? `<button class="btn btn--soft btn--sm" data-acao-foto="ocultar">${ic('trash')}Ocultar foto do banco</button>` : ''}
          ${s === 'oculta' ? `<button class="btn btn--soft btn--sm" data-acao-foto="mostrar">${ic('eye')}Voltar a mostrar foto do banco</button>` : ''}
        </div>` : `<div class="aviso aviso--bad">Para enviar ou remover fotos, abra o admin pelo <b>INICIAR-SITE.bat</b> (http://localhost:5510/admin/).</div>`}
        <p class="fdica">Dica: o arquivo também pode ser colocado direto na pasta <code>fotos/</code> com o nome começando pelo código (<code>${esc(c)}.jpg</code>) — o sincronizador coloca no site sozinho.</p>
      </div>`;
  }

  /* ---------------- Dados do produto (nome, preço, descrição) ---------------- */
  const AJ = window.LOJA_AJUSTES || (window.LOJA_AJUSTES = {});
  const ORIG = new Map((window.LOJA_PRODUTOS || []).map((o) => [o.codigo_sku, o]));
  const fmtPreco = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','));
  function dadosHTML(p, podeGravar) {
    const c = p.codigo_sku, o = ORIG.get(c) || {}, aj = AJ[c] || {};
    const un = p._granel ? 'por kg' : 'por unidade';
    const dis = podeGravar ? '' : ' disabled';
    return `<h3 class="fsub">Dados do produto ${Object.keys(aj).length ? '<span class="pill pill--amber">Editado no admin</span>' : ''}</h3>
      <form class="fdados" data-form-dados>
        <label>Nome<input class="inp" name="nome" maxlength="150" value="${esc(p.nome)}"${dis}></label>
        <label>Vendido por<select class="inp" name="unidade" data-unidade${dis}>
            <option value="kg"${p._granel ? ' selected' : ''}>Quilo (a granel — cliente escolhe o peso)</option>
            <option value="un"${p._granel ? '' : ' selected'}>Unidade (embalado / peça)</option>
          </select>
          ${aj.unidade_medida ? `<small>Original do catálogo: ${o.unidade_medida === 'kg' ? 'por kg' : 'por unidade'}</small>` : ''}</label>
        <label><span data-rotulo-preco>Preço (R$ ${un})</span><input class="inp" name="preco" inputmode="decimal" value="${esc(fmtPreco(p.preco))}"${dis}>
          ${aj.preco != null ? `<small>Preço original do catálogo: R$ ${esc(fmtPreco(o.preco))}</small>` : ''}</label>
        <label>Descrição<textarea class="inp" name="descricao" rows="5" maxlength="3000" placeholder="${esc(C.descricaoAuto(o, p._granel))}"${dis}>${esc(aj.descricao ?? o.descricao ?? '')}</textarea>
          <small>Vazio = o site usa o texto automático (mostrado em cinza).</small></label>
        ${podeGravar ? `<div class="linha">
          <button class="btn btn--sm" type="submit">${ic('check')}Salvar alterações</button>
          ${Object.keys(aj).length ? `<button class="btn btn--soft btn--sm" type="button" data-dados-original>${ic('refresh')}Voltar ao original</button>` : ''}
        </div><div class="fstatus" data-status-dados hidden></div>` : ''}
      </form>`;
  }
  async function salvarDados(corpo) {
    let url, opt;
    if (MODO_API) {
      const base = String(CFG.contas?.apiUrl || '').replace(/\/+$/, ''); let tk = ''; try { tk = localStorage.getItem('loja:admin-token') || ''; } catch { /* */ }
      url = `${base}/admin/produtos/${encodeURIComponent(corpo.codigo)}`;
      opt = { method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
    } else {
      url = '/_produtos/salvar';
      opt = { method: 'POST', headers: { 'X-Loja-Pin': A.pin(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
    }
    let r; try { r = await fetch(url, opt); } catch { throw new Error('Sem conexão com o servidor. O INICIAR-SITE.bat está aberto?'); }
    let d = {}; try { d = await r.json(); } catch { /* */ }
    if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
    return d;
  }
  async function enviarDados(form, original) {
    if (F.ocupado) return;
    const codigo = F.aberto, p = porCodigo(codigo), o = ORIG.get(codigo) || {};
    const st = $('[data-status-dados]', painel);
    const msg = (t, tipo) => { if (st) { st.hidden = !t; st.className = 'fstatus' + (tipo ? ' fstatus--' + tipo : ''); st.innerHTML = t || ''; } };
    let corpo = { codigo };
    if (!original) {
      const nome = form.nome.value.trim(), txtPreco = form.preco.value.trim().replace(/[R$\s]/g, '');
      const preco = Number(txtPreco.includes(',') ? txtPreco.replace(/\./g, '').replace(',', '.') : txtPreco);
      if (nome.length < 2) { msg('Informe o nome do produto.', 'bad'); return; }
      if (!(preco > 0)) { msg('Preço inválido. Exemplo: 12,90', 'bad'); return; }
      const desc = form.descricao.value.trim();
      // só grava o que difere do catálogo original
      const unidade = form.unidade ? form.unidade.value : o.unidade_medida;
      corpo = { codigo, nome: nome !== o.nome ? nome : null, preco: Math.round(preco * 100) !== Math.round((o.preco || 0) * 100) ? preco : null, descricao: desc !== (o.descricao || '') ? desc || null : null,
        unidade_medida: unidade !== o.unidade_medida ? unidade : null };
      if (desc === '' && o.descricao) corpo.descricao = ' '; // apagar descrição original → texto automático
    } else if (!confirm(`Voltar "${p.nome}" ao nome, preço, unidade e descrição originais do catálogo?`)) return;
    F.ocupado = true; painel.classList.add('ocupado'); msg(`${ic('refresh')} Salvando…`);
    try {
      const d = await salvarDados(corpo);
      const aj = d.ajuste || {};
      if (Object.keys(aj).length) AJ[codigo] = aj; else delete AJ[codigo];
      p.nome = aj.nome || o.nome; p.preco = aj.preco ?? o.preco;
      p.unidade_medida = aj.unidade_medida || o.unidade_medida; p._granel = p.unidade_medida === 'kg';
      p._variacoes = p._granel ? (o.variacoes || [100, 250, 500, 1000]) : null;
      p.descricao = (aj.descricao ?? o.descricao) || C.descricaoAuto(o, p._granel);
      p._nomeNorm = C.norm(p.nome);
      atualizarTudo(codigo);
      toast(original ? 'Produto voltou ao original.' : 'Produto atualizado — já está no site.');
    } catch (e) { msg(esc(e.message), 'bad'); toast(esc(e.message), true); }
    finally { F.ocupado = false; painel.classList.remove('ocupado'); }
  }

  /* ---------------- Envio / remoção ---------------- */
  // Reduz fotos enormes no navegador (máx. 1600 px) e converte para JPG com fundo branco
  async function preparar(arquivo) {
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error('Formato não suportado. Envie JPG, PNG ou WEBP.');
    if (arquivo.size > 25 * 1024 * 1024) throw new Error('Arquivo muito grande (máx. 25 MB).');
    const bmp = await createImageBitmap(arquivo);
    if (bmp.width < 300 || bmp.height < 300) throw new Error(`Foto pequena demais (${bmp.width}×${bmp.height}). Use pelo menos 300×300.`);
    const esc_ = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * esc_); cv.height = Math.round(bmp.height * esc_);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
    return new Promise((ok, erro) => cv.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível ler a foto.'))), 'image/jpeg', 0.9));
  }
  async function chamar(acao, codigo, corpo) {
    let url, opt;
    if (MODO_API) {
      const base = String(CFG.contas?.apiUrl || '').replace(/\/+$/, ''); let tk = ''; try { tk = localStorage.getItem('loja:admin-token') || ''; } catch { /* */ }
      const h = { Authorization: 'Bearer ' + tk };
      const rota = `${base}/admin/produtos/${encodeURIComponent(codigo)}`;
      if (acao === 'enviar') { url = rota + '/foto'; opt = { method: 'PUT', headers: { ...h, 'Content-Type': 'image/jpeg' }, body: corpo }; }
      if (acao === 'remover') { url = rota + '/foto'; opt = { method: 'DELETE', headers: h }; }
      if (acao === 'ocultar' || acao === 'mostrar') { url = rota + '/foto-banco'; opt = { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ oculta: acao === 'ocultar' }) }; }
    } else {
      const h = { 'X-Loja-Pin': A.pin() };
      if (acao === 'enviar') { url = `/_fotos/enviar?codigo=${encodeURIComponent(codigo)}`; opt = { method: 'POST', headers: { ...h, 'Content-Type': 'application/octet-stream' }, body: corpo }; }
      if (acao === 'remover') { url = `/_fotos/remover?codigo=${encodeURIComponent(codigo)}`; opt = { method: 'POST', headers: h }; }
      if (acao === 'ocultar' || acao === 'mostrar') { url = `/_fotos/banco?codigo=${encodeURIComponent(codigo)}&ocultar=${acao === 'ocultar' ? 1 : 0}`; opt = { method: 'POST', headers: h }; }
    }
    let r; try { r = await fetch(url, opt); } catch { throw new Error('Sem conexão com o servidor. O INICIAR-SITE.bat está aberto?'); }
    let d = {}; try { d = await r.json(); } catch { /* */ }
    if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
    return d;
  }
  function status(msg, tipo) {
    const s = $('[data-status]', painel); if (!s) return;
    s.hidden = !msg; s.className = 'fstatus' + (tipo ? ' fstatus--' + tipo : ''); s.innerHTML = msg || '';
  }
  function atualizarTudo(codigo) {
    versao[codigo] = Date.now();
    if (A.rota() === 'fotos') { const y = scrollY; A.render(); scrollTo(0, y); }
    if (F.aberto === codigo) abrir(codigo);
  }
  async function enviar(arquivo) {
    if (F.ocupado || !arquivo) return;
    const codigo = F.aberto; F.ocupado = true;
    painel.classList.add('ocupado');
    try {
      status(`${ic('refresh')} Preparando a foto…`);
      const blob = await preparar(arquivo);
      status(`${ic('refresh')} Enviando e processando (alguns segundos)…`);
      const d = await chamar('enviar', codigo, blob);
      REAIS[codigo] = d.arquivo || `assets/produtos/${codigo}.jpg`; OCULTAS.delete(codigo);
      atualizarTudo(codigo);
      toast(d.substituida ? 'Foto trocada — já está no site.' : 'Foto enviada — já está no site.');
    } catch (e) { status(esc(e.message), 'bad'); toast(esc(e.message), true); }
    finally { F.ocupado = false; painel.classList.remove('ocupado'); }
  }
  async function acao(tipo) {
    if (F.ocupado) return;
    const codigo = F.aberto, p = porCodigo(codigo);
    const perguntas = { remover: `Remover a foto real de "${p.nome}"?\nO original vai para fotos/_removidas/ (dá para recuperar).`, ocultar: `Ocultar a foto do banco de imagens de "${p.nome}"?\nO site passa a mostrar a arte de embalagem.` };
    if (perguntas[tipo] && !confirm(perguntas[tipo])) return;
    F.ocupado = true; painel.classList.add('ocupado');
    try {
      status(`${ic('refresh')} Aplicando…`);
      const d = await chamar(tipo, codigo);
      if (tipo === 'remover') { if (d.removida === 'banco') OCULTAS.add(codigo); else delete REAIS[codigo]; }
      if (tipo === 'ocultar') OCULTAS.add(codigo);
      if (tipo === 'mostrar') OCULTAS.delete(codigo);
      atualizarTudo(codigo);
      toast({ remover: 'Foto removida do site.', ocultar: 'Foto do banco ocultada.', mostrar: 'Foto do banco visível de novo.' }[tipo]);
    } catch (e) { status(esc(e.message), 'bad'); toast(esc(e.message), true); }
    finally { F.ocupado = false; painel.classList.remove('ocupado'); }
  }

  /* ---------------- Eventos ---------------- */
  const conteudo = $('#conteudo');
  conteudo.addEventListener('click', (e) => {
    if (A.rota() !== 'fotos') return;
    const sg = e.target.closest('[data-fotos-seg] button'); if (sg) { F.seg = sg.dataset.v; F.limite = 48; A.render(); return; }
    if (e.target.closest('[data-fotos-mais]')) { F.limite += 48; const y = scrollY; A.render(); scrollTo(0, y); return; }
    if (e.target.closest('[data-fotos-csv]')) { baixarLista(); return; }
    const card = e.target.closest('[data-foto]'); if (card) location.hash = '#fotos/' + encodeURIComponent(card.dataset.foto);
  });
  let t;
  conteudo.addEventListener('input', (e) => {
    if (A.rota() !== 'fotos' || e.target.dataset.ff !== 'busca') return;
    F.busca = e.target.value; F.limite = 48; clearTimeout(t);
    t = setTimeout(() => { const pos = e.target.selectionStart; A.render(); const i = $('[data-ff="busca"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 180);
  });
  conteudo.addEventListener('change', (e) => { if (A.rota() === 'fotos' && e.target.dataset.ff === 'cat') { F.cat = e.target.value; F.limite = 48; A.render(); } });

  painel.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar-foto]')) { fechar(); return; }
    if (e.target.closest('[data-dados-original]')) { enviarDados(null, true); return; }
    const b = e.target.closest('[data-acao-foto]'); if (b) acao(b.dataset.acaoFoto);
  });
  painel.addEventListener('submit', (e) => { if (e.target.matches('[data-form-dados]')) { e.preventDefault(); enviarDados(e.target, false); } });
  painel.addEventListener('change', (e) => {
    if (e.target.matches('[data-unidade]')) { const r = $('[data-rotulo-preco]', painel); if (r) r.textContent = `Preço (R$ ${e.target.value === 'kg' ? 'por kg' : 'por unidade'})`; return; }
    if (e.target.matches('[data-arquivo]')) { enviar(e.target.files[0]); e.target.value = ''; } });
  painel.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('sobre'); } });
  painel.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('sobre'); });
  painel.addEventListener('drop', (e) => { const d = e.target.closest('[data-drop]'); if (!d) return; e.preventDefault(); d.classList.remove('sobre'); enviar(e.dataTransfer.files[0]); });
  $('[data-fechar-foto]', ficha).addEventListener('click', () => fechar());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && F.aberto) fechar(); });

  /* ---------------- Servidor local disponível? ---------------- */
  async function checarServidor() {
    if (MODO_API || F.servidor !== null) return;
    try { const r = await fetch('/_fotos/status', { cache: 'no-store' }); F.servidor = r.ok; } catch { F.servidor = false; }
    if (A.rota() === 'fotos') { A.render(); if (F.aberto) abrir(F.aberto); }
  }

  A.registrar('fotos', { render, abrir, fechar, depois: checarServidor });
})();
