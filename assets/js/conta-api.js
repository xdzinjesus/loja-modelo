/* ==========================================================================
   LOJA — Contas de clientes (camada de dados)
   Interface única usada pelo site e pelo painel da loja. Dois modos:
     • 'local' → dados no navegador (localStorage), senha com PBKDF2-SHA256.
                 Funciona sem servidor: serve para testar e apresentar.
     • 'api'   → backend REST (contrato em docs/API-CONTAS.md). Trocar o modo
                 em config.js → contas.modo não exige mudar nada na interface.
   Todos os métodos são assíncronos e lançam LojaContas.Erro { message, campo }.
   ========================================================================== */
(function () {
  'use strict';
  const CFG = (window.LOJA_CONFIG && window.LOJA_CONFIG.contas) || { modo: 'local' };

  class ContaErro extends Error {
    constructor(msg, campo) { super(msg); this.name = 'ContaErro'; this.campo = campo || null; }
  }

  /* ---------------- Status de pedido ---------------- */
  const STATUS = {
    recebido:  { nome: 'Recebido',              cor: 'amber', passo: 0 },
    confirmado:{ nome: 'Confirmado',            cor: 'leaf',  passo: 1 },
    separando: { nome: 'Separando',             cor: 'leaf',  passo: 2 },
    pronto:    { nome: 'Pronto para retirada',  cor: 'leaf',  passo: 3 },
    enviado:   { nome: 'Enviado',               cor: 'leaf',  passo: 3 },
    entregue:  { nome: 'Entregue',              cor: 'forest',passo: 4 },
    cancelado: { nome: 'Cancelado',             cor: 'terra', passo: -1 }
  };
  const ATACADO_STATUS = { nenhum: 'Não solicitado', pendente: 'Em análise', aprovado: 'Aprovado', recusado: 'Não aprovado' };

  /* ---------------- Validações (reutilizadas pela interface) ---------------- */
  const so = (s) => String(s || '').replace(/\D/g, '');
  const validar = {
    nome(v) { v = String(v || '').trim(); if (v.length < 3 || !/\s/.test(v)) throw new ContaErro('Informe nome e sobrenome.', 'nome'); return v.replace(/\s+/g, ' '); },
    email(v) { v = String(v || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new ContaErro('E-mail inválido.', 'email'); return v; },
    senha(v, campo = 'senha') {
      v = String(v || '');
      if (v.length < 8) throw new ContaErro('A senha precisa de pelo menos 8 caracteres.', campo);
      if (!/[a-zA-Z]/.test(v) || !/\d/.test(v)) throw new ContaErro('Use letras e números na senha.', campo);
      return v;
    },
    fone(v) { const d = so(v); if (d.length < 10 || d.length > 11) throw new ContaErro('WhatsApp com DDD, ex.: (49) 99999-9999.', 'fone'); return d; },
    cnpj(v) {
      const c = so(v);
      const ok = (() => {
        if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
        const dv = (base) => { let s = 0, p = base.length - 7; for (let i = 0; i < base.length; i++) { s += +base[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
        const d1 = dv(c.slice(0, 12)); const d2 = dv(c.slice(0, 12) + d1);
        return d1 === +c[12] && d2 === +c[13];
      })();
      if (!ok) throw new ContaErro('CNPJ inválido. Confira os números.', 'cnpj');
      return c;
    }
  };
  const fmt = {
    fone: (d) => { d = so(d); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; },
    cnpj: (d) => { d = so(d); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d; }
  };

  /* ---------------- Eventos (login/logout/atualização) ---------------- */
  const ouvintes = new Set();
  let atual = null;
  const emitir = () => ouvintes.forEach((fn) => { try { fn(atual); } catch (e) { console.error(e); } });
  const definirAtual = (u) => { atual = u || null; emitir(); return atual; };

  /* ======================================================================
     Adaptador LOCAL (localStorage)
     ====================================================================== */
  function adaptadorLocal() {
    const K = { usuarios: 'loja:db:usuarios', pedidos: 'loja:db:pedidos', sessao: 'loja:sessao', tent: 'loja:db:tentativas', log: 'loja:db:log' };
    const ler = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
    const gravar = (k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { throw new ContaErro('Não foi possível salvar no navegador (modo privado ou armazenamento cheio).'); }
    };
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    const agora = () => new Date().toISOString();
    const SESSAO_DIAS = 30;

    // --- senha: PBKDF2-SHA256, 120 mil iterações, sal aleatório por usuário
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    async function hashSenha(senha, saltB64, iter = 120000) {
      if (!(window.crypto && crypto.subtle)) throw new ContaErro('Este navegador bloqueou a criptografia. Abra o site por http://localhost ou https.');
      const salt = saltB64 ? deB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
      const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, chave, 256);
      return { salt: b64(salt), hash: b64(bits), iter };
    }
    async function confere(senha, reg) {
      const h = await hashSenha(senha, reg.salt, reg.iter);
      // comparação em tempo constante
      if (h.hash.length !== reg.hash.length) return false;
      let d = 0; for (let i = 0; i < h.hash.length; i++) d |= h.hash.charCodeAt(i) ^ reg.hash.charCodeAt(i);
      return d === 0;
    }

    // O cliente nunca recebe hash de senha, observação interna nem dados de bloqueio
    const publico = (u) => { if (!u) return null; const { senha, notaInterna, bloqueado, ...resto } = u; return JSON.parse(JSON.stringify(resto)); };
    const publicoAdmin = (u) => { if (!u) return null; const { senha, ...resto } = u; return JSON.parse(JSON.stringify(resto)); };
    const usuarios = () => ler(K.usuarios, []);

    // Registro de atividade (logins, falhas, cadastros, ações da loja) — guarda os 1.000 mais recentes
    function registrar(tipo, quem, detalhe) {
      try {
        const l = ler(K.log, []);
        l.push({ em: agora(), tipo, usuarioId: quem?.id || null, email: quem?.email || (typeof quem === 'string' ? quem : null), ...(detalhe ? { detalhe: String(detalhe).slice(0, 200) } : {}) });
        if (l.length > 1000) l.splice(0, l.length - 1000);
        localStorage.setItem(K.log, JSON.stringify(l));
      } catch { /* registro nunca bloqueia a operação */ }
    }
    const salvarUsuarios = (l) => gravar(K.usuarios, l);
    const pedidos = () => ler(K.pedidos, []);
    const salvarPedidos = (l) => gravar(K.pedidos, l);

    function sessaoUid() {
      const s = ler(K.sessao, null);
      if (!s || !s.uid || Date.parse(s.exp) < Date.now()) return null;
      return s.uid;
    }
    function exigirLogin() {
      const id = sessaoUid(); const u = id && usuarios().find((x) => x.id === id);
      if (!u) { definirAtual(null); throw new ContaErro('Sua sessão expirou. Entre novamente.'); }
      if (u.bloqueado) { try { localStorage.removeItem(K.sessao); } catch { /* */ } definirAtual(null); throw new ContaErro('Sua conta está bloqueada. Fale com a loja pelo WhatsApp.'); }
      return u;
    }
    const usuarioDaSessao = () => { const id = sessaoUid(); const u = id && usuarios().find((x) => x.id === id); return u && !u.bloqueado ? u : null; };
    function abrirSessao(u) {
      gravar(K.sessao, { uid: u.id, exp: new Date(Date.now() + SESSAO_DIAS * 864e5).toISOString() });
      return definirAtual(publico(u));
    }
    function atualizarUsuario(id, fn) {
      const lista = usuarios(); const i = lista.findIndex((x) => x.id === id);
      if (i < 0) throw new ContaErro('Conta não encontrada.');
      fn(lista[i]); salvarUsuarios(lista);
      if (atual && atual.id === id) definirAtual(publico(lista[i]));
      return publico(lista[i]);
    }

    // --- limite de tentativas de login: 5 erros → espera 2 minutos
    function checarBloqueio(email) {
      const t = ler(K.tent, {})[email];
      if (t && t.ate && Date.parse(t.ate) > Date.now()) {
        const s = Math.ceil((Date.parse(t.ate) - Date.now()) / 1000);
        throw new ContaErro(`Muitas tentativas. Tente de novo em ${s > 60 ? Math.ceil(s / 60) + ' min' : s + ' s'}.`, 'senha');
      }
    }
    function registrarErro(email) {
      const all = ler(K.tent, {}); const t = all[email] || { n: 0 };
      t.n++; if (t.n >= 5) { t.ate = new Date(Date.now() + 120000).toISOString(); t.n = 0; }
      all[email] = t; gravar(K.tent, all);
    }
    function limparErros(email) { const all = ler(K.tent, {}); delete all[email]; gravar(K.tent, all); }

    function novoNumero() {
      const usados = new Set(pedidos().map((p) => p.id));
      let n; do { n = 'KD' + String(Math.floor(100000 + Math.random() * 900000)); } while (usados.has(n));
      return n;
    }

    // Sincroniza abas abertas (login/logout em outra aba)
    addEventListener('storage', (e) => {
      if (![K.sessao, K.usuarios].includes(e.key)) return;
      definirAtual(publico(usuarioDaSessao()));
    });

    return {
      modo: 'local',
      async iniciar() { return definirAtual(publico(usuarioDaSessao())); },

      async cadastrar({ nome, email, senha, fone }) {
        nome = validar.nome(nome); email = validar.email(email); fone = validar.fone(fone); validar.senha(senha);
        if (usuarios().some((u) => u.email === email)) throw new ContaErro('Já existe uma conta com este e-mail. Tente entrar.', 'email');
        const u = { id: uid(), nome, email, fone, senha: await hashSenha(senha), criadoEm: agora(), ultimoAcesso: agora(), acessos: 1, atacado: { status: 'nenhum' } };
        const lista = usuarios(); lista.push(u); salvarUsuarios(lista);
        registrar('cadastro', u);
        return abrirSessao(u);
      },

      async entrar({ email, senha }) {
        email = validar.email(email);
        if (!senha) throw new ContaErro('Digite sua senha.', 'senha');
        try { checarBloqueio(email); } catch (e) { registrar('login-limite', email); throw e; }
        const u = usuarios().find((x) => x.email === email);
        if (!u || !(await confere(senha, u.senha))) {
          registrarErro(email); registrar('login-falhou', u || email, u ? 'senha incorreta' : 'e-mail não cadastrado');
          throw new ContaErro('E-mail ou senha incorretos.', 'senha');
        }
        limparErros(email);
        if (u.bloqueado) { registrar('login-bloqueado', u); throw new ContaErro('Sua conta está bloqueada. Fale com a loja pelo WhatsApp.', 'senha'); }
        atualizarUsuario(u.id, (x) => { x.ultimoAcesso = agora(); x.acessos = (x.acessos || 0) + 1; });
        registrar('login', u);
        return abrirSessao(usuarios().find((x) => x.id === u.id)); // se senhaTemporaria, a interface pede a troca
      },

      async sair() { try { localStorage.removeItem(K.sessao); } catch { /* */ } definirAtual(null); },

      async atualizarPerfil({ nome, fone }) {
        const u = exigirLogin();
        nome = validar.nome(nome); fone = validar.fone(fone);
        return atualizarUsuario(u.id, (x) => { x.nome = nome; x.fone = fone; });
      },

      async alterarSenha({ atual: senhaAtual, nova }) {
        const u = exigirLogin();
        if (!(await confere(senhaAtual || '', u.senha))) throw new ContaErro('Senha atual incorreta.', 'atual');
        validar.senha(nova, 'nova');
        const h = await hashSenha(nova);
        registrar('senha-alterada', u);
        return atualizarUsuario(u.id, (x) => { x.senha = h; delete x.senhaTemporaria; });
      },

      async recuperarSenha(email) {
        validar.email(email);
        // Sem servidor não há como enviar e-mail: a loja gera uma senha temporária no painel.
        return { modo: 'local' };
      },
      async redefinirSenha() { throw new ContaErro('Redefinição por link só funciona com o servidor configurado.'); },

      async solicitarAtacado({ cnpj, razaoSocial, cidade, ramo }) {
        const u = exigirLogin();
        cnpj = validar.cnpj(cnpj);
        razaoSocial = String(razaoSocial || '').trim(); cidade = String(cidade || '').trim(); ramo = String(ramo || '').trim();
        if (razaoSocial.length < 3) throw new ContaErro('Informe a razão social ou nome da empresa.', 'razaoSocial');
        if (cidade.length < 3) throw new ContaErro('Informe a cidade/UF.', 'cidade');
        if (!ramo) throw new ContaErro('Escolha o tipo de negócio.', 'ramo');
        if (u.atacado && ['pendente', 'aprovado'].includes(u.atacado.status)) throw new ContaErro('Sua solicitação já foi enviada.');
        if (usuarios().some((x) => x.id !== u.id && x.atacado && x.atacado.cnpj === cnpj && x.atacado.status !== 'recusado'))
          throw new ContaErro('Este CNPJ já está vinculado a outra conta. Fale com a loja.', 'cnpj');
        registrar('atacado-solicitado', u, `${razaoSocial} · CNPJ ${fmt.cnpj(cnpj)}`);
        return atualizarUsuario(u.id, (x) => { x.atacado = { status: 'pendente', cnpj, razaoSocial, cidade, ramo, solicitadoEm: agora() }; });
      },

      async listarPedidos() {
        const u = exigirLogin();
        return pedidos().filter((p) => p.usuarioId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      },

      async criarPedido(dados) {
        const u = exigirLogin();
        if (!dados || !Array.isArray(dados.itens) || !dados.itens.length) throw new ContaErro('Pedido sem itens.');
        const p = {
          ...JSON.parse(JSON.stringify(dados)),
          id: novoNumero(), usuarioId: u.id, criadoEm: agora(),
          atacado: !!(u.atacado && u.atacado.status === 'aprovado'),
          status: 'recebido', historico: [{ status: 'recebido', em: agora() }]
        };
        const l = pedidos(); l.push(p); salvarPedidos(l);
        registrar('pedido', u, `${p.id} · ${p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${p.atacado ? ' · atacado' : ''}`);
        return p;
      },

      async cancelarPedido(id) {
        const u = exigirLogin();
        const l = pedidos(); const p = l.find((x) => x.id === id && x.usuarioId === u.id);
        if (!p) throw new ContaErro('Pedido não encontrado.');
        if (p.status !== 'recebido') throw new ContaErro('Este pedido já está em andamento. Fale com a loja pelo WhatsApp.');
        p.status = 'cancelado'; p.historico.push({ status: 'cancelado', em: agora(), nota: 'Cancelado pelo cliente' });
        salvarPedidos(l); return p;
      },

      /* ---------- Painel da loja ---------- */
      admin: {
        logado() { try { return sessionStorage.getItem('loja:admin') === '1'; } catch { return false; } },
        async entrar({ pin }) {
          if (String(pin || '') !== String(CFG.painelPin || '')) { registrar('admin-login-falhou', 'painel'); throw new ContaErro('PIN incorreto.', 'pin'); }
          try { sessionStorage.setItem('loja:admin', '1'); } catch { /* */ }
          registrar('admin-login', 'painel');
          return true;
        },
        async sair() { try { sessionStorage.removeItem('loja:admin'); } catch { /* */ } },
        _exigir() { if (!this.logado()) throw new ContaErro('Entre no painel primeiro.'); },
        async usuarios() { this._exigir(); return usuarios().map(publicoAdmin).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)); },
        async atividade() { this._exigir(); return ler(K.log, []).slice().reverse(); },

        async editarUsuario(id, { nome, fone, email, notaInterna }) {
          this._exigir();
          const d = {};
          if (nome !== undefined) d.nome = validar.nome(nome);
          if (fone !== undefined) d.fone = validar.fone(fone);
          if (email !== undefined) {
            d.email = validar.email(email);
            if (usuarios().some((u) => u.id !== id && u.email === d.email)) throw new ContaErro('Outro cliente já usa este e-mail.', 'email');
          }
          if (notaInterna !== undefined) d.notaInterna = String(notaInterna).slice(0, 2000);
          const r = atualizarUsuario(id, (x) => Object.assign(x, d));
          registrar('admin-editou', r, Object.keys(d).join(', '));
          return publicoAdmin(usuarios().find((x) => x.id === id));
        },
        async bloquear(id, bloquear, motivo) {
          this._exigir();
          atualizarUsuario(id, (x) => { if (bloquear) x.bloqueado = { em: agora(), motivo: String(motivo || '').slice(0, 300) }; else delete x.bloqueado; });
          const u = usuarios().find((x) => x.id === id);
          registrar(bloquear ? 'admin-bloqueou' : 'admin-desbloqueou', u, motivo);
          if (bloquear && atual && atual.id === id) { try { localStorage.removeItem(K.sessao); } catch { /* */ } definirAtual(null); }
          return publicoAdmin(u);
        },
        async excluirUsuario(id) {
          this._exigir();
          const lista = usuarios(); const u = lista.find((x) => x.id === id);
          if (!u) throw new ContaErro('Conta não encontrada.');
          salvarUsuarios(lista.filter((x) => x.id !== id));
          // pedidos ficam para controle fiscal, marcados como de conta excluída
          const ps = pedidos(); ps.forEach((p) => { if (p.usuarioId === id) p.contaExcluida = true; }); salvarPedidos(ps);
          registrar('admin-excluiu', { id: null, email: u.email }, u.nome);
          if (atual && atual.id === id) { try { localStorage.removeItem(K.sessao); } catch { /* */ } definirAtual(null); }
          return true;
        },
        async definirDescontoAtacado(id, pct) {
          this._exigir();
          const v = pct === null || pct === '' ? null : Number(pct);
          if (v !== null && (!Number.isFinite(v) || v < 0 || v > 50)) throw new ContaErro('Desconto entre 0% e 50%.', 'desconto');
          atualizarUsuario(id, (x) => { if (!x.atacado) x.atacado = { status: 'nenhum' }; if (v === null) delete x.atacado.descontoPercentual; else x.atacado.descontoPercentual = v; });
          const u = usuarios().find((x) => x.id === id);
          registrar('admin-desconto', u, v === null ? 'padrão da loja' : v + '%');
          return publicoAdmin(u);
        },
        async pedidos() {
          this._exigir();
          const us = new Map(usuarios().map((u) => [u.id, u]));
          return pedidos().map((p) => ({ ...p, conta: (({ nome, email, fone } = {}) => ({ nome, email, fone }))(us.get(p.usuarioId)) }))
            .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
        },
        async atualizarStatus(id, status, nota) {
          this._exigir();
          if (!STATUS[status]) throw new ContaErro('Status inválido.');
          const l = pedidos(); const p = l.find((x) => x.id === id);
          if (!p) throw new ContaErro('Pedido não encontrado.');
          p.status = status; p.historico.push({ status, em: agora(), ...(nota ? { nota: String(nota).slice(0, 300) } : {}) });
          salvarPedidos(l);
          registrar('admin-pedido', usuarios().find((x) => x.id === p.usuarioId), `${p.id} → ${STATUS[status].nome}`);
          return p;
        },
        async responderAtacado(usuarioId, aprovado, motivo) {
          this._exigir();
          atualizarUsuario(usuarioId, (x) => {
            if (!x.atacado || x.atacado.status === 'nenhum') throw new ContaErro('Esta conta não pediu acesso de atacado.');
            const revogando = !aprovado && x.atacado.status === 'aprovado';
            x.atacado.status = aprovado ? 'aprovado' : 'recusado';
            x.atacado.respondidoEm = agora();
            if (motivo) x.atacado.motivo = String(motivo).slice(0, 300); else if (!revogando) delete x.atacado.motivo;
          });
          const u = usuarios().find((x) => x.id === usuarioId);
          registrar(aprovado ? 'admin-atacado-aprovou' : 'admin-atacado-recusou', u, motivo);
          return publicoAdmin(u);
        },
        async senhaTemporaria(usuarioId) {
          this._exigir();
          const alfa = 'abcdefghjkmnpqrstuvwxyz23456789';
          const rnd = crypto.getRandomValues(new Uint8Array(10));
          const s = Array.from(rnd, (b) => alfa[b % alfa.length]).join('');
          const nova = `${s.slice(0, 5)}-${s.slice(5)}${rnd[0] % 10}`; // ex.: "kq7mz-a3hpt4" (sempre tem letra e número)
          const h = await hashSenha(nova);
          atualizarUsuario(usuarioId, (x) => { x.senha = h; x.senhaTemporaria = true; });
          registrar('admin-senha-temporaria', usuarios().find((x) => x.id === usuarioId));
          return nova;
        }
      }
    };
  }

  /* ======================================================================
     Adaptador API (backend REST — ver docs/API-CONTAS.md)
     ====================================================================== */
  function adaptadorApi() {
    const BASE = String(CFG.apiUrl || '').replace(/\/+$/, '');
    const TK = 'loja:token', ATK = 'loja:admin-token';
    const tok = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const setTok = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* */ } };

    async function req(metodo, caminho, corpo, chave = TK) {
      if (!BASE) throw new ContaErro('Servidor de contas não configurado (config.js → contas.apiUrl).');
      let r;
      try {
        r = await fetch(BASE + caminho, {
          method: metodo,
          headers: { 'Content-Type': 'application/json', ...(tok(chave) ? { Authorization: 'Bearer ' + tok(chave) } : {}) },
          body: corpo === undefined ? undefined : JSON.stringify(corpo)
        });
      } catch { throw new ContaErro('Sem conexão com o servidor. Verifique sua internet.'); }
      let dados = null; try { dados = r.status === 204 ? null : await r.json(); } catch { /* */ }
      if (r.status === 401 && chave === TK) { setTok(TK, null); definirAtual(null); }
      if (!r.ok) throw new ContaErro((dados && dados.erro) || `Erro no servidor (${r.status}).`, dados && dados.campo);
      return dados;
    }
    const sessao = (d) => { setTok(TK, d.token); return definirAtual(d.usuario); };

    return {
      modo: 'api',
      async iniciar() {
        if (!tok(TK)) return definirAtual(null);
        try { return definirAtual((await req('GET', '/me')).usuario); } catch { return atual; }
      },
      async cadastrar(d) {
        const c = { nome: validar.nome(d.nome), email: validar.email(d.email), fone: validar.fone(d.fone), senha: validar.senha(d.senha) };
        return sessao(await req('POST', '/auth/cadastro', c));
      },
      async entrar({ email, senha }) {
        email = validar.email(email); if (!senha) throw new ContaErro('Digite sua senha.', 'senha');
        return sessao(await req('POST', '/auth/entrar', { email, senha }));
      },
      async sair() { try { await req('POST', '/auth/sair'); } catch { /* */ } setTok(TK, null); definirAtual(null); },
      async atualizarPerfil({ nome, fone }) { return definirAtual((await req('PATCH', '/me', { nome: validar.nome(nome), fone: validar.fone(fone) })).usuario); },
      async alterarSenha({ atual: a, nova }) { validar.senha(nova, 'nova'); return definirAtual((await req('POST', '/me/senha', { atual: a, nova })).usuario); },
      async recuperarSenha(email) { await req('POST', '/auth/recuperar', { email: validar.email(email) }); return { enviado: true }; },
      async redefinirSenha({ token, senha }) { validar.senha(senha); return sessao(await req('POST', '/auth/redefinir', { token, senha })); },
      async solicitarAtacado(d) {
        const c = { cnpj: validar.cnpj(d.cnpj), razaoSocial: String(d.razaoSocial || '').trim(), cidade: String(d.cidade || '').trim(), ramo: String(d.ramo || '').trim() };
        if (c.razaoSocial.length < 3) throw new ContaErro('Informe a razão social ou nome da empresa.', 'razaoSocial');
        if (c.cidade.length < 3) throw new ContaErro('Informe a cidade/UF.', 'cidade');
        if (!c.ramo) throw new ContaErro('Escolha o tipo de negócio.', 'ramo');
        return definirAtual((await req('POST', '/me/atacado', c)).usuario);
      },
      async listarPedidos() { return (await req('GET', '/me/pedidos')).pedidos; },
      async criarPedido(p) { return (await req('POST', '/me/pedidos', p)).pedido; },
      async cancelarPedido(id) { return (await req('POST', `/me/pedidos/${encodeURIComponent(id)}/cancelar`)).pedido; },
      admin: {
        logado() { return !!tok(ATK); },
        async entrar({ email, senha }) { const d = await req('POST', '/admin/entrar', { email, senha }, ATK); setTok(ATK, d.token); return true; },
        async sair() { setTok(ATK, null); },
        async usuarios() { return (await req('GET', '/admin/usuarios', undefined, ATK)).usuarios; },
        async pedidos() { return (await req('GET', '/admin/pedidos', undefined, ATK)).pedidos; },
        async atualizarStatus(id, status, nota) { return (await req('PATCH', `/admin/pedidos/${encodeURIComponent(id)}`, { status, nota }, ATK)).pedido; },
        async responderAtacado(uid, aprovado, motivo) { return (await req('POST', `/admin/usuarios/${encodeURIComponent(uid)}/atacado`, { aprovado, motivo }, ATK)).usuario; },
        async atividade() { return (await req('GET', '/admin/atividade', undefined, ATK)).eventos; },
        async editarUsuario(uid, dados) { return (await req('PATCH', `/admin/usuarios/${encodeURIComponent(uid)}`, dados, ATK)).usuario; },
        async bloquear(uid, bloqueado, motivo) { return (await req('POST', `/admin/usuarios/${encodeURIComponent(uid)}/bloqueio`, { bloqueado, motivo }, ATK)).usuario; },
        async excluirUsuario(uid) { await req('DELETE', `/admin/usuarios/${encodeURIComponent(uid)}`, undefined, ATK); return true; },
        async definirDescontoAtacado(uid, pct) { return (await req('PATCH', `/admin/usuarios/${encodeURIComponent(uid)}/atacado`, { descontoPercentual: pct === '' ? null : pct }, ATK)).usuario; },
        async senhaTemporaria(uid) { return (await req('POST', `/admin/usuarios/${encodeURIComponent(uid)}/senha-temporaria`, undefined, ATK)).senha; }
      }
    };
  }

  const impl = CFG.modo === 'api' ? adaptadorApi() : adaptadorLocal();

  window.LojaContas = Object.assign(impl, {
    Erro: ContaErro, STATUS, ATACADO_STATUS, validar, fmt,
    usuario: () => atual,
    on(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
  });
})();
