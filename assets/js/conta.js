/* ==========================================================================
   LOJA — Área do cliente (interface)
   Telas: entrar · cadastro · recuperar · redefinir  |  pedidos · atacado · dados
   Depende de: conta-api.js (dados) e app.js (window.LojaApp: modais, toasts, carrinho)
   ========================================================================== */
(function () {
  'use strict';
  const API = window.LojaContas;
  const APP = window.LojaApp;
  const CFG = window.LOJA_CONFIG;
  if (!API || !APP) return;

  const { esc, icon, toast, waLink, brl, openPanel, closeAll } = APP;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const box = $('#conta-content');
  const ATAC = (CFG.contas && CFG.contas.atacado) || { descontoPercentual: 0, beneficios: [] };

  const ui = { tela: 'entrar', depois: null, pedidos: null, carregando: false, aberto: null, msg: null };
  const logado = () => API.usuario();

  /* ---------------- Utilidades ---------------- */
  const dataBR = (iso, hora = true) => {
    try { return new Date(iso).toLocaleString('pt-BR', hora ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };
  const iniciais = (nome) => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const primeiro = (nome) => (nome || '').split(' ')[0];
  const head = `<button class="icon-btn modal__x" data-close aria-label="Fechar">${icon('x')}</button>`;
  const campo = (id, rotulo, { tipo = 'text', valor = '', auto = '', modo = '', extra = '', olho = false } = {}) => `
    <div class="field${olho ? ' field--senha' : ''}" data-campo="${id}">
      <input id="ct-${id}" name="${id}" type="${tipo}" placeholder=" " value="${esc(valor)}"${auto ? ` autocomplete="${auto}"` : ''}${modo ? ` inputmode="${modo}"` : ''} ${extra}>
      <label for="ct-${id}">${rotulo}</label>
      ${olho ? `<button type="button" class="field__olho" data-acao="olho" aria-label="Mostrar senha">${icon('eye')}</button>` : ''}
      <small class="field__erro" hidden></small>
    </div>`;
  const avisoCheckout = () => ui.contexto === 'checkout'
    ? `<div class="conta-msg conta-msg--ok">${icon('bag')}<span><b>Falta pouco para finalizar seu pedido!</b> Entre na sua conta ou crie uma grátis — seus itens continuam no carrinho e o pedido fica salvo para você acompanhar.</span></div>` : '';
  const aviso = () => ui.msg ? `<div class="conta-msg conta-msg--${ui.msg.tipo}">${icon(ui.msg.tipo === 'ok' ? 'check' : 'shield')}<span>${ui.msg.html}</span></div>` : '';

  function erroNoForm(form, err) {
    $$('.field', form).forEach((f) => { f.classList.remove('is-error'); const s = $('.field__erro', f); if (s) s.hidden = true; });
    const alvo = err.campo && $(`[data-campo="${err.campo}"]`, form);
    if (alvo) {
      void alvo.offsetWidth; alvo.classList.add('is-error');
      const s = $('.field__erro', alvo); s.textContent = err.message; s.hidden = false;
      $('input, select', alvo)?.focus();
    } else {
      const g = $('.form-erro', form); if (g) { g.textContent = err.message; g.hidden = false; }
    }
  }
  async function enviando(form, fn) {
    const btn = $('button[type="submit"]', form);
    const g = $('.form-erro', form); if (g) g.hidden = true;
    btn.disabled = true; btn.classList.add('is-loading');
    try { await fn(); }
    catch (err) { if (err instanceof API.Erro) erroNoForm(form, err); else { console.error(err); erroNoForm(form, new API.Erro('Algo deu errado. Tente novamente.')); } }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-loading'); } }
  }
  const dadosForm = (form) => Object.fromEntries(new FormData(form).entries());

  /* ======================================================================
     Telas — visitante
     ====================================================================== */
  function telaEntrar() {
    return `<div class="conta conta--form">
      <span class="conta__icon">${icon('user')}</span>
      <h3>${ui.contexto === 'checkout' ? 'Entre para finalizar' : 'Entrar na sua conta'}</h3>
      <p>Acompanhe seus pedidos e acesse condições de atacado.</p>
      ${avisoCheckout()}${aviso()}
      <form data-form="entrar" novalidate>
        ${campo('email', 'E-mail', { tipo: 'email', auto: 'email', modo: 'email' })}
        ${campo('senha', 'Senha', { tipo: 'password', auto: 'current-password', olho: true })}
        <p class="form-erro" hidden></p>
        <button type="button" class="conta__link conta__link--dir" data-tela="recuperar">Esqueci minha senha</button>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${icon('arrow')}Entrar</button>
      </form>
      <p class="conta__troca">Ainda não tem conta? <button type="button" class="conta__link" data-tela="cadastro">Criar conta grátis</button></p>
    </div>`;
  }
  function telaCadastro() {
    return `<div class="conta conta--form">
      <span class="conta__icon">${icon('leaf')}</span>
      <h3>Criar conta</h3>
      <p>Leva menos de um minuto. Seus pedidos ficam salvos aqui.</p>
      ${avisoCheckout()}${aviso()}
      <form data-form="cadastro" novalidate>
        ${campo('nome', 'Nome completo', { auto: 'name' })}
        ${campo('email', 'E-mail', { tipo: 'email', auto: 'email', modo: 'email' })}
        ${campo('fone', 'WhatsApp com DDD', { tipo: 'tel', auto: 'tel', modo: 'tel', extra: 'data-mask="fone"' })}
        ${campo('senha', 'Senha (mín. 8, letras e números)', { tipo: 'password', auto: 'new-password', olho: true })}
        <label class="conta__check"><input type="checkbox" name="aceite" required> <span>Concordo em receber contato da ${CFG.loja.nomeCurto} sobre meus pedidos e com o uso dos meus dados para atendimento, conforme a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade e os Termos de Uso</a> (LGPD).</span></label>
        <p class="form-erro" hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${icon('check')}Criar minha conta</button>
      </form>
      <p class="conta__troca">Já tem conta? <button type="button" class="conta__link" data-tela="entrar">Entrar</button></p>
    </div>`;
  }
  function telaRecuperar() {
    return `<div class="conta conta--form">
      <span class="conta__icon">${icon('shield')}</span>
      <h3>Recuperar senha</h3>
      <p>${API.modo === 'api' ? 'Enviaremos um link para você criar uma nova senha.' : 'Informe o e-mail da sua conta.'}</p>
      ${aviso()}
      <form data-form="recuperar" novalidate>
        ${campo('email', 'E-mail da conta', { tipo: 'email', auto: 'email', modo: 'email' })}
        <p class="form-erro" hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${icon('arrow')}Continuar</button>
      </form>
      <p class="conta__troca"><button type="button" class="conta__link" data-tela="entrar">${icon('left')}Voltar para entrar</button></p>
    </div>`;
  }
  function telaRedefinir() {
    return `<div class="conta conta--form">
      <span class="conta__icon">${icon('shield')}</span>
      <h3>Nova senha</h3>
      <p>Escolha uma nova senha para sua conta.</p>
      <form data-form="redefinir" novalidate>
        ${campo('senha', 'Nova senha', { tipo: 'password', auto: 'new-password', olho: true })}
        ${campo('confirma', 'Repita a nova senha', { tipo: 'password', auto: 'new-password' })}
        <p class="form-erro" hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${icon('check')}Salvar nova senha</button>
      </form>
    </div>`;
  }

  /* ======================================================================
     Telas — cliente logado
     ====================================================================== */
  function seloAtacado(u) {
    const s = u.atacado?.status || 'nenhum';
    if (s === 'aprovado') return `<span class="pill pill--forest">${icon('box')}Atacado</span>`;
    if (s === 'pendente') return `<span class="pill pill--amber">${icon('clock')}Atacado em análise</span>`;
    return '';
  }
  function painel(u) {
    const abas = [['pedidos', 'Meus pedidos', 'bag'], ['atacado', 'Atacado', 'box'], ['dados', 'Meus dados', 'user']];
    let corpo = '';
    if (ui.tela === 'pedidos') corpo = abaPedidos();
    if (ui.tela === 'atacado') corpo = abaAtacado(u);
    if (ui.tela === 'dados') corpo = abaDados(u);
    return `<div class="conta-painel">
      <div class="conta-topo">
        <span class="conta-avatar">${esc(iniciais(u.nome))}</span>
        <div><h3>Olá, ${esc(primeiro(u.nome))}!</h3><small>${esc(u.email)}</small>${seloAtacado(u)}</div>
      </div>
      ${u.senhaTemporaria ? `<div class="conta-msg conta-msg--alerta">${icon('shield')}<span>Você entrou com uma <b>senha temporária</b>. Crie uma senha nova em <b>Meus dados</b>.</span></div>` : ''}
      <div class="tabs conta-tabs" role="tablist">${abas.map(([id, nome, ic]) => `<button role="tab" aria-selected="${ui.tela === id}" class="${ui.tela === id ? 'is-on' : ''}" data-tela="${id}">${icon(ic)}${nome}</button>`).join('')}</div>
      <div class="conta-corpo">${aviso()}${corpo}</div>
    </div>`;
  }

  /* ---------- Pedidos ---------- */
  const PASSOS = (p) => ['recebido', 'confirmado', 'separando', p.entrega?.tipo === 'entrega' ? 'enviado' : 'pronto', 'entregue'];
  function trilha(p) {
    if (p.status === 'cancelado') return `<div class="trilha trilha--cancelado">${icon('x')}Pedido cancelado</div>`;
    const passos = PASSOS(p); const at = API.STATUS[p.status]?.passo ?? 0;
    return `<ol class="trilha">${passos.map((s, i) => `<li class="${i < at ? 'ok' : i === at ? 'atual' : ''}"><i></i><span>${API.STATUS[s].nome}</span></li>`).join('')}</ol>`;
  }
  function pedidoHTML(p) {
    const st = API.STATUS[p.status] || { nome: p.status, cor: 'amber' };
    const n = p.itens.reduce((s, i) => s + i.qty, 0);
    const aberto = ui.aberto === p.id;
    const peso = (i) => i.g ? APP.rotuloPeso(i.g) : (i.conteudo || '');
    const notas = p.historico.filter((h) => h.nota);
    return `<article class="pedido${aberto ? ' is-open' : ''}" data-pedido="${esc(p.id)}">
      <button class="pedido__head" data-acao="abrir-pedido" aria-expanded="${aberto}">
        <span class="pedido__num"><b>${esc(p.id)}</b><small>${dataBR(p.criadoEm, false)} · ${n} ${n === 1 ? 'item' : 'itens'}</small></span>
        <span class="pill pill--${st.cor}">${esc(st.nome)}</span>
        <b class="pedido__total">${brl(p.total)}</b>
        <svg class="pedido__chev"><use href="#i-down"/></svg>
      </button>
      ${aberto ? `<div class="pedido__body">
        ${trilha(p)}
        <ul class="pedido__itens">${p.itens.map((i) => `<li><span>${i.qty}× ${esc(i.nome)} ${peso(i) ? `<small>${esc(peso(i))}</small>` : ''}</span><b>${brl(i.total)}</b></li>`).join('')}</ul>
        <div class="ck__sum">
          <div><span>Subtotal</span><span>${brl(p.subtotal)}</span></div>
          <div><span>Frete</span><span>${p.frete ? brl(p.frete) : 'Grátis'}</span></div>
          ${p.descontoAtacado ? `<div><span>Desconto atacado</span><span>-${brl(p.descontoAtacado)}</span></div>` : ''}
          ${p.cupom && p.cupom.desconto ? `<div><span>Cupom ${esc(p.cupom.codigo)}</span><span>-${brl(p.cupom.desconto)}</span></div>` : p.cupom ? `<div><span>Cupom ${esc(p.cupom.codigo)}</span><span>frete grátis</span></div>` : ''}
          ${p.descontoPix ? `<div><span>Desconto Pix</span><span>-${brl(p.descontoPix)}</span></div>` : ''}
          <div><span>Total</span><span>${brl(p.total)}</span></div>
        </div>
        <p class="pedido__info">${icon(p.entrega?.tipo === 'entrega' ? 'truck' : 'store')}${p.entrega?.tipo === 'entrega' ? `Entrega · ${esc(window.LojaEndereco ? window.LojaEndereco.formatar(p.entrega) : (p.entrega.cep || ''))}` : 'Retirada na loja'} · ${({ pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' })[p.pagamento] || esc(p.pagamento)}${p.atacado ? ' · Atacado' : ''}</p>
        ${p.observacoes ? `<p class="pedido__info">${icon('tag')}<span>Sua observação: ${esc(p.observacoes)}</span></p>` : ''}
        ${notas.length ? `<ul class="pedido__notas">${notas.map((h) => `<li><small>${dataBR(h.em)}</small>${esc(h.nota)}</li>`).join('')}</ul>` : ''}
        <div class="pedido__acoes">
          <button class="btn btn--primary btn--sm" data-acao="repetir">${icon('bag')}Repetir pedido</button>
          <a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${waLink(`Olá, ${CFG.loja.nomeCurto}! Quero falar sobre o pedido ${p.id} (${dataBR(p.criadoEm, false)}).`)}">${icon('whats')}Falar sobre o pedido</a>
          ${p.status === 'recebido' ? `<button class="btn btn--soft btn--sm" data-acao="cancelar">${icon('x')}Cancelar</button>` : ''}
        </div>
      </div>` : ''}
    </article>`;
  }
  function abaPedidos() {
    if (ui.pedidos === null) { carregarPedidos(); return `<div class="conta-load"><i></i><i></i><i></i></div>`; }
    if (!ui.pedidos.length) return `<div class="drawer-empty conta-vazio">${icon('bag')}<h4>Você ainda não fez pedidos</h4><p>Quando finalizar uma compra logado, ela aparece aqui com o status atualizado.</p><a href="#vitrine" class="btn btn--primary" data-close>Explorar produtos</a></div>`;
    return `<div class="pedidos">${ui.pedidos.map(pedidoHTML).join('')}</div>`;
  }
  async function carregarPedidos() {
    if (ui.carregando) return; ui.carregando = true;
    try {
      ui.pedidos = await API.listarPedidos();
      // já abre o pedido em andamento mais recente
      if (!ui.aberto) ui.aberto = ui.pedidos.find((p) => !['entregue', 'cancelado'].includes(p.status))?.id || null;
    }
    catch (err) { ui.pedidos = []; ui.msg = { tipo: 'erro', html: esc(err.message) }; }
    finally { ui.carregando = false; if (ui.tela === 'pedidos') render(); }
  }

  /* ---------- Atacado ---------- */
  const RAMOS = ['Mercado / Empório', 'Loja de produtos naturais', 'Restaurante / Lanchonete', 'Padaria / Confeitaria', 'Academia / Nutrição', 'Revenda / Representante', 'Outro'];
  function abaAtacado(u) {
    const a = u.atacado || { status: 'nenhum' };
    const pct = a.status === 'aprovado' ? +(a.descontoPercentual ?? ATAC.descontoPercentual ?? 0) : +(ATAC.descontoPercentual || 0);
    const benef = `<ul class="conta-beneficios">${(ATAC.beneficios || []).map((b) => `<li>${icon('check')}${esc(b)}</li>`).join('')}${pct > 0 ? `<li>${icon('percent')}<b>${pct}% de desconto</b> automático no checkout</li>` : ''}</ul>`;
    const empresa = a.cnpj ? `<dl class="conta-dl"><dt>Empresa</dt><dd>${esc(a.razaoSocial)}</dd><dt>CNPJ</dt><dd>${esc(API.fmt.cnpj(a.cnpj))}</dd><dt>Cidade</dt><dd>${esc(a.cidade)}</dd><dt>Negócio</dt><dd>${esc(a.ramo)}</dd></dl>` : '';
    if (a.status === 'aprovado') {
      return `<div class="conta-status conta-status--ok">${icon('check')}<div><b>Conta atacado ativa</b><small>Aprovada em ${dataBR(a.respondidoEm, false)}</small></div></div>
        ${benef}${empresa}
        <a class="btn btn--wa btn--block" target="_blank" rel="noopener" href="${waLink(`Olá, ${CFG.loja.nomeCurto}! Sou cliente atacado (${a.razaoSocial} · CNPJ ${API.fmt.cnpj(a.cnpj)}). Gostaria da tabela/cotação de atacado.`)}">${icon('whats')}Pedir tabela ou cotação</a>`;
    }
    if (a.status === 'pendente') {
      return `<div class="conta-status conta-status--pend">${icon('clock')}<div><b>Solicitação em análise</b><small>Enviada em ${dataBR(a.solicitadoEm)}. A equipe comercial responde em até 1 dia útil.</small></div></div>
        ${empresa}
        <a class="btn btn--soft btn--block" target="_blank" rel="noopener" href="${waLink(`Olá, ${CFG.loja.nomeCurto}! Enviei pelo site uma solicitação de conta atacado (${a.razaoSocial} · CNPJ ${API.fmt.cnpj(a.cnpj)}).`)}">${icon('whats')}Agilizar pelo WhatsApp comercial</a>`;
    }
    const recusado = a.status === 'recusado'
      ? `<div class="conta-status conta-status--nao">${icon('x')}<div><b>Solicitação não aprovada</b><small>${a.motivo ? esc(a.motivo) : 'Fale com o comercial para entender os requisitos.'} Você pode corrigir os dados e enviar de novo.</small></div></div>` : '';
    return `${recusado}
      <div class="conta-intro"><h4>Compre como empresa</h4><p>Informe o CNPJ do seu negócio. Depois da aprovação da loja, sua conta passa a ter condições de atacado.</p></div>
      ${benef}
      <form data-form="atacado" novalidate>
        ${campo('cnpj', 'CNPJ', { modo: 'numeric', valor: a.cnpj ? API.fmt.cnpj(a.cnpj) : '', extra: 'data-mask="cnpj"' })}
        ${campo('razaoSocial', 'Razão social / nome da empresa', { auto: 'organization', valor: a.razaoSocial || '' })}
        <div class="field-row">
          ${campo('cidade', 'Cidade/UF', { valor: a.cidade || '' })}
          <div class="field field--select" data-campo="ramo"><select id="ct-ramo" name="ramo"><option value="">Selecione…</option>${RAMOS.map((r) => `<option${a.ramo === r ? ' selected' : ''}>${r}</option>`).join('')}</select><label for="ct-ramo">Tipo de negócio</label><small class="field__erro" hidden></small></div>
        </div>
        <p class="form-erro" hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${icon('box')}Solicitar conta atacado</button>
      </form>`;
  }

  /* ---------- Meus dados ---------- */
  function abaDados(u) {
    return `<form data-form="perfil" novalidate>
        <p class="ck__lbl">Dados pessoais</p>
        ${campo('nome', 'Nome completo', { auto: 'name', valor: u.nome })}
        ${campo('fone', 'WhatsApp com DDD', { tipo: 'tel', modo: 'tel', valor: API.fmt.fone(u.fone), extra: 'data-mask="fone"' })}
        <div class="field"><input id="ct-email-ro" value="${esc(u.email)}" placeholder=" " readonly><label for="ct-email-ro">E-mail (login)</label></div>
        <p class="form-erro" hidden></p>
        <button type="submit" class="btn btn--primary btn--block">${icon('check')}Salvar dados</button>
      </form>
      <form data-form="senha" novalidate class="conta-sep">
        <p class="ck__lbl">Alterar senha</p>
        ${campo('atual', u.senhaTemporaria ? 'Senha temporária' : 'Senha atual', { tipo: 'password', auto: 'current-password', olho: true })}
        ${campo('nova', 'Nova senha (mín. 8, letras e números)', { tipo: 'password', auto: 'new-password', olho: true })}
        ${campo('confirma', 'Repita a nova senha', { tipo: 'password', auto: 'new-password' })}
        <p class="form-erro" hidden></p>
        <button type="submit" class="btn btn--soft btn--block">${icon('shield')}Alterar senha</button>
      </form>
      <div class="conta-sep conta-rodape">
        <small>Cliente desde ${dataBR(u.criadoEm, false)}</small>
        <button class="btn btn--ghost btn--sm" data-acao="sair">${icon('arrow')}Sair da conta</button>
      </div>`;
  }

  /* ======================================================================
     Render + navegação
     ====================================================================== */
  const TELAS_VISITANTE = { entrar: telaEntrar, cadastro: telaCadastro, recuperar: telaRecuperar, redefinir: telaRedefinir };
  function render() {
    const u = logado();
    if (u && TELAS_VISITANTE[ui.tela] && ui.tela !== 'redefinir') ui.tela = 'pedidos';
    if (!u && !TELAS_VISITANTE[ui.tela]) ui.tela = 'entrar';
    box.innerHTML = head + (u && !TELAS_VISITANTE[ui.tela] ? painel(u) : TELAS_VISITANTE[ui.tela]());
    box.classList.toggle('modal__card--conta-larga', !!u);
    setTimeout(() => { const i = $('form input:not([readonly])', box); if (i && !u) i.focus({ preventScroll: true }); }, 80);
  }
  function irPara(tela) { ui.tela = tela; ui.msg = null; render(); box.scrollTop = 0; }

  /** Abre o modal de conta numa tela; `depois` roda após login/cadastro bem-sucedido. */
  function abrir(tela, opts = {}) {
    ui.depois = opts.depois || null; ui.contexto = opts.contexto || null; ui.msg = null;
    if (tela) ui.tela = tela;
    openPanel('modal-conta'); // openPanel chama render()
  }
  function aposEntrar(msg) {
    ui.pedidos = null; ui.msg = null; ui.contexto = null;
    const fn = ui.depois; ui.depois = null;
    toast(`${icon('check')}<span>${msg}</span>`);
    if (fn) { closeAll(true); fn(); return; }
    irPara(logado()?.senhaTemporaria ? 'dados' : 'pedidos');
  }

  // Botão "Conta" (cabeçalho/menu) abre a conta "pura", sem o contexto de checkout
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open="modal-conta"]')) { ui.depois = null; ui.contexto = null; ui.msg = null; }
  }, true);
  // Botão "Pedidos" (cabeçalho/menu): vai direto para Meus pedidos; sem login, entra e depois mostra os pedidos
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-meus-pedidos]')) return;
    e.preventDefault();
    if (logado()) { ui.pedidos = null; abrir('pedidos'); }
    else abrir('entrar', { depois: () => abrir('pedidos') });
  });

  /* ---------------- Formulários ---------------- */
  box.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault();
    const d = dadosForm(form);
    const tipo = form.dataset.form;

    if (tipo === 'entrar') enviando(form, async () => {
      const u = await API.entrar({ email: d.email, senha: d.senha });
      aposEntrar(`Bem-vindo de volta, ${esc(primeiro(u.nome))}!`);
    });

    if (tipo === 'cadastro') enviando(form, async () => {
      if (!form.elements.aceite.checked) throw new API.Erro('Para criar a conta, aceite os termos de contato e uso dos dados.');
      const u = await API.cadastrar({ nome: d.nome, email: d.email, fone: d.fone, senha: d.senha });
      aposEntrar(`Conta criada! Bem-vindo, ${esc(primeiro(u.nome))}`);
    });

    if (tipo === 'recuperar') enviando(form, async () => {
      const r = await API.recuperarSenha(d.email);
      if (r.modo === 'local') {
        ui.msg = { tipo: 'alerta', html: `Fale com a loja pelo <a href="${waLink(`Olá, ${CFG.loja.nomeCurto}! Esqueci a senha da minha conta no site (e-mail: ${d.email}). Podem gerar uma senha temporária?`)}" target="_blank" rel="noopener"><b>WhatsApp</b></a>: a equipe gera uma senha temporária para você entrar e criar uma nova.` };
      } else {
        ui.msg = { tipo: 'ok', html: `Se existir uma conta com <b>${esc(d.email)}</b>, você vai receber um link para criar uma nova senha. Confira também o spam.` };
      }
      ui.tela = 'recuperar'; render();
    });

    if (tipo === 'redefinir') enviando(form, async () => {
      if (d.senha !== d.confirma) throw new API.Erro('As senhas não conferem.', 'confirma');
      await API.redefinirSenha({ token: ui.tokenRedefinir, senha: d.senha });
      history.replaceState(null, '', location.pathname + location.hash);
      aposEntrar('Senha alterada com sucesso!');
    });

    if (tipo === 'perfil') enviando(form, async () => {
      await API.atualizarPerfil({ nome: d.nome, fone: d.fone });
      ui.msg = { tipo: 'ok', html: 'Dados salvos.' }; render();
    });

    if (tipo === 'senha') enviando(form, async () => {
      if (d.nova !== d.confirma) throw new API.Erro('As senhas não conferem.', 'confirma');
      await API.alterarSenha({ atual: d.atual, nova: d.nova });
      ui.msg = { tipo: 'ok', html: 'Senha alterada com sucesso.' }; render();
    });

    if (tipo === 'atacado') enviando(form, async () => {
      await API.solicitarAtacado({ cnpj: d.cnpj, razaoSocial: d.razaoSocial, cidade: d.cidade, ramo: d.ramo });
      ui.msg = { tipo: 'ok', html: 'Solicitação enviada! A equipe comercial vai analisar e você verá o resultado aqui.' }; render();
    });
  });

  /* ---------------- Cliques ---------------- */
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tela]');
    if (t) { e.preventDefault(); irPara(t.dataset.tela); return; }
    const a = e.target.closest('[data-acao]'); if (!a) return;
    const acao = a.dataset.acao;

    if (acao === 'olho') {
      const inp = $('input', a.parentElement); const ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password'; a.classList.toggle('is-on', ver); a.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
      return;
    }
    if (acao === 'sair') { await API.sair(); ui.pedidos = null; toast(`${icon('check')}<span>Você saiu da conta.</span>`); irPara('entrar'); return; }

    const art = a.closest('[data-pedido]');
    const p = art && ui.pedidos?.find((x) => x.id === art.dataset.pedido);
    if (acao === 'abrir-pedido' && p) { ui.aberto = ui.aberto === p.id ? null : p.id; render(); return; }
    if (acao === 'repetir' && p) {
      const r = APP.repetirItens(p.itens);
      if (!r.ok) { toast(`${icon('x')}<span>Os produtos deste pedido não estão mais no catálogo.</span>`); return; }
      toast(`${icon('bag')}<span><b>${r.ok} ${r.ok === 1 ? 'item adicionado' : 'itens adicionados'}</b>${r.fora.length ? `<br><small>${r.fora.length} fora do catálogo</small>` : ''}</span>`);
      openPanel('drawer-cart');
      return;
    }
    if (acao === 'cancelar' && p) {
      if (!confirm(`Cancelar o pedido ${p.id}?`)) return;
      try { const novo = await API.cancelarPedido(p.id); ui.pedidos = ui.pedidos.map((x) => (x.id === novo.id ? novo : x)); toast(`${icon('check')}<span>Pedido ${esc(p.id)} cancelado.</span>`); }
      catch (err) { ui.msg = { tipo: 'erro', html: esc(err.message) }; }
      render();
    }
  });

  /* ---------------- Máscaras (WhatsApp e CNPJ) ---------------- */
  box.addEventListener('input', (e) => {
    const m = e.target.dataset.mask; if (!m) return;
    const d = e.target.value.replace(/\D/g, '');
    if (m === 'fone') {
      const x = d.slice(0, 11);
      e.target.value = x.length > 10 ? `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}` : x.length > 6 ? `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}` : x.length > 2 ? `(${x.slice(0, 2)}) ${x.slice(2)}` : x;
    }
    if (m === 'cnpj') {
      const x = d.slice(0, 14);
      e.target.value = x.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    }
  });

  /* ---------------- Cabeçalho: botão "Conta" mostra o nome ---------------- */
  function atualizarCabecalho(u) {
    $$('[data-open="modal-conta"]').forEach((b) => {
      const span = $('span', b); if (!span) return;
      if (!b.dataset.rotulo) b.dataset.rotulo = span.textContent;
      span.textContent = u ? primeiro(u.nome) : b.dataset.rotulo;
      b.classList.toggle('is-logado', !!u);
      b.setAttribute('aria-label', u ? `Minha conta (${u.nome})` : 'Entrar ou criar conta');
    });
  }
  API.on((u) => {
    atualizarCabecalho(u);
    if (!u) ui.pedidos = null;
    if ($('#modal-conta').classList.contains('is-open')) render();
  });

  /* ---------------- API pública do módulo ---------------- */
  window.LojaConta = {
    abrir, render,
    pedidoCriado() { ui.pedidos = null; }
  };

  /* ---------------- Inicialização ---------------- */
  API.iniciar().then((u) => {
    atualizarCabecalho(u);
    // Link de redefinição de senha: ?redefinir=TOKEN (modo api)
    const tk = new URLSearchParams(location.search).get('redefinir');
    if (tk) { ui.tokenRedefinir = tk; abrir('redefinir'); }
    // Link direto: ?conta  |  ?conta=pedidos|atacado|dados  |  ?conta=cadastro
    const c = new URLSearchParams(location.search).get('conta');
    if (c !== null && !tk) abrir(u ? (['pedidos', 'atacado', 'dados'].includes(c) ? c : 'pedidos') : (c === 'cadastro' ? 'cadastro' : 'entrar'));
  });
})();
