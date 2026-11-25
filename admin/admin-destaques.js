/* ==========================================================================
   LOJA — Área administrativa · Destaques da vitrine
   Escolhe quais produtos aparecem PRIMEIRO (até 16, na ordem escolhida) em cada lista:
     vitrine inicial ("todos"), cada departamento e cada objetivo. Depois deles vêm os demais (mais vendidos).
   Vale quando a vitrine está na ordem "Destaques" e sem busca (assets/js/catalog.js → filtrar).
     • modo local: grava data/destaques.js pelo servidor local (_dev/serve.ps1 → /_destaques/salvar), com o PIN
     • modo api:   PUT {apiUrl}/admin/destaques/:chave  { skus } (ver docs/API-CONTAS.md)
   ========================================================================== */
(function () {
  'use strict';
  const A = window.LojaAdmin, C = window.LojaCatalog, CFG = window.LOJA_CONFIG, API = window.LojaContas;
  if (!A || !C) return;
  const { esc, ic, toast } = A;
  const $ = (s, el = document) => el.querySelector(s);
  const MAX = C.MAX_DESTAQUES || 16;
  const MODO_API = API && API.modo === 'api';
  const SALVOS = window.LOJA_DESTAQUES || (window.LOJA_DESTAQUES = {});
  const D = { chave: 'todos', rascunho: null, busca: '', ocupado: false, servidor: null };

  const porSku = new Map(C.produtos.map((p) => [String(p.codigo_sku), p]));
  const caminho = (src) => /^https?:/.test(src) ? src : '../' + String(src).replace(/^\.?\//, '');
  const listas = () => [['todos', 'Vitrine inicial (sem filtro)', 'Vitrine']]
    .concat(CFG.categorias.map((c) => [c.slug, c.nome, 'Departamentos']))
    .concat((CFG.objetivos || []).map((o) => ['obj:' + o.id, o.nome, 'Objetivos']));
  const nomeLista = (k) => (listas().find((l) => l[0] === k) || [k, k])[1];
  const salvos = (k) => C.destaquesDe(k).filter((s) => porSku.has(s));
  const rascunho = () => (D.rascunho ??= salvos(D.chave));
  const mudou = () => JSON.stringify(rascunho()) !== JSON.stringify(salvos(D.chave));
  /** Produtos que podem entrar nesta lista (os que aparecem nela no site). */
  function candidatos(k) {
    if (k === 'todos') return C.produtos;
    if (k.startsWith('obj:')) { const id = k.slice(4); return C.produtos.filter((p) => (p._obj || []).includes(id)); }
    return C.produtos.filter((p) => p.categoria === k);
  }
  function filtroDaLista(k) { return k === 'todos' ? {} : k.startsWith('obj:') ? { objetivo: k.slice(4) } : { categoria: k }; }
  function miniatura(p) {
    return p._img ? `<img src="${esc(caminho(C.imgUrl(p._img, 120, 120)))}" alt="" loading="lazy">` : `<span class="dq__semfoto">${ic('photo')}</span>`;
  }

  /* ---------------- Tela ---------------- */
  function render() {
    const lista = rascunho(), grupos = {};
    listas().forEach(([k, n, g]) => { (grupos[g] ||= []).push(`<option value="${esc(k)}"${k === D.chave ? ' selected' : ''}>${esc(n)}${salvos(k).length ? ` · ${salvos(k).length} em destaque` : ''}</option>`); });
    const aviso = !MODO_API && D.servidor === false
      ? `<div class="aviso aviso--bad" style="margin-bottom:14px">Para <b>salvar</b>, abra o admin pelo <b>INICIAR-SITE.bat</b> (endereço <b>http://localhost:5510/admin/</b>).</div>` : '';
    return `${aviso}
      <div class="card dq">
        <div class="filtros">
          <label class="dq__onde"><span>Lista</span>
            <select class="inp" data-dq="chave">${Object.entries(grupos).map(([g, o]) => `<optgroup label="${esc(g)}">${o.join('')}</optgroup>`).join('')}</select></label>
        </div>
        <p class="contagem">Estes produtos aparecem <b>primeiro</b>, nesta ordem, em <b>${esc(nomeLista(D.chave))}</b> (vitrine na ordem "Destaques", sem busca).
          Depois vêm os demais, dos mais vendidos para os menos. Até ${MAX} produtos — o que cabe nas 4 primeiras fileiras.</p>
        ${lista.length ? `<ol class="dq__lista" data-dq-lista>${lista.map((s, i) => { const p = porSku.get(s); return `
          <li class="dq__item" data-sku="${esc(s)}"><b class="dq__n">${i + 1}</b>${miniatura(p)}
            <span class="dq__nome">${esc(p.nome)}<small>cód. ${esc(s)} · ${esc(C.catBySlug[p.categoria]?.curto || p.categoria)}</small></span>
            <span class="dq__acoes">
              <button class="btn btn--soft btn--sm" data-dq-sobe="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button>
              <button class="btn btn--soft btn--sm" data-dq-desce="${i}" ${i < lista.length - 1 ? '' : 'disabled'} aria-label="Descer">↓</button>
              <button class="btn btn--soft btn--sm" data-dq-tira="${i}" aria-label="Tirar dos destaques">${ic('x')}</button>
            </span></li>`; }).join('')}</ol>`
          : `<div class="vazio dq__vazio">Nenhum destaque escolhido: a vitrine mostra primeiro os mais vendidos.</div>`}
        <div class="dq__barra">
          <span class="dq__conta">${lista.length} de ${MAX}${mudou() ? ' · <b>alterações não salvas</b>' : ''}</span>
          ${mudou() ? `<button class="btn btn--soft btn--sm" data-dq-desfaz>Desfazer</button>` : ''}
          ${lista.length ? `<button class="btn btn--soft btn--sm" data-dq-limpa>Limpar lista</button>` : ''}
          <button class="btn btn--primary" data-dq-salva ${mudou() && !D.ocupado ? '' : 'disabled'}>${ic('check')}Salvar destaques</button>
        </div>
      </div>
      <div class="card dq">
        <h3>Adicionar produto</h3>
        <input class="inp" type="search" data-dq="busca" placeholder="Buscar por nome ou código em ${esc(nomeLista(D.chave))}" value="${esc(D.busca)}" autocomplete="off">
        <div data-dq-res>${resultadosHTML()}</div>
      </div>
      <div class="card dq">
        <h3>Como fica no site <small>primeiros ${MAX} de ${esc(nomeLista(D.chave))}</small></h3>
        <ol class="dq__previa" data-dq-previa>${previaHTML()}</ol>
      </div>`;
  }
  function resultadosHTML() {
    const q = C.norm(D.busca.trim()), ja = new Set(rascunho());
    if (!q) return '<p class="contagem">Digite parte do nome ou o código do produto.</p>';
    // código exato primeiro ("12" acharia centenas de produtos e o certo podia ficar de fora)
    const achados = candidatos(D.chave).filter((p) => C.norm(p.nome + ' ' + p.codigo_sku).includes(q))
      .sort((a, b) => (String(b.codigo_sku) === D.busca.trim()) - (String(a.codigo_sku) === D.busca.trim())).slice(0, 30);
    if (!achados.length) return `<p class="contagem">Nenhum produto de ${esc(nomeLista(D.chave))} com “${esc(D.busca)}”.</p>`;
    const cheio = rascunho().length >= MAX;
    return `<ul class="dq__res">${achados.map((p) => { const s = String(p.codigo_sku); return `
      <li>${miniatura(p)}<span class="dq__nome">${esc(p.nome)}<small>cód. ${esc(s)}</small></span>
        ${ja.has(s) ? '<span class="pill pill--leaf">Já está</span>' : `<button class="btn btn--soft btn--sm" data-dq-poe="${esc(s)}" ${cheio ? 'disabled title="A lista já tem 16"' : ''}>Adicionar</button>`}</li>`; }).join('')}</ul>
      ${cheio ? `<p class="contagem">A lista já tem ${MAX} produtos: tire um para colocar outro.</p>` : ''}`;
  }
  function previaHTML() {
    const k = D.chave, antes = SALVOS[k];
    SALVOS[k] = rascunho(); // prévia com o rascunho (o site real só muda ao salvar)
    let l; try { l = C.filtrar({ ...filtroDaLista(k), ordem: 'destaque' }).slice(0, MAX); } finally { if (antes === undefined) delete SALVOS[k]; else SALVOS[k] = antes; }
    const ds = new Set(rascunho());
    return l.map((p) => `<li class="${ds.has(String(p.codigo_sku)) ? 'is-dq' : ''}">${esc(p.nome)}</li>`).join('');
  }
  function redesenhar() { const y = scrollY; A.render(); scrollTo(0, y); }

  /* ---------------- Salvar ---------------- */
  async function salvar() {
    if (D.ocupado || !mudou()) return;
    D.ocupado = true; redesenhar();
    const corpo = { chave: D.chave, skus: rascunho() };
    let url, opt;
    if (MODO_API) {
      const base = String(CFG.contas?.apiUrl || '').replace(/\/+$/, ''); let tk = ''; try { tk = localStorage.getItem('loja:admin-token') || ''; } catch { /* */ }
      url = `${base}/admin/destaques/${encodeURIComponent(D.chave)}`;
      opt = { method: 'PUT', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ skus: corpo.skus }) };
    } else {
      url = '/_destaques/salvar';
      opt = { method: 'POST', headers: { 'X-Loja-Pin': A.pin(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
    }
    try {
      let r; try { r = await fetch(url, opt); } catch { throw new Error('Sem conexão com o servidor. O INICIAR-SITE.bat está aberto?'); }
      let d = {}; try { d = await r.json(); } catch { /* */ }
      if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
      if (corpo.skus.length) SALVOS[D.chave] = corpo.skus.slice(); else delete SALVOS[D.chave];
      D.rascunho = null;
      toast(esc(corpo.skus.length ? `Destaques de ${nomeLista(D.chave)} salvos. O site já mostra a nova ordem.` : `Destaques de ${nomeLista(D.chave)} limpos: volta aos mais vendidos.`));
    } catch (err) { toast(esc(err.message), true); }
    D.ocupado = false; redesenhar();
  }

  /* ---------------- Eventos ---------------- */
  document.addEventListener('click', (e) => {
    if (A.rota() !== 'destaques') return;
    const l = rascunho(), b = (s) => e.target.closest(s);
    let x;
    if ((x = b('[data-dq-sobe]'))) { const i = +x.dataset.dqSobe; [l[i - 1], l[i]] = [l[i], l[i - 1]]; return redesenhar(); }
    if ((x = b('[data-dq-desce]'))) { const i = +x.dataset.dqDesce; [l[i + 1], l[i]] = [l[i], l[i + 1]]; return redesenhar(); }
    if ((x = b('[data-dq-tira]'))) { l.splice(+x.dataset.dqTira, 1); return redesenhar(); }
    if ((x = b('[data-dq-poe]'))) { if (l.length < MAX && !l.includes(x.dataset.dqPoe)) l.push(x.dataset.dqPoe); return redesenhar(); }
    if (b('[data-dq-desfaz]')) { D.rascunho = null; return redesenhar(); }
    if (b('[data-dq-limpa]')) { D.rascunho = []; return redesenhar(); }
    if (b('[data-dq-salva]')) return salvar();
  });
  document.addEventListener('change', (e) => {
    if (A.rota() !== 'destaques' || !e.target.matches('[data-dq="chave"]')) return;
    if (mudou() && !confirm('Há alterações não salvas nesta lista. Trocar de lista e descartar?')) { e.target.value = D.chave; return; }
    D.chave = e.target.value; D.rascunho = null; D.busca = ''; A.render();
  });
  document.addEventListener('input', (e) => {
    if (A.rota() !== 'destaques' || !e.target.matches('[data-dq="busca"]')) return;
    D.busca = e.target.value; const box = $('[data-dq-res]'); if (box) box.innerHTML = resultadosHTML();
  });
  async function checarServidor() {
    if (MODO_API || D.servidor !== null) return;
    try { const r = await fetch('/_fotos/status', { cache: 'no-store' }); D.servidor = r.ok; } catch { D.servidor = false; }
    if (!D.servidor && A.rota() === 'destaques') A.render();
  }
  A.registrar('destaques', { render, depois: checarServidor });
})();
