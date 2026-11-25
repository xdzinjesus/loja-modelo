/* ==========================================================================
   LOJA — Área administrativa
   Visão geral · Pedidos · Clientes (ficha completa) · Atacado · Acessos
   Usa window.LojaContas.admin (assets/js/conta-api.js): modo local ou API.
   ========================================================================== */
(function () {
  'use strict';
  const API = window.LojaContas, ADM = API.admin, CFG = window.LOJA_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const ic = (id) => `<svg><use href="#a-${id}"/></svg>`;
  const brl = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlCurto = (v) => v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl(v);
  const pct = (v) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const DIA = 864e5;
  const ts = (iso) => Date.parse(iso) || 0;
  const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const dataCurta = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const relativo = (iso) => {
    if (!iso) return 'nunca';
    const s = (Date.now() - ts(iso)) / 1000;
    if (s < 60) return 'agora'; if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`; if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} dia(s)`;
    return dataCurta(iso);
  };
  const peso = (g) => !g ? '' : g >= 1000 ? `${(g / 1000).toLocaleString('pt-BR')} kg` : `${g} g`;
  const iniciais = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const wa = (fone, msg) => `https://wa.me/55${String(fone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}?text=${encodeURIComponent(msg)}`;
  const pagNome = (p) => ({ pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' })[p] || p;
  const ABERTOS = ['recebido', 'confirmado', 'separando', 'pronto', 'enviado'];
  const valido = (p) => p.status !== 'cancelado';

  const EVENTOS = {
    login: ['Entrou', 'leaf', 'logins'], 'login-falhou': ['Senha errada', 'terra', 'logins'], 'login-limite': ['Bloqueio por tentativas', 'terra', 'logins'],
    'login-bloqueado': ['Conta bloqueada tentou entrar', 'terra', 'logins'], cadastro: ['Criou conta', 'forest', 'cadastros'],
    'senha-alterada': ['Trocou a senha', 'cinza', 'logins'], 'atacado-solicitado': ['Pediu atacado', 'amber', 'cadastros'], pedido: ['Fez pedido', 'leaf', 'pedidos'],
    'admin-login': ['Entrada no painel', 'cinza', 'loja'], 'admin-login-falhou': ['PIN do painel errado', 'terra', 'loja'],
    'admin-editou': ['Loja editou dados', 'cinza', 'loja'], 'admin-bloqueou': ['Loja bloqueou conta', 'terra', 'loja'], 'admin-desbloqueou': ['Loja desbloqueou conta', 'leaf', 'loja'],
    'admin-excluiu': ['Loja excluiu conta', 'terra', 'loja'], 'admin-desconto': ['Loja mudou desconto', 'amber', 'loja'], 'admin-pedido': ['Loja mudou status', 'cinza', 'loja'],
    'admin-atacado-aprovou': ['Loja aprovou atacado', 'leaf', 'loja'], 'admin-atacado-recusou': ['Loja recusou/revogou atacado', 'terra', 'loja'],
    'admin-senha-temporaria': ['Loja gerou senha temporária', 'amber', 'loja']
  };
  const evento = (t) => EVENTOS[t] || [t, 'cinza', 'outros'];

  const S = {
    usuarios: [], pedidos: [], log: [], rota: 'visao', fichaId: null, senhas: {}, abertos: new Set(), tabelaGrafico: false,
    f: {
      pedidos: { busca: '', status: 'abertos', tipo: 'todos', periodo: 'todos' },
      clientes: { busca: '', seg: 'todos' },
      atacado: { aba: 'pendentes' },
      acessos: { busca: '', grupo: 'todos' }
    }
  };
  const porId = () => new Map(S.usuarios.map((u) => [u.id, u]));
  const descPadrao = () => +(CFG.contas?.atacado?.descontoPercentual || 0);

  /* ---------------- Toast ---------------- */
  function toast(msg, ruim) {
    const t = document.createElement('div'); t.className = 'toast' + (ruim ? ' bad' : '');
    t.innerHTML = `${ic(ruim ? 'alert' : 'check')}<span>${msg}</span>`;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
  }

  /* ---------------- Login ---------------- */
  function telaLogin(erro = '') {
    $('#adm').hidden = true; fecharFicha();
    let box = $('#login');
    if (!box) { box = document.createElement('div'); box.id = 'login'; box.className = 'login'; document.body.prepend(box); }
    box.hidden = false;
    const local = API.modo === 'local';
    box.innerHTML = `<div class="login__card">
      <img src="../assets/img/logo.svg" alt="Logo">
      <h1>Administração</h1>
      <p>${local ? 'Digite o PIN do painel.' : 'Entre com o login de administrador.'}</p>
      <form id="f-login">
        ${local ? '<input class="inp" name="pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="current-password" required autofocus>' : '<input class="inp" name="email" type="email" placeholder="E-mail" autocomplete="username" required autofocus><input class="inp" name="senha" type="password" placeholder="Senha" autocomplete="current-password" required>'}
        <p class="login__erro">${esc(erro)}</p>
        <button class="btn btn--primary" type="submit">Entrar</button>
      </form>
      ${local ? '<p style="margin:16px 0 0;font-size:12px">Modo local: o PIN fica em <code>assets/js/config.js → contas.painelPin</code>.</p>' : ''}
    </div>`;
    $('#f-login').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button', e.target); btn.disabled = true;
      const dados = Object.fromEntries(new FormData(e.target).entries());
      try {
        await ADM.entrar(dados);
        // modo local: o PIN autoriza o servidor local a gravar fotos (seção "Fotos")
        if (local) { try { sessionStorage.setItem('loja:admin-pin', dados.pin); } catch { /* */ } }
        box.hidden = true; $('#adm').hidden = false; await carregar(); rotear();
      }
      catch (err) { telaLogin(err.message); }
    };
  }

  /* ---------------- Dados ---------------- */
  async function carregar() {
    try { [S.usuarios, S.pedidos, S.log] = await Promise.all([ADM.usuarios(), ADM.pedidos(), ADM.atividade()]); }
    catch (err) { if (!ADM.logado()) return telaLogin(err.message); toast(esc(err.message), true); }
    $('#hora').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    badges();
  }
  const falhasRecentes = () => {
    const desde = Date.now() - DIA; const m = new Map();
    S.log.filter((e) => ['login-falhou', 'login-limite'].includes(e.tipo) && ts(e.em) >= desde && e.email)
      .forEach((e) => m.set(e.email, (m.get(e.email) || 0) + 1));
    return m;
  };
  function badges() {
    const set = (k, n) => { const b = $(`[data-badge="${k}"]`); b.hidden = !n; b.textContent = n; };
    set('pedidos', S.pedidos.filter((p) => p.status === 'recebido').length);
    set('atacado', S.usuarios.filter((u) => u.atacado?.status === 'pendente').length);
    set('acessos', [...falhasRecentes().values()].filter((n) => n >= 3).length);
    // aba do navegador mostra pedidos novos: "(2) Administração"
    const novos = S.pedidos.filter((p) => p.status === 'recebido').length;
    document.title = (novos ? `(${novos}) ` : '') + 'Administração';
  }
  // atualiza sozinho a cada minuto (sem atrapalhar quem está digitando ou com a ficha aberta)
  setInterval(async () => {
    if (!ADM.logado() || $('#adm').hidden || document.hidden) return;
    const digitando = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    await carregar();
    if (!digitando && !S.fichaId && !$('#foto-ficha')?.classList.contains('on')) { const y = scrollY; render(); scrollTo(0, y); }
  }, 60000);
  function statsCliente(id) {
    const ps = S.pedidos.filter((p) => p.usuarioId === id);
    const v = ps.filter(valido);
    const total = v.reduce((s, p) => s + p.total, 0);
    return { ps, n: v.length, total, ticket: v.length ? total / v.length : 0, ultimo: v[0]?.criadoEm || null };
  }

  /* ---------------- Roteamento ---------------- */
  const TITULOS = {
    visao: ['Visão geral', 'Resumo das vendas, do atacado e do que precisa da sua atenção'],
    pedidos: ['Pedidos', 'Acompanhe e atualize o status — o cliente vê na hora em "Meus pedidos"'],
    clientes: ['Clientes', 'Contas, acessos, dados e bloqueios'],
    atacado: ['Atacado', 'Solicitações, empresas ativas e descontos'],
    fotos: ['Produtos e fotos', 'Altere nome, preço e descrição e envie, troque ou remova a foto de cada produto'],
    destaques: ['Destaques da vitrine', 'Escolha quais produtos aparecem primeiro na vitrine, em cada departamento e em cada objetivo'],
    acessos: ['Acessos', 'Logins, senhas erradas, cadastros e ações da loja']
  };
  const EXT = {}; // seções em arquivos separados (ex.: admin-fotos.js)
  function rotear() {
    const [rota, id] = (location.hash.slice(1) || 'visao').split('/');
    S.rota = TITULOS[rota] ? rota : 'visao';
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.rota === S.rota));
    $('#titulo').textContent = TITULOS[S.rota][0]; $('#subtitulo').textContent = TITULOS[S.rota][1];
    render();
    if (S.rota === 'clientes' && id) abrirFicha(decodeURIComponent(id)); else fecharFicha(true);
    if (EXT.fotos) { if (S.rota === 'fotos' && id) EXT.fotos.abrir(decodeURIComponent(id)); else EXT.fotos.fechar(true); }
  }
  function render() {
    const c = $('#conteudo');
    const views = { visao, pedidos: viewPedidos, clientes: viewClientes, atacado: viewAtacado, acessos: viewAcessos, fotos: () => (EXT.fotos ? EXT.fotos.render() : ''), destaques: () => (EXT.destaques ? EXT.destaques.render() : '') };
    c.innerHTML = views[S.rota]();
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    if (S.rota === 'visao') ligarGrafico();
    if (EXT[S.rota] && EXT[S.rota].depois) EXT[S.rota].depois();
  }
  window.LojaAdmin = {
    toast, esc, ic, brl, render, dataHora, baixarCSV: (...a) => baixarCSV(...a),
    registrar(nome, mod) { EXT[nome] = mod; if (S.rota === nome && !$('#adm').hidden) rotear(); },
    pin() { try { return sessionStorage.getItem('loja:admin-pin') || ''; } catch { return ''; } },
    rota: () => S.rota
  };
  addEventListener('hashchange', rotear);

  /* ======================================================================
     Visão geral
     ====================================================================== */
  function visao() {
    const agora = Date.now(), d30 = agora - 30 * DIA, d60 = agora - 60 * DIA;
    const v = S.pedidos.filter(valido);
    const p30 = v.filter((p) => ts(p.criadoEm) >= d30), pAnt = v.filter((p) => ts(p.criadoEm) >= d60 && ts(p.criadoEm) < d30);
    const fat = p30.reduce((s, p) => s + p.total, 0), fatAnt = pAnt.reduce((s, p) => s + p.total, 0);
    const fatAtac = p30.filter((p) => p.atacado).reduce((s, p) => s + p.total, 0);
    const delta = fatAnt ? ((fat - fatAnt) / fatAnt) * 100 : null;
    const novos30 = S.usuarios.filter((u) => ts(u.criadoEm) >= d30).length;
    const abertos = S.pedidos.filter((p) => ABERTOS.includes(p.status)).length;

    const novos = S.pedidos.filter((p) => p.status === 'recebido').length;
    const pend = S.usuarios.filter((u) => u.atacado?.status === 'pendente').length;
    const susp = [...falhasRecentes().entries()].filter(([, n]) => n >= 3);
    const bloq = S.usuarios.filter((u) => u.bloqueado).length;
    const itens = [
      novos && `<a href="#pedidos" data-filtro-pedidos="recebido">${ic('bag')}<span>${novos} pedido(s) novo(s) aguardando confirmação</span>${ic('right')}</a>`,
      pend && `<a href="#atacado">${ic('box')}<span>${pend} solicitação(ões) de atacado para analisar</span>${ic('right')}</a>`,
      susp.length && `<a class="bad" href="#acessos">${ic('alert')}<span>${susp.length} conta(s) com 3+ senhas erradas nas últimas 24 h</span>${ic('right')}</a>`,
      bloq && `<a class="bad" href="#clientes" data-seg-clientes="bloqueados">${ic('lock')}<span>${bloq} conta(s) bloqueada(s)</span>${ic('right')}</a>`
    ].filter(Boolean);

    // Ranking 30 dias
    const prod = new Map();
    p30.forEach((p) => p.itens.forEach((i) => { const r = prod.get(i.id) || { nome: i.nome, qty: 0, total: 0 }; r.qty += i.qty; r.total += i.total; prod.set(i.id, r); }));
    const topProd = [...prod.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    const cli = new Map();
    p30.forEach((p) => { const r = cli.get(p.usuarioId) || { id: p.usuarioId, nome: p.cliente?.nome || p.conta?.nome || '—', n: 0, total: 0, atac: p.atacado }; r.n++; r.total += p.total; cli.set(p.usuarioId, r); });
    const topCli = [...cli.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    const ranking = (lista, rotulo, max) => lista.length ? `<ul class="rank">${lista.map((r) => `<li><span>${rotulo(r)}</span><b>${brl(r.total)}</b><div class="bar"><i style="width:${Math.max(3, (r.total / max) * 100)}%"></i></div></li>`).join('')}</ul>` : '<p class="vazio">Sem vendas nos últimos 30 dias.</p>';

    return `
      <div class="kpis">
        <div class="kpi"><span>Faturamento · 30 dias</span><b>${brl(fat)}</b><small>${delta === null ? 'sem período anterior para comparar' : `${delta >= 0 ? '▲' : '▼'} ${pct(Math.abs(delta))} vs. 30 dias anteriores`}</small></div>
        <div class="kpi"><span>Pedidos · 30 dias</span><b>${p30.length}</b><small>${abertos} em andamento agora</small></div>
        <div class="kpi"><span>Ticket médio</span><b>${brl(p30.length ? fat / p30.length : 0)}</b><small>últimos 30 dias</small></div>
        <div class="kpi"><span>Atacado no faturamento</span><b>${pct(fat ? (fatAtac / fat) * 100 : 0)}</b><small>${brl(fatAtac)} em 30 dias</small></div>
        <div class="kpi"><span>Clientes</span><b>${S.usuarios.length}</b><small>+${novos30} nos últimos 30 dias</small></div>
      </div>
      <div class="grade grade--3">
        <div class="card">
          <h3>Faturamento por dia <small>últimos 14 dias · sem cancelados</small></h3>
          ${grafico14()}
        </div>
        <div class="card">
          <h3>Precisa de atenção</h3>
          <div class="atencao">${itens.length ? itens.join('') : `<a class="ok" href="#pedidos">${ic('check')}<span>Tudo em dia por aqui.</span></a>`}</div>
        </div>
      </div>
      <div class="grade grade--2" style="margin-top:16px">
        <div class="card"><h3>Produtos que mais vendem <small>30 dias</small></h3>${ranking(topProd, (r) => `${esc(r.nome)} <small style="display:inline">· ${r.qty} un.</small>`, topProd[0]?.total || 1)}</div>
        <div class="card"><h3>Clientes que mais compram <small>30 dias</small></h3>${ranking(topCli, (r) => `<a href="#clientes/${encodeURIComponent(r.id)}">${esc(r.nome)}</a>${r.atac ? ' <span class="pill pill--forest">Atacado</span>' : ''} <small style="display:inline">· ${r.n} pedido(s)</small>`, topCli[0]?.total || 1)}</div>
      </div>`;
  }

  // Barras empilhadas: varejo (base) + atacado (topo), 2px de respiro entre segmentos, topo arredondado 4px
  function dados14() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = Array.from({ length: 14 }, (_, i) => { const d = new Date(hoje.getTime() - (13 - i) * DIA); return { d, varejo: 0, atacado: 0 }; });
    S.pedidos.filter(valido).forEach((p) => {
      const d = new Date(p.criadoEm); d.setHours(0, 0, 0, 0);
      const i = Math.round((d - dias[0].d) / DIA); if (i < 0 || i > 13) return;
      dias[i][p.atacado ? 'atacado' : 'varejo'] += p.total;
    });
    return dias;
  }
  function grafico14() {
    const dias = dados14();
    const max = Math.max(...dias.map((d) => d.varejo + d.atacado), 0);
    const leg = `<div class="legenda"><span><i style="background:var(--s-varejo)"></i>Varejo</span><span><i style="background:var(--s-atacado)"></i>Atacado</span><span style="margin-left:auto"><button class="link-tabela" data-acao="tabela-grafico">${S.tabelaGrafico ? 'Ver gráfico' : 'Ver como tabela'}</button></span></div>`;
    if (S.tabelaGrafico) {
      return leg + `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Dia</th><th class="num">Varejo</th><th class="num">Atacado</th><th class="num">Total</th></tr></thead><tbody>${dias.slice().reverse().map((d) => `<tr><td>${d.d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td class="num">${brl(d.varejo)}</td><td class="num">${brl(d.atacado)}</td><td class="num"><b>${brl(d.varejo + d.atacado)}</b></td></tr>`).join('')}</tbody></table></div>`;
    }
    if (!max) return leg + '<p class="vazio">Nenhuma venda nos últimos 14 dias.</p>';
    const W = 700, H = 240, L = 62, B = 26, T = 10, pw = W - L - 6, ph = H - B - T;
    const passo = (() => { const bruto = max / 3; const mag = 10 ** Math.floor(Math.log10(bruto)); return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= bruto); })();
    const topo = passo * 3, y = (v) => T + ph - (v / topo) * ph;
    const col = pw / 14, bw = Math.min(28, col * 0.58);
    const arred = (x, yy, w, h, r) => { r = Math.min(r, h, w / 2); return `M${x},${yy + h}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + w - r}Q${x + w},${yy} ${x + w},${yy + r}V${yy + h}Z`; };
    let g = '<g class="grade-y">';
    for (let k = 0; k <= 3; k++) { const v = passo * k, yy = y(v); g += `<line x1="${L}" x2="${W - 6}" y1="${yy}" y2="${yy}"/><text class="rot-y" x="${L - 8}" y="${yy + 4}" text-anchor="end">${brlCurto(v)}</text>`; }
    g += '</g>';
    dias.forEach((d, i) => {
      const cx = L + col * i + col / 2, x = cx - bw / 2;
      const hv = (d.varejo / topo) * ph, ha = (d.atacado / topo) * ph;
      const base = T + ph;
      let barras = '';
      if (hv > 0) barras += ha > 0 ? `<rect class="barra" x="${x}" y="${base - hv}" width="${bw}" height="${hv}" fill="var(--s-varejo)"/>` : `<path class="barra" d="${arred(x, base - hv, bw, hv, 4)}" fill="var(--s-varejo)"/>`;
      if (ha > 0) { const gap = hv > 0 ? 2 : 0; barras += `<path class="barra" d="${arred(x, base - hv - gap - ha, bw, ha, 4)}" fill="var(--s-atacado)"/>`; }
      const rot = (i % 2 === 1 || i === 13) ? `<text class="rot-x" x="${cx}" y="${H - 6}" text-anchor="middle">${d.d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</text>` : '';
      g += `<g class="dia" data-i="${i}">${barras}<rect class="alvo" x="${L + col * i}" y="${T}" width="${col}" height="${ph}"/>${rot}</g>`;
    });
    S._dias = dias;
    return leg + `<div class="grafico"><svg class="plot" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Faturamento por dia nos últimos 14 dias, varejo e atacado">${g}</svg><div class="dica" hidden></div></div>`;
  }
  function ligarGrafico() {
    const box = $('.grafico'); if (!box) return;
    const dica = $('.dica', box);
    const mostrar = (gEl) => {
      $$('.dia.foco', box).forEach((x) => x.classList.remove('foco'));
      if (!gEl) { dica.hidden = true; return; }
      gEl.classList.add('foco');
      const d = S._dias[+gEl.dataset.i];
      const alvo = $('.alvo', gEl).getBoundingClientRect(), b = box.getBoundingClientRect();
      const topoBarra = Math.min(...$$('.barra', gEl).map((el) => el.getBoundingClientRect().top), alvo.bottom);
      dica.innerHTML = `<b>${d.d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</b>
        <div><span><i style="background:var(--s-varejo)"></i>Varejo</span><span>${brl(d.varejo)}</span></div>
        <div><span><i style="background:var(--s-atacado)"></i>Atacado</span><span>${brl(d.atacado)}</span></div>
        <div><span>Total</span><b>${brl(d.varejo + d.atacado)}</b></div>`;
      dica.hidden = false;
      const x = Math.min(Math.max(alvo.left + alvo.width / 2 - b.left, 90), b.width - 90);
      dica.style.left = x + 'px'; dica.style.top = Math.max(topoBarra - b.top - 8, 70) + 'px';
    };
    box.addEventListener('pointermove', (e) => mostrar(e.target.closest('.dia')));
    box.addEventListener('pointerleave', () => mostrar(null));
  }

  /* ======================================================================
     Pedidos
     ====================================================================== */
  function filtrarPedidos() {
    const f = S.f.pedidos, q = f.busca.trim().toLowerCase();
    const desde = f.periodo === 'todos' ? 0 : Date.now() - +f.periodo * DIA;
    return S.pedidos.filter((p) =>
      (f.status === 'todos' || (f.status === 'abertos' ? ABERTOS.includes(p.status) : p.status === f.status)) &&
      (f.tipo === 'todos' || (f.tipo === 'atacado') === !!p.atacado) &&
      ts(p.criadoEm) >= desde &&
      (!q || [p.id, p.cliente?.nome, p.conta?.email, p.conta?.nome, p.cliente?.fone].join(' ').toLowerCase().includes(q)));
  }
  function viewPedidos() {
    const f = S.f.pedidos, lista = filtrarPedidos();
    const seg = [['abertos', 'Em andamento'], ['recebido', 'Novos'], ['todos', 'Todos'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados']];
    const total = lista.filter(valido).reduce((s, p) => s + p.total, 0);
    return `<div class="filtros">
        <div class="seg" data-grupo="status">${seg.map(([k, n]) => `<button data-v="${k}" class="${f.status === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <select class="inp" data-f="tipo"><option value="todos">Varejo e atacado</option><option value="varejo"${f.tipo === 'varejo' ? ' selected' : ''}>Só varejo</option><option value="atacado"${f.tipo === 'atacado' ? ' selected' : ''}>Só atacado</option></select>
        <select class="inp" data-f="periodo">${[['todos', 'Todo o período'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']].map(([k, n]) => `<option value="${k}"${f.periodo === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="filtros">
        <input class="inp busca" type="search" data-f="busca" placeholder="Buscar por nº do pedido, nome, e-mail ou telefone" value="${esc(f.busca)}">
        <button class="btn btn--soft" data-acao="csv-pedidos">${ic('download')}Exportar planilha</button>
      </div>
      <p class="contagem">${lista.length} pedido(s) · ${brl(total)} (sem cancelados)</p>
      <div class="pedidos">${lista.length ? lista.map(pedidoHTML).join('') : '<div class="card vazio">Nenhum pedido neste filtro.</div>'}</div>`;
  }
  function pedidoHTML(p) {
    const st = API.STATUS[p.status] || { nome: p.status, cor: 'amber' };
    const aberto = S.abertos.has(p.id);
    const u = porId().get(p.usuarioId);
    const fone = p.cliente?.fone || u?.fone || p.conta?.fone;
    const KE = window.LojaEndereco, pe = p.entrega || {};
    const ent = pe.tipo === 'entrega' ? `Entrega · ${esc([pe.bairro, pe.cidade].filter(Boolean).join(', ') || pe.cep || '')}` : 'Retirada na loja';
    const entCompleta = pe.tipo === 'entrega' && KE
      ? `${esc(KE.formatarCompleto(pe)).replace(/\n/g, '<br>')}<br><a href="${esc(KE.mapsUrl(pe))}" target="_blank" rel="noopener">Abrir no Google Maps</a>`
      : ent;
    return `<article class="ped${aberto ? ' aberto' : ''}" data-pedido="${esc(p.id)}">
      <button class="ped__head" data-acao="abrir-pedido">
        <span><b>${esc(p.id)}</b> · ${esc(p.cliente?.nome || p.conta?.nome || '—')}${p.atacado ? ' <span class="pill pill--forest">Atacado</span>' : ''}${p.contaExcluida ? ' <span class="pill pill--cinza">conta excluída</span>' : ''}${p.observacoes ? ' <span class="pill pill--amber">tem observação</span>' : ''}
          <small>${dataHora(p.criadoEm)} · ${ent} · ${esc(pagNome(p.pagamento))} · ${p.itens.reduce((s, i) => s + i.qty, 0)} item(ns)</small></span>
        <span class="pill pill--${st.cor}">${esc(st.nome)}</span>
        <b class="ped__total">${brl(p.total)}</b>
        <svg class="ped__chev"><use href="#a-down"/></svg>
      </button>
      ${aberto ? `<div class="ped__corpo">
        <div>
          <table class="ped__itens">${p.itens.map((i) => `<tr><td>${i.qty}×</td><td>${esc(i.nome)} <small>cód. ${esc(i.sku)} · ${peso(i.g) || esc(i.conteudo || 'un.')} · ${brl(i.unitario)}</small></td><td>${brl(i.total)}</td></tr>`).join('')}
            <tr><td></td><td><small>Subtotal ${brl(p.subtotal)} · frete ${p.frete ? brl(p.frete) : 'grátis'}${p.descontoAtacado ? ` · desc. atacado −${brl(p.descontoAtacado)}` : ''}${p.cupom ? ` · cupom ${esc(p.cupom.codigo)} ${p.cupom.desconto ? `−${brl(p.cupom.desconto)}` : `(frete grátis)`}` : ''}${p.descontoPix ? ` · desc. Pix −${brl(p.descontoPix)}` : ''}</small></td><td></td></tr>
            <tr class="tot"><td></td><td>Total</td><td>${brl(p.total)}</td></tr></table>
        </div>
        <div>
          <dl class="dl" style="margin-bottom:12px">
            <dt>Cliente</dt><dd>${u ? `<a href="#clientes/${encodeURIComponent(u.id)}">${esc(u.nome)}</a>` : esc(p.cliente?.nome || '—')}</dd>
            <dt>E-mail</dt><dd>${esc(u?.email || p.conta?.email || '—')}</dd>
            <dt>WhatsApp</dt><dd>${esc(API.fmt.fone(fone || ''))}</dd>
            <dt>Entrega</dt><dd>${entCompleta}</dd>
            <dt>Pagamento</dt><dd>${esc(pagNome(p.pagamento))}</dd>
          </dl>
          ${p.observacoes ? `<div class="aviso" style="margin-bottom:12px"><b>Observação do cliente:</b> ${esc(p.observacoes)}</div>` : ''}
          <ul class="hist">${p.historico.map((h) => `<li><span><b>${esc(API.STATUS[h.status]?.nome || h.status)}</b> · ${dataHora(h.em)}${h.nota ? `<small>${esc(h.nota)}</small>` : ''}</span></li>`).join('')}</ul>
          <div class="campo"><label class="rot">Mudar status</label>
            <select class="inp" data-novo-status>${Object.entries(API.STATUS).map(([k, v]) => `<option value="${k}"${k === p.status ? ' selected' : ''}>${v.nome}</option>`).join('')}</select></div>
          <div class="campo"><input class="inp" data-nota placeholder="Recado para o cliente (opcional) — ex.: código de rastreio" maxlength="300"></div>
          <div class="linha">
            <button class="btn btn--primary btn--sm" data-acao="status">${ic('check')}Salvar status</button>
            ${fone ? `<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(fone, `Olá, ${(p.cliente?.nome || '').split(' ')[0]}! Aqui é da ${CFG.loja.nomeCurto}, sobre o seu pedido ${p.id}: `)}">${ic('whats')}WhatsApp</a>` : ''}
          </div>
        </div>
      </div>` : ''}
    </article>`;
  }

  /* ======================================================================
     Clientes
     ====================================================================== */
  function filtrarClientes() {
    const f = S.f.clientes, q = f.busca.trim().toLowerCase(), d30 = Date.now() - 30 * DIA;
    return S.usuarios.filter((u) => {
      const seg = f.seg === 'todos' || (f.seg === 'atacado' && u.atacado?.status === 'aprovado') || (f.seg === 'pendentes' && u.atacado?.status === 'pendente')
        || (f.seg === 'bloqueados' && u.bloqueado) || (f.seg === 'novos' && ts(u.criadoEm) >= d30);
      return seg && (!q || [u.nome, u.email, u.fone, API.fmt.fone(u.fone), u.atacado?.razaoSocial, u.atacado?.cnpj].join(' ').toLowerCase().includes(q));
    });
  }
  const tipoCliente = (u) => u.atacado?.status === 'aprovado' ? '<span class="pill pill--forest">Atacado</span>' : u.atacado?.status === 'pendente' ? '<span class="pill pill--amber">Atacado em análise</span>' : '<span class="pill pill--cinza">Varejo</span>';
  function viewClientes() {
    const f = S.f.clientes, lista = filtrarClientes(), falhas = falhasRecentes();
    const n = (fn) => S.usuarios.filter(fn).length;
    const seg = [['todos', `Todos (${S.usuarios.length})`], ['atacado', `Atacado (${n((u) => u.atacado?.status === 'aprovado')})`], ['pendentes', `Em análise (${n((u) => u.atacado?.status === 'pendente')})`], ['bloqueados', `Bloqueados (${n((u) => u.bloqueado)})`], ['novos', 'Novos · 30 dias']];
    return `<div class="filtros">
        <div class="seg" data-grupo="seg">${seg.map(([k, t]) => `<button data-v="${k}" class="${f.seg === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div class="filtros">
        <input class="inp busca" type="search" data-f="busca" placeholder="Buscar por nome, e-mail, telefone, empresa ou CNPJ" value="${esc(f.busca)}">
        <button class="btn btn--soft" data-acao="csv-clientes">${ic('download')}Exportar planilha</button>
      </div>
      <p class="contagem">${lista.length} cliente(s) · clique numa linha para abrir a ficha</p>
      ${lista.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Tipo</th><th class="num">Pedidos</th><th class="num">Total gasto</th><th>Último acesso</th><th>Situação</th></tr></thead><tbody>
        ${lista.map((u) => { const s = statsCliente(u.id); const fx = falhas.get(u.email) || 0; return `<tr class="clicavel${u.bloqueado || fx >= 3 ? ' alerta' : ''}" data-cliente="${esc(u.id)}">
          <td><b>${esc(u.nome)}</b><small>${esc(u.email)}</small></td>
          <td>${esc(API.fmt.fone(u.fone))}</td>
          <td>${tipoCliente(u)}${u.atacado?.razaoSocial && u.atacado.status === 'aprovado' ? `<small>${esc(u.atacado.razaoSocial)}</small>` : ''}</td>
          <td class="num">${s.n}</td><td class="num">${brl(s.total)}</td>
          <td>${relativo(u.ultimoAcesso)}<small>${u.acessos || 0} acesso(s)</small></td>
          <td>${u.bloqueado ? '<span class="pill pill--terra">' + ic('lock') + 'Bloqueada</span>' : fx >= 3 ? `<span class="pill pill--terra">${fx} senhas erradas</span>` : u.senhaTemporaria ? '<span class="pill pill--amber">Senha temporária</span>' : '<span class="pill pill--leaf">Ativa</span>'}</td>
        </tr>`; }).join('')}</tbody></table></div>` : '<div class="card vazio">Nenhum cliente neste filtro.</div>'}`;
  }

  /* ---------- Ficha do cliente ---------- */
  function abrirFicha(id) {
    const u = porId().get(id);
    if (!u) { fecharFicha(true); if (S.usuarios.length) toast('Cliente não encontrado (pode ter sido excluído).', true); return; }
    S.fichaId = id;
    $('#ficha-painel').innerHTML = fichaHTML(u);
    const f = $('#ficha'); f.classList.add('on'); f.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function fecharFicha(semHash) {
    S.fichaId = null;
    const f = $('#ficha'); f.classList.remove('on'); f.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (!semHash && /^#clientes\//.test(location.hash)) history.replaceState(null, '', '#clientes');
  }
  function fichaHTML(u) {
    const s = statsCliente(u.id), a = u.atacado || { status: 'nenhum' };
    const fx = falhasRecentes().get(u.email) || 0;
    const ev = S.log.filter((e) => e.usuarioId === u.id || (e.email && e.email === u.email)).slice(0, 12);
    const stA = { pendente: ['amber', 'Em análise'], aprovado: ['forest', 'Aprovado'], recusado: ['terra', 'Recusado/revogado'] }[a.status];
    return `<div class="ficha__topo">
        <span class="avatar">${esc(iniciais(u.nome))}</span>
        <div><h2>${esc(u.nome)}</h2><small>${esc(u.email)}</small>
          <div class="pills">${tipoCliente(u)}${u.bloqueado ? '<span class="pill pill--terra">Bloqueada</span>' : '<span class="pill pill--leaf">Ativa</span>'}${u.senhaTemporaria ? '<span class="pill pill--amber">Senha temporária</span>' : ''}</div></div>
        <button class="ficha__x" data-fechar aria-label="Fechar">${ic('x')}</button>
      </div>
      <div class="ficha__corpo">
        ${u.bloqueado ? `<div class="aviso aviso--bad"><b>Conta bloqueada</b> em ${dataHora(u.bloqueado.em)}${u.bloqueado.motivo ? ` — ${esc(u.bloqueado.motivo)}` : ''}. O cliente não consegue entrar.</div>` : ''}
        ${fx >= 3 ? `<div class="aviso aviso--bad">${fx} tentativas de senha errada nas últimas 24 h. Se não foi o cliente, considere bloquear ou gerar senha temporária.</div>` : ''}
        ${S.senhas[u.id] ? `<div class="aviso aviso--ok">Senha temporária: <span class="senha-temp">${esc(S.senhas[u.id])}</span><br><small>Passe ao cliente pelo WhatsApp. Ao entrar, ele é orientado a criar uma senha nova.</small></div>` : ''}

        <div class="card"><h3>Resumo</h3><dl class="dl">
          <dt>Cliente desde</dt><dd>${dataCurta(u.criadoEm)}</dd>
          <dt>Último acesso</dt><dd>${u.ultimoAcesso ? `${dataHora(u.ultimoAcesso)} (${relativo(u.ultimoAcesso)})` : 'nunca'}</dd>
          <dt>Acessos</dt><dd>${u.acessos || 0}</dd>
          <dt>Senhas erradas · 24 h</dt><dd>${fx}</dd>
          <dt>Pedidos</dt><dd>${s.n} · ${brl(s.total)} (ticket médio ${brl(s.ticket)})</dd>
        </dl>
        <div class="linha" style="margin-top:12px"><a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(u.fone, `Olá, ${u.nome.split(' ')[0]}! Aqui é da ${CFG.loja.nomeCurto}.`)}">${ic('whats')}WhatsApp</a></div></div>

        <form class="card" data-form="dados"><h3>Dados da conta</h3>
          <div class="campo" data-campo="nome"><label class="rot" for="fx-nome">Nome</label><input class="inp" id="fx-nome" name="nome" value="${esc(u.nome)}"><div class="msg" hidden></div></div>
          <div class="campo" data-campo="email"><label class="rot" for="fx-email">E-mail (login)</label><input class="inp" id="fx-email" name="email" type="email" value="${esc(u.email)}"><div class="msg" hidden></div></div>
          <div class="campo" data-campo="fone"><label class="rot" for="fx-fone">WhatsApp</label><input class="inp" id="fx-fone" name="fone" value="${esc(API.fmt.fone(u.fone))}"><div class="msg" hidden></div></div>
          <button class="btn btn--primary btn--sm" type="submit">${ic('check')}Salvar dados</button>
        </form>

        <div class="card"><h3>Atacado ${stA ? `<span class="pill pill--${stA[0]}">${stA[1]}</span>` : ''}</h3>
          ${a.status === 'nenhum' ? '<p style="margin:0;color:var(--muted);font-size:14px">Este cliente ainda não pediu conta atacado. Ele solicita em "Minha conta › Atacado".</p>' : `
          <dl class="dl"><dt>Empresa</dt><dd>${esc(a.razaoSocial)}</dd><dt>CNPJ</dt><dd>${esc(API.fmt.cnpj(a.cnpj))} · <a href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noopener">consultar na Receita</a></dd>
            <dt>Cidade</dt><dd>${esc(a.cidade)}</dd><dt>Negócio</dt><dd>${esc(a.ramo)}</dd><dt>Solicitado</dt><dd>${dataHora(a.solicitadoEm)}</dd>${a.respondidoEm ? `<dt>Respondido</dt><dd>${dataHora(a.respondidoEm)}</dd>` : ''}${a.motivo ? `<dt>Observação</dt><dd>${esc(a.motivo)}</dd>` : ''}</dl>
          <div class="campo" style="margin-top:14px"><label class="rot">Desconto no checkout</label>
            <div class="linha"><input class="inp desc-inp" data-desconto type="number" min="0" max="50" step="0.5" value="${a.descontoPercentual ?? ''}" placeholder="${descPadrao()}"><span>%</span><small>vazio = padrão da loja (${descPadrao()}%)</small><button class="btn btn--soft btn--sm" data-acao="salvar-desconto">Salvar desconto</button></div></div>
          <div class="campo"><input class="inp" data-motivo placeholder="Observação para o cliente (aparece se recusar/revogar)" value="${esc(a.motivo || '')}"></div>
          <div class="linha">
            ${a.status !== 'aprovado' ? `<button class="btn btn--ok btn--sm" data-acao="aprovar">${ic('check')}Aprovar atacado</button>` : ''}
            ${a.status === 'pendente' ? `<button class="btn btn--bad btn--sm" data-acao="recusar">Recusar</button>` : ''}
            ${a.status === 'aprovado' ? `<button class="btn btn--bad btn--sm" data-acao="recusar">Revogar acesso de atacado</button>` : ''}
          </div>`}
        </div>

        <form class="card" data-form="nota"><h3>Observação interna <small>o cliente não vê</small></h3>
          <textarea class="inp" name="notaInterna" maxlength="2000" placeholder="Ex.: prefere retirar sábado; paga sempre no Pix; cliente do restaurante X…">${esc(u.notaInterna || '')}</textarea>
          <button class="btn btn--soft btn--sm" type="submit" style="margin-top:10px">Salvar observação</button>
        </form>

        <div class="card"><h3>Pedidos <small>${s.ps.length}</small></h3>
          ${s.ps.length ? `<table class="tab"><tbody>${s.ps.map((p) => `<tr class="clicavel" data-ir-pedido="${esc(p.id)}"><td><b>${esc(p.id)}</b><small>${dataCurta(p.criadoEm)}${p.atacado ? ' · atacado' : ''}</small></td><td><span class="pill pill--${API.STATUS[p.status]?.cor || 'amber'}">${esc(API.STATUS[p.status]?.nome || p.status)}</span></td><td class="num">${brl(p.total)}</td></tr>`).join('')}</tbody></table>` : '<p style="margin:0;color:var(--muted);font-size:14px">Nenhum pedido ainda.</p>'}
        </div>

        <div class="card"><h3>Atividade recente</h3>
          ${ev.length ? `<table class="tab"><tbody>${ev.map((e) => `<tr><td style="white-space:nowrap">${dataHora(e.em)}</td><td><span class="pill pill--${evento(e.tipo)[1]}">${esc(evento(e.tipo)[0])}</span></td><td><small>${esc(e.detalhe || '')}</small></td></tr>`).join('')}</tbody></table>` : '<p style="margin:0;color:var(--muted);font-size:14px">Sem registros.</p>'}
        </div>

        <div class="card perigo"><h3>${ic('lock')}Acesso e segurança</h3>
          <div class="linha" style="margin-bottom:12px">
            <button class="btn btn--soft btn--sm" data-acao="senha-temp">Gerar senha temporária</button>
            <small>A senha atual deixa de funcionar.</small>
          </div>
          ${u.bloqueado
            ? `<button class="btn btn--ok btn--sm" data-acao="desbloquear">${ic('check')}Desbloquear conta</button>`
            : `<div class="linha" style="margin-bottom:12px"><input class="inp" data-motivo-bloqueio placeholder="Motivo do bloqueio (interno)"><button class="btn btn--bad btn--sm" data-acao="bloquear">${ic('lock')}Bloquear conta</button></div>`}
          <div class="linha" style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--line-2)">
            <button class="btn btn--bad btn--sm" data-acao="excluir">Excluir conta (LGPD)</button>
            <small>Apaga o login e os dados pessoais da conta; os pedidos ficam para controle fiscal.</small>
          </div>
        </div>
      </div>`;
  }

  /* ======================================================================
     Atacado
     ====================================================================== */
  function viewAtacado() {
    const f = S.f.atacado, d30 = Date.now() - 30 * DIA;
    const pend = S.usuarios.filter((u) => u.atacado?.status === 'pendente').sort((a, b) => ts(a.atacado.solicitadoEm) - ts(b.atacado.solicitadoEm));
    const ativos = S.usuarios.filter((u) => u.atacado?.status === 'aprovado');
    const recus = S.usuarios.filter((u) => u.atacado?.status === 'recusado');
    const pAt = S.pedidos.filter((p) => p.atacado && valido(p));
    const fat30 = pAt.filter((p) => ts(p.criadoEm) >= d30).reduce((s, p) => s + p.total, 0);
    const n30 = pAt.filter((p) => ts(p.criadoEm) >= d30).length;
    const seg = [['pendentes', `Para analisar (${pend.length})`], ['ativos', `Empresas ativas (${ativos.length})`], ['recusados', `Recusadas/revogadas (${recus.length})`], ['pedidos', 'Pedidos de atacado']];
    let corpo = '';
    if (f.aba === 'pendentes') {
      corpo = pend.length ? `<div class="grade">${pend.map((u) => { const a = u.atacado; return `<div class="card empresa" data-usuario="${esc(u.id)}">
        <div class="empresa__top"><div><h3 style="margin:0">${esc(a.razaoSocial)}</h3><small>CNPJ ${esc(API.fmt.cnpj(a.cnpj))} · ${esc(a.ramo)} · ${esc(a.cidade)}</small></div><span class="pill pill--amber">aguardando há ${relativo(a.solicitadoEm).replace('há ', '')}</span></div>
        <small>Responsável: <a href="#clientes/${encodeURIComponent(u.id)}">${esc(u.nome)}</a> · ${esc(u.email)} · ${esc(API.fmt.fone(u.fone))}</small>
        <div class="linha">
          <a class="btn btn--soft btn--sm" target="_blank" rel="noopener" href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp">${ic('ext')}Consultar CNPJ na Receita</a>
          <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${wa(u.fone, `Olá, ${u.nome.split(' ')[0]}! Aqui é do comercial da ${CFG.loja.nomeCurto}, sobre a conta atacado da ${a.razaoSocial}.`)}">${ic('whats')}WhatsApp</a>
        </div>
        <div class="linha"><span class="rot" style="margin:0">Desconto</span><input class="inp desc-inp" data-desconto type="number" min="0" max="50" step="0.5" placeholder="${descPadrao()}"><span>%</span><input class="inp" data-motivo placeholder="Observação para o cliente (opcional)"></div>
        <div class="linha"><button class="btn btn--ok" data-acao="aprovar">${ic('check')}Aprovar</button><button class="btn btn--bad" data-acao="recusar">Recusar</button></div>
      </div>`; }).join('')}</div>` : '<div class="card vazio">Nenhuma solicitação aguardando. 🎉</div>';
    }
    if (f.aba === 'ativos') {
      corpo = ativos.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Empresa</th><th>Responsável</th><th>Desconto</th><th class="num">Pedidos</th><th class="num">Faturamento</th><th>Último pedido</th><th></th></tr></thead><tbody>
        ${ativos.map((u) => { const ps = pAt.filter((p) => p.usuarioId === u.id); const tot = ps.reduce((s, p) => s + p.total, 0); return `<tr data-usuario="${esc(u.id)}">
          <td><b>${esc(u.atacado.razaoSocial)}</b><small>${esc(API.fmt.cnpj(u.atacado.cnpj))} · ${esc(u.atacado.cidade)}</small></td>
          <td><a href="#clientes/${encodeURIComponent(u.id)}">${esc(u.nome)}</a><small>${esc(API.fmt.fone(u.fone))}</small></td>
          <td><div class="linha" style="flex-wrap:nowrap"><input class="inp desc-inp" data-desconto type="number" min="0" max="50" step="0.5" value="${u.atacado.descontoPercentual ?? ''}" placeholder="${descPadrao()}"><span>%</span><button class="btn btn--soft btn--sm" data-acao="salvar-desconto">Salvar</button></div></td>
          <td class="num">${ps.length}</td><td class="num">${brl(tot)}</td><td>${ps[0] ? relativo(ps[0].criadoEm) : '—'}</td>
          <td><button class="btn btn--bad btn--sm" data-acao="recusar">Revogar</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card vazio">Nenhuma empresa aprovada ainda.</div>';
    }
    if (f.aba === 'recusados') {
      corpo = recus.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Empresa</th><th>Responsável</th><th>Observação</th><th>Quando</th><th></th></tr></thead><tbody>
        ${recus.map((u) => `<tr data-usuario="${esc(u.id)}"><td><b>${esc(u.atacado.razaoSocial)}</b><small>${esc(API.fmt.cnpj(u.atacado.cnpj))}</small></td><td><a href="#clientes/${encodeURIComponent(u.id)}">${esc(u.nome)}</a></td><td>${esc(u.atacado.motivo || '—')}</td><td>${dataCurta(u.atacado.respondidoEm)}</td><td><button class="btn btn--ok btn--sm" data-acao="aprovar">Aprovar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="card vazio">Nenhuma solicitação recusada.</div>';
    }
    if (f.aba === 'pedidos') {
      corpo = pAt.length ? `<div class="pedidos">${S.pedidos.filter((p) => p.atacado).map(pedidoHTML).join('')}</div>` : '<div class="card vazio">Nenhum pedido de atacado ainda.</div>';
    }
    return `<div class="kpis">
        <div class="kpi ${pend.length ? 'kpi--alerta' : ''}"><span>Para analisar</span><b>${pend.length}</b><small>solicitações pendentes</small></div>
        <div class="kpi"><span>Empresas ativas</span><b>${ativos.length}</b><small>com acesso de atacado</small></div>
        <div class="kpi"><span>Faturamento atacado · 30 dias</span><b>${brl(fat30)}</b><small>${n30} pedido(s)</small></div>
        <div class="kpi"><span>Ticket médio atacado</span><b>${brl(n30 ? fat30 / n30 : 0)}</b><small>últimos 30 dias</small></div>
      </div>
      <div class="filtros"><div class="seg" data-grupo="aba">${seg.map(([k, t]) => `<button data-v="${k}" class="${f.aba === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <small>Desconto padrão da loja: ${descPadrao()}% (config.js → contas.atacado.descontoPercentual)</small></div>
      ${corpo}`;
  }

  /* ======================================================================
     Acessos
     ====================================================================== */
  function viewAcessos() {
    const f = S.f.acessos, q = f.busca.trim().toLowerCase();
    const d1 = Date.now() - DIA, d7 = Date.now() - 7 * DIA;
    const conta = (tipo, desde) => S.log.filter((e) => e.tipo === tipo && ts(e.em) >= desde).length;
    const susp = [...falhasRecentes().entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
    const usuEmail = new Map(S.usuarios.map((u) => [u.email, u]));
    const lista = S.log.filter((e) => (f.grupo === 'todos' || evento(e.tipo)[2] === f.grupo || (f.grupo === 'falhas' && evento(e.tipo)[1] === 'terra'))
      && (!q || [e.email, e.detalhe, evento(e.tipo)[0]].join(' ').toLowerCase().includes(q)));
    const seg = [['todos', 'Tudo'], ['logins', 'Logins'], ['falhas', 'Falhas e bloqueios'], ['cadastros', 'Cadastros'], ['pedidos', 'Pedidos'], ['loja', 'Ações da loja']];
    return `<div class="kpis">
        <div class="kpi"><span>Logins · 24 h</span><b>${conta('login', d1)}</b><small>${conta('login', d7)} em 7 dias</small></div>
        <div class="kpi ${conta('login-falhou', d1) ? 'kpi--alerta' : ''}"><span>Senhas erradas · 24 h</span><b>${conta('login-falhou', d1)}</b><small>${conta('login-limite', d1)} bloqueio(s) por tentativas</small></div>
        <div class="kpi"><span>Cadastros · 7 dias</span><b>${conta('cadastro', d7)}</b><small>${S.usuarios.length} contas no total</small></div>
        <div class="kpi ${S.usuarios.some((u) => u.bloqueado) ? 'kpi--alerta' : ''}"><span>Contas bloqueadas</span><b>${S.usuarios.filter((u) => u.bloqueado).length}</b><small>pela loja</small></div>
      </div>
      ${susp.length ? `<div class="card" style="margin-bottom:16px"><h3>${ic('alert')}Atenção: muitas senhas erradas (24 h)</h3><table class="tab"><tbody>${susp.map(([email, n]) => { const u = usuEmail.get(email); return `<tr><td><b>${esc(email)}</b><small>${u ? 'conta existente' : 'e-mail não cadastrado'}</small></td><td class="num">${n} tentativa(s)</td><td>${u ? `<a class="btn btn--soft btn--sm" href="#clientes/${encodeURIComponent(u.id)}">Abrir ficha</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      <div class="filtros"><div class="seg" data-grupo="grupo">${seg.map(([k, t]) => `<button data-v="${k}" class="${f.grupo === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="filtros"><input class="inp busca" type="search" data-f="busca" placeholder="Buscar por e-mail ou detalhe" value="${esc(f.busca)}"><button class="btn btn--soft" data-acao="csv-acessos">${ic('download')}Exportar planilha</button></div>
      <p class="contagem">${lista.length} registro(s)${lista.length > 300 ? ' · mostrando os 300 mais recentes' : ''}</p>
      ${lista.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Quando</th><th>Evento</th><th>Conta</th><th>Detalhe</th></tr></thead><tbody>
        ${lista.slice(0, 300).map((e) => { const [nome, cor] = evento(e.tipo); const u = e.usuarioId && S.usuarios.find((x) => x.id === e.usuarioId); return `<tr${cor === 'terra' ? ' class="alerta"' : ''}><td style="white-space:nowrap">${dataHora(e.em)}<small>${relativo(e.em)}</small></td><td><span class="pill pill--${cor}">${esc(nome)}</span></td><td>${u ? `<a href="#clientes/${encodeURIComponent(u.id)}">${esc(e.email || u.email)}</a>` : esc(e.email || '—')}</td><td><small>${esc(e.detalhe || '')}</small></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="card vazio">Nenhum registro.</div>'}`;
  }

  /* ======================================================================
     Planilhas (CSV com ; e BOM — abre direto no Excel em português)
     ====================================================================== */
  function baixarCSV(nome, cab, linhas) {
    const cel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v) => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
    const txt = '﻿' + [cab, ...linhas].map((l) => l.map((v) => cel(num(v))).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Planilha gerada.');
  }

  /* ======================================================================
     Eventos
     ====================================================================== */
  const conteudo = $('#conteudo'), ficha = $('#ficha-painel');

  async function executar(btn, fn, okMsg) {
    if (btn) btn.disabled = true;
    try { await fn(); await carregar(); render(); if (S.fichaId) abrirFicha(S.fichaId); if (okMsg) toast(okMsg); }
    catch (err) { toast(esc(err.message), true); if (btn) btn.disabled = false; return err; }
  }
  const usuarioDe = (el) => el.closest('[data-usuario]')?.dataset.usuario || S.fichaId;
  const ctx = (el) => el.closest('[data-usuario]') || ficha;

  async function acao(b) {
    const a = b.dataset.acao;
    if (a === 'tabela-grafico') { S.tabelaGrafico = !S.tabelaGrafico; render(); return; }
    if (a === 'abrir-pedido') { const id = b.closest('[data-pedido]').dataset.pedido; S.abertos.has(id) ? S.abertos.delete(id) : S.abertos.add(id); render(); return; }
    if (a === 'status') {
      const el = b.closest('[data-pedido]');
      return executar(b, () => ADM.atualizarStatus(el.dataset.pedido, $('[data-novo-status]', el).value, $('[data-nota]', el).value.trim()), 'Status atualizado — o cliente já vê em "Meus pedidos".');
    }
    const uid = usuarioDe(b);
    if (a === 'aprovar') {
      const c = ctx(b); const d = $('[data-desconto]', c)?.value; const m = $('[data-motivo]', c)?.value.trim();
      return executar(b, async () => { if (d !== undefined && d !== '') await ADM.definirDescontoAtacado(uid, d); await ADM.responderAtacado(uid, true, m); }, 'Atacado aprovado.');
    }
    if (a === 'recusar') {
      const u = porId().get(uid); const revogar = u?.atacado?.status === 'aprovado';
      if (revogar && !confirm(`Revogar o acesso de atacado de ${u.atacado.razaoSocial}?`)) return;
      const m = $('[data-motivo]', ctx(b))?.value.trim() || (revogar ? prompt('Motivo (o cliente vê):', '') || '' : '');
      return executar(b, () => ADM.responderAtacado(uid, false, m), revogar ? 'Acesso de atacado revogado.' : 'Solicitação recusada.');
    }
    if (a === 'salvar-desconto') {
      const v = $('[data-desconto]', b.closest('tr, .card, [data-usuario]') || ficha).value;
      return executar(b, () => ADM.definirDescontoAtacado(uid, v === '' ? null : v), v === '' ? 'Usando o desconto padrão da loja.' : `Desconto de ${v}% salvo.`);
    }
    if (a === 'senha-temp') {
      const u = porId().get(uid);
      if (!confirm(`Gerar senha temporária para ${u.nome}? A senha atual deixa de funcionar.`)) return;
      return executar(b, async () => { S.senhas[uid] = await ADM.senhaTemporaria(uid); }, 'Senha temporária gerada.');
    }
    if (a === 'bloquear') {
      const m = $('[data-motivo-bloqueio]', ficha)?.value.trim();
      if (!confirm('Bloquear esta conta? O cliente sai e não consegue mais entrar até ser desbloqueado.')) return;
      return executar(b, () => ADM.bloquear(uid, true, m), 'Conta bloqueada.');
    }
    if (a === 'desbloquear') return executar(b, () => ADM.bloquear(uid, false), 'Conta desbloqueada.');
    if (a === 'excluir') {
      const u = porId().get(uid);
      const r = prompt(`Excluir definitivamente a conta de ${u.nome}?\nIsto não pode ser desfeito. Digite EXCLUIR para confirmar:`);
      if (r !== 'EXCLUIR') return;
      S.fichaId = null; // a ficha não deve ser reaberta depois de excluir
      const err = await executar(b, () => ADM.excluirUsuario(uid), 'Conta excluída.');
      if (!err) { fecharFicha(); location.hash = '#clientes'; }
      return;
    }
    if (a === 'csv-pedidos') {
      return baixarCSV('pedidos', ['Pedido', 'Data', 'Status', 'Tipo', 'Cliente', 'E-mail', 'WhatsApp', 'Itens', 'Subtotal', 'Frete', 'Desc. atacado', 'Desc. Pix', 'Cupom', 'Total', 'Entrega', 'CEP', 'Cidade', 'Endereço completo', 'Pagamento', 'Observações'],
        filtrarPedidos().map((p) => [p.id, dataHora(p.criadoEm), API.STATUS[p.status]?.nome || p.status, p.atacado ? 'Atacado' : 'Varejo', p.cliente?.nome || '', p.conta?.email || '', p.cliente?.fone || '',
          p.itens.map((i) => `${i.qty}x ${i.nome}${i.g ? ' ' + peso(i.g) : ''}`).join(' | '), p.subtotal, p.frete, p.descontoAtacado || 0, p.descontoPix || 0, p.cupom ? `${p.cupom.codigo} ${p.cupom.desconto ? '-' + p.cupom.desconto : '(frete grátis)'}` : '', p.total,
          p.entrega?.tipo === 'entrega' ? 'Entrega' : 'Retirada', p.entrega?.cep || '', [p.entrega?.cidade, p.entrega?.uf].filter(Boolean).join('/'),
          p.entrega?.tipo === 'entrega' && window.LojaEndereco ? window.LojaEndereco.formatarCompleto(p.entrega).replace(/\n/g, ' | ') : '', pagNome(p.pagamento), p.observacoes || '']));
    }
    if (a === 'csv-clientes') {
      return baixarCSV('clientes', ['Nome', 'E-mail', 'WhatsApp', 'Cliente desde', 'Último acesso', 'Acessos', 'Situação', 'Atacado', 'Empresa', 'CNPJ', 'Desconto %', 'Pedidos', 'Total gasto', 'Observação interna'],
        filtrarClientes().map((u) => { const s = statsCliente(u.id); return [u.nome, u.email, API.fmt.fone(u.fone), dataCurta(u.criadoEm), dataHora(u.ultimoAcesso), u.acessos || 0, u.bloqueado ? 'Bloqueada' : 'Ativa',
          API.ATACADO_STATUS[u.atacado?.status || 'nenhum'], u.atacado?.razaoSocial || '', u.atacado?.cnpj ? API.fmt.cnpj(u.atacado.cnpj) : '', u.atacado?.descontoPercentual ?? '', s.n, s.total, u.notaInterna || '']; }));
    }
    if (a === 'csv-acessos') {
      return baixarCSV('acessos', ['Data', 'Evento', 'E-mail', 'Detalhe'], S.log.map((e) => [dataHora(e.em), evento(e.tipo)[0], e.email || '', e.detalhe || '']));
    }
  }

  conteudo.addEventListener('click', (e) => {
    const sg = e.target.closest('.seg button');
    const grupo = sg?.parentElement.dataset.grupo;
    const alvoSeg = grupo && { status: S.f.pedidos, seg: S.f.clientes, aba: S.f.atacado, grupo: S.f.acessos }[grupo];
    if (alvoSeg) { alvoSeg[grupo] = sg.dataset.v; render(); return; }
    const fp = e.target.closest('[data-filtro-pedidos]'); if (fp) { S.f.pedidos.status = fp.dataset.filtroPedidos; }
    const fc = e.target.closest('[data-seg-clientes]'); if (fc) { S.f.clientes.seg = fc.dataset.segClientes; }
    const tr = e.target.closest('tr[data-cliente]'); if (tr && !e.target.closest('a, button, input')) { location.hash = '#clientes/' + encodeURIComponent(tr.dataset.cliente); return; }
    const b = e.target.closest('[data-acao]'); if (b) acao(b);
  });
  let buscaT;
  conteudo.addEventListener('input', (e) => {
    const k = e.target.dataset.f; if (k !== 'busca') return;
    const alvo = { pedidos: S.f.pedidos, clientes: S.f.clientes, acessos: S.f.acessos }[S.rota]; if (!alvo) return;
    alvo.busca = e.target.value;
    clearTimeout(buscaT);
    buscaT = setTimeout(() => { const pos = e.target.selectionStart; render(); const i = $('[data-f="busca"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 160);
  });
  conteudo.addEventListener('change', (e) => { const k = e.target.dataset.f; if (k && k !== 'busca' && S.rota === 'pedidos') { S.f.pedidos[k] = e.target.value; render(); } });

  ficha.addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar]')) { fecharFicha(); return; }
    const ip = e.target.closest('[data-ir-pedido]');
    if (ip) { S.f.pedidos = { busca: ip.dataset.irPedido, status: 'todos', tipo: 'todos', periodo: 'todos' }; S.abertos.add(ip.dataset.irPedido); fecharFicha(true); location.hash = '#pedidos'; return; }
    const b = e.target.closest('[data-acao]'); if (b) acao(b);
  });
  ficha.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, d = Object.fromEntries(new FormData(form).entries()), b = $('button[type="submit"]', form);
    $$('.campo', form).forEach((c) => { c.classList.remove('erro'); const m = $('.msg', c); if (m) m.hidden = true; });
    const err = await executar(b, () => ADM.editarUsuario(S.fichaId, d), form.dataset.form === 'nota' ? 'Observação salva.' : 'Dados salvos.');
    if (err && err.campo) { const c = $(`[data-campo="${err.campo}"]`, form); if (c) { c.classList.add('erro'); const m = $('.msg', c); m.textContent = err.message; m.hidden = false; } }
  });
  $('#ficha .ficha__fundo').addEventListener('click', () => fecharFicha());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.fichaId) fecharFicha(); });

  $('#atualizar').addEventListener('click', async () => { await carregar(); render(); if (S.fichaId) abrirFicha(S.fichaId); toast('Dados atualizados.'); });
  $('#sair').addEventListener('click', async () => { await ADM.sair(); try { sessionStorage.removeItem('loja:admin-pin'); } catch { /* */ } telaLogin(); });

  // Modo local: o site (outra aba) cria pedidos/contas → atualiza sozinho
  addEventListener('storage', async (e) => {
    if (!ADM.logado() || !/^loja:db:/.test(e.key || '')) return;
    const foco = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    await carregar(); if (!foco) { render(); if (S.fichaId) abrirFicha(S.fichaId); }
  });

  /* ---------------- Início ---------------- */
  const modo = $('#modo');
  modo.textContent = API.modo === 'local' ? 'Modo local: mostra os dados deste navegador. Em produção use contas.modo = "api".' : 'Conectado ao servidor de contas.';
  modo.classList.toggle('api', API.modo === 'api');
  if (ADM.logado()) { carregar().then(rotear); } else telaLogin();
})();
