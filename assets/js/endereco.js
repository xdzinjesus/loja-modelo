/* ==========================================================================
   LOJA — Módulo de endereço de entrega (window.LojaEndereco)

   Inspirado no fluxo de apps de entrega (iFood, Rappi, Mercado Livre):
   - endereços salvos por conta (Casa, Trabalho…), com padrão, editar e excluir;
   - busca pelo endereço ESCRITO (rua + número) com sugestões, sem precisar saber o CEP;
   - "Sei o CEP" e "Usar minha localização" como atalhos;
   - número / sem número, complemento, ponto de referência, tipo de local;
   - instruções para o entregador (atalhos + texto livre) e quem vai receber.

   Serviços públicos e gratuitos, sem chave:
   - ViaCEP (viacep.com.br): CEP → endereço e rua/cidade/UF → lista de CEPs;
   - Nominatim / OpenStreetMap: localização do aparelho → endereço (só quando o cliente pede).
   Se a internet falhar, o cliente digita tudo à mão: nada aqui bloqueia o pedido.

   Endereços salvos: localStorage "loja:enderecos:<id da conta>" no modo local.
   Em produção vão para o backend (docs/API-CONTAS.md → /me/enderecos).
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.LOJA_CONFIG || {};
  const LOJA = CFG.loja || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
  const soDig = (s) => String(s || '').replace(/\D/g, '');
  const fmtCep = (s) => { const d = soDig(s).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
  const fmtFone = (s) => { const d = soDig(s).slice(0, 11); if (d.length < 3) return d; const n = d.slice(2); return `(${d.slice(0, 2)}) ${n.length > 5 ? n.slice(0, n.length - 4) + '-' + n.slice(-4) : n}`; };
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

  const TIPOS = [
    { id: 'casa', nome: 'Casa' }, { id: 'apto', nome: 'Apartamento' }, { id: 'condominio', nome: 'Condomínio' },
    { id: 'comercial', nome: 'Comercial' }, { id: 'outro', nome: 'Outro' }
  ];
  const APELIDOS = ['Casa', 'Trabalho'];
  const INSTRUCOES = ['Deixar na portaria', 'Ligar quando chegar', 'Chamar no WhatsApp', 'Não tocar a campainha', 'Tem cachorro', 'Entregar em mãos'];

  /* ---------------- Formatação (usada no checkout, Meus pedidos, admin e WhatsApp) ---------------- */
  function linha1(e) {
    if (!e) return '';
    const num = e.semNumero ? 's/n' : (e.numero || '');
    return [e.logradouro, num].filter(Boolean).join(', ') + (e.complemento ? ` – ${e.complemento}` : '');
  }
  function linha2(e) {
    if (!e) return '';
    const cid = e.cidade && e.uf ? `${e.cidade}/${e.uf}` : (e.cidade || '');
    return [e.bairro, cid].filter(Boolean).join(', ') + (e.cep ? ` · CEP ${fmtCep(e.cep)}` : '');
  }
  /** Texto de uma linha (resumo do pedido, planilha). Aceita também pedidos antigos (só CEP). */
  function formatar(e) {
    if (!e) return '';
    if (!e.numero && !e.semNumero && !e.complemento && e.cidade && e.cidade.includes('/')) {
      // formato antigo: { cep, cidade: 'Concórdia/SC', logradouro, bairro }
      return [e.logradouro, e.bairro, e.cidade].filter(Boolean).join(', ') + (e.cep ? ` · CEP ${fmtCep(e.cep)}` : '');
    }
    return [linha1(e), linha2(e)].filter(Boolean).join(' · ');
  }
  /** Texto completo, várias linhas (WhatsApp para a loja / ficha do pedido no admin). */
  function formatarCompleto(e) {
    if (!e) return '';
    const l = [formatar(e)];
    if (e.referencia) l.push(`Referência: ${e.referencia}`);
    const tipo = TIPOS.find((t) => t.id === e.tipoLocal);
    if (tipo && tipo.id !== 'casa') l.push(`Local: ${tipo.nome}`);
    if (e.instrucoes) l.push(`Instruções: ${e.instrucoes}`);
    if (e.recebedor && e.recebedor.nome) l.push(`Quem recebe: ${e.recebedor.nome}${e.recebedor.fone ? ' · ' + e.recebedor.fone : ''}`);
    return l.join('\n');
  }
  function mapsUrl(e) {
    if (!e) return '';
    if (e.lat && e.lon) return `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`;
    const q = [e.logradouro, e.semNumero ? '' : e.numero, e.bairro, e.cidade, e.uf, fmtCep(e.cep)].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  /* ---------------- Endereços salvos ---------------- */
  const chave = (uid) => `loja:enderecos:${uid || 'visitante'}`;
  function lerSalvos(uid) { try { const v = JSON.parse(localStorage.getItem(chave(uid)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function gravarSalvos(uid, lista) { try { localStorage.setItem(chave(uid), JSON.stringify(lista.slice(0, 12))); } catch { /* armazenamento cheio/bloqueado: segue sem salvar */ } }

  /* ---------------- Serviços de endereço ---------------- */
  const cacheCep = {};
  async function buscarCep(cep) {
    const d = soDig(cep); if (d.length !== 8) return null;
    if (cacheCep[d] !== undefined) return cacheCep[d];
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`); const j = await r.json();
    cacheCep[d] = j && !j.erro ? { cep: d, logradouro: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '' } : null;
    return cacheCep[d];
  }
  const cacheRua = {};
  async function buscarRua(uf, cidade, rua) {
    const k = `${uf}|${cidade}|${rua}`.toLowerCase();
    if (cacheRua[k]) return cacheRua[k];
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(rua)}/json/`;
    const r = await fetch(url); const j = await r.json();
    const vistos = new Set();
    cacheRua[k] = (Array.isArray(j) ? j : []).map((x) => ({ cep: soDig(x.cep), logradouro: x.logradouro, bairro: x.bairro, cidade: x.localidade, uf: x.uf, faixa: x.complemento || '' }))
      .filter((x) => { const id = x.logradouro + '|' + x.bairro + '|' + x.cep; if (vistos.has(id)) return false; vistos.add(id); return true; }).slice(0, 8);
    return cacheRua[k];
  }
  async function enderecoDaLocalizacao() {
    const pos = await new Promise((ok, erro) => navigator.geolocation.getCurrentPosition(ok, erro, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }));
    const { latitude: lat, longitude: lon } = pos.coords;
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`);
    const j = await r.json(); const a = j.address || {};
    const ufIso = (a['ISO3166-2-lvl4'] || '').split('-')[1] || '';
    return {
      logradouro: a.road || a.pedestrian || a.footway || '', numero: a.house_number || '', bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || '',
      cidade: a.city || a.town || a.village || a.municipality || '', uf: UFS.includes(ufIso) ? ufIso : '', cep: soDig(a.postcode), lat: +lat.toFixed(6), lon: +lon.toFixed(6)
    };
  }
  /** "Rua Marechal Deodoro 450" → { rua: 'Rua Marechal Deodoro', numero: '450' } */
  function separarNumero(txt) {
    const m = String(txt || '').trim().match(/^(.*?)[,\s]+(?:n[º°o.]?\s*)?(\d{1,6}[a-zA-Z]?)\s*$/);
    return m ? { rua: m[1].trim(), numero: m[2] } : { rua: String(txt || '').trim(), numero: '' };
  }
  /** O ViaCEP busca melhor sem o tipo ("Rua", "Av.") */
  const nucleoRua = (r) => r.replace(/^(rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|al\.?|rodovia|rod\.?|estrada|servidão|servidao)\s+/i, '').trim();

  /* ==========================================================================
     Componente: montar(container, opções)
     ========================================================================== */
  const vazio = () => ({ id: '', apelido: 'Casa', cep: '', logradouro: '', numero: '', semNumero: false, complemento: '', bairro: '', cidade: LOJA.cidade || '', uf: LOJA.uf || 'SC',
    referencia: '', tipoLocal: 'casa', instrucoes: '', instrucoesRapidas: [], recebedorOutro: false, recebedor: { nome: '', fone: '' }, lat: null, lon: null });

  function montar(box, opt = {}) {
    const S = {
      uid: opt.usuarioId || '',
      salvos: lerSalvos(opt.usuarioId),
      selId: '',
      modo: 'lista',            // 'lista' | 'form'
      etapaForm: 'busca',       // 'busca' (procurar) | 'detalhes'
      f: vazio(),
      editando: '',
      salvar: true,
      busca: { txt: '', sug: [], status: '', cep: '', cepStatus: '' },
      erros: {}
    };
    const padrao = S.salvos.find((e) => e.padrao) || S.salvos[0];
    if (opt.selecionado && S.salvos.some((e) => e.id === opt.selecionado)) S.selId = opt.selecionado;
    else if (padrao) S.selId = padrao.id;
    if (!S.salvos.length) S.modo = 'form';

    const mudou = () => opt.aoMudar && opt.aoMudar(atual());
    function atual() {
      if (S.modo === 'lista') return S.salvos.find((e) => e.id === S.selId) || null;
      return null;
    }

    /* ---------- render ---------- */
    function render() {
      box.innerHTML = S.modo === 'lista' ? htmlLista() : htmlForm();
      box.classList.add('end');
    }
    function htmlLista() {
      return `<div class="end__topo"><b>Endereço de entrega</b></div>
        <div class="end__lista" role="radiogroup" aria-label="Endereços salvos">
        ${S.salvos.map((e) => `<label class="end__item${e.id === S.selId ? ' is-sel' : ''}">
          <input type="radio" name="end-sel" value="${esc(e.id)}" ${e.id === S.selId ? 'checked' : ''}>
          <span class="end__ic">${icon(e.apelido === 'Trabalho' ? 'store' : e.apelido === 'Casa' ? 'home' : 'pin')}</span>
          <span class="end__txt"><b>${esc(e.apelido || 'Endereço')}${e.padrao ? ' <em class="end__pill">padrão</em>' : ''}</b>
            <span>${esc(linha1(e))}</span><small>${esc(linha2(e))}</small>
            ${e.referencia ? `<small class="end__ref">${icon('pin')}${esc(e.referencia)}</small>` : ''}
            ${e.instrucoes ? `<small class="end__ref">${icon('truck')}${esc(e.instrucoes)}</small>` : ''}</span>
          <span class="end__acoes"><button type="button" class="end__lnk" data-end="editar" data-id="${esc(e.id)}">Editar</button>
            ${!e.padrao ? `<button type="button" class="end__lnk" data-end="padrao" data-id="${esc(e.id)}">Tornar padrão</button>` : ''}
            <button type="button" class="end__lnk end__lnk--x" data-end="excluir" data-id="${esc(e.id)}">Excluir</button></span>
        </label>`).join('')}
        </div>
        <button type="button" class="end__novo" data-end="novo">${icon('plus')}Adicionar novo endereço</button>
        <div class="end__confirma" data-confirma hidden></div>`;
    }

    function htmlForm() {
      const f = S.f, b = S.busca, E = S.erros;
      const err = (k) => (E[k] ? ` is-error` : '');
      const msg = (k) => (E[k] ? `<small class="end__erro">${esc(E[k])}</small>` : '');
      const cab = `<div class="end__topo"><b>${S.editando ? 'Editar endereço' : 'Novo endereço'}</b>
        ${S.salvos.length ? `<button type="button" class="end__lnk" data-end="cancelar">Cancelar</button>` : ''}</div>`;

      if (S.etapaForm === 'busca') {
        return `${cab}
          <p class="end__dica">Digite a rua e o número, do jeito que você escreve. Não precisa saber o CEP.</p>
          <div class="end__busca">
            <div class="field end__q"><input id="end-q" placeholder=" " autocomplete="street-address" value="${esc(b.txt)}"><label for="end-q">Rua e número · ex.: Rua Marechal Deodoro, 450</label></div>
            <div class="field-row end__cid">
              <div class="field"><input id="end-bcid" placeholder=" " autocomplete="address-level2" value="${esc(f.cidade)}"><label for="end-bcid">Cidade</label></div>
              <div class="field field--select end__uf"><select id="end-buf" autocomplete="address-level1">${UFS.map((u) => `<option${u === f.uf ? ' selected' : ''}>${u}</option>`).join('')}</select><label for="end-buf">UF</label></div>
            </div>
          </div>
          <div class="end__sug" id="end-sug" aria-live="polite">${htmlSugestoes()}</div>
          <div class="end__atalhos">
            <button type="button" class="end__atalho" data-end="local">${icon('pin')}<span><b>Usar minha localização</b><small>Preenche pelo GPS do celular</small></span></button>
            <div class="end__atalho end__atalho--cep">${icon('truck')}<span><b>Sei o CEP</b>
              <span class="end__cepbox"><input id="end-bcep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${esc(b.cep)}" aria-label="CEP"></span>
              <small id="end-bcep-info">${b.cepStatus === 'buscando' ? 'Buscando…' : b.cepStatus === 'invalido' ? '<span class="end__erro">CEP não encontrado</span>' : 'Completa rua, bairro e cidade'}</small></span></div>
          </div>
          <button type="button" class="end__lnk end__manual" data-end="manual">Não achei meu endereço · preencher manualmente</button>`;
      }

      return `${cab}
        <div class="end__resumo">${icon('pin')}<span><b>${esc([f.logradouro, f.semNumero ? 's/n' : f.numero].filter(Boolean).join(', ') || 'Endereço')}</b><small>${esc([f.bairro, f.cidade && f.uf ? f.cidade + '/' + f.uf : f.cidade].filter(Boolean).join(', '))}${f.cep ? ' · CEP ' + esc(fmtCep(f.cep)) : ''}</small></span>
          <button type="button" class="end__lnk" data-end="buscar-de-novo">Trocar</button></div>

        <div class="field${err('logradouro')}"><input id="end-rua" placeholder=" " autocomplete="address-line1" maxlength="120" value="${esc(f.logradouro)}"><label for="end-rua">Rua / Avenida</label>${msg('logradouro')}</div>
        <div class="field-row end__numrow">
          <div class="field${err('numero')}"><input id="end-num" placeholder=" " inputmode="numeric" maxlength="10" value="${esc(f.numero)}" ${f.semNumero ? 'disabled' : ''}><label for="end-num">Número</label>${msg('numero')}</div>
          <label class="end__check"><input type="checkbox" id="end-sn" ${f.semNumero ? 'checked' : ''}>Sem número</label>
        </div>

        <p class="end__rot">Tipo de local</p>
        <div class="chips end__chips" role="radiogroup" aria-label="Tipo de local">${TIPOS.map((t) => `<button type="button" class="chip${f.tipoLocal === t.id ? ' is-on' : ''}" data-tipo="${t.id}" role="radio" aria-checked="${f.tipoLocal === t.id}">${t.nome}</button>`).join('')}</div>

        <div class="field${err('complemento')}"><input id="end-comp" placeholder=" " autocomplete="address-line2" maxlength="80" value="${esc(f.complemento)}"><label for="end-comp">${f.tipoLocal === 'apto' || f.tipoLocal === 'condominio' ? 'Bloco e apartamento' : f.tipoLocal === 'comercial' ? 'Sala / andar / empresa' : 'Complemento (opcional) · casa 2, fundos…'}</label>${msg('complemento')}</div>
        <div class="field-row">
          <div class="field${err('bairro')}"><input id="end-bairro" placeholder=" " maxlength="80" value="${esc(f.bairro)}"><label for="end-bairro">Bairro</label>${msg('bairro')}</div>
          <div class="field${err('cep')}"><input id="end-cep" placeholder=" " inputmode="numeric" maxlength="9" value="${esc(fmtCep(f.cep))}"><label for="end-cep">CEP (opcional)</label>${msg('cep')}</div>
        </div>
        <div class="field-row end__cid">
          <div class="field${err('cidade')}"><input id="end-cid" placeholder=" " maxlength="80" value="${esc(f.cidade)}"><label for="end-cid">Cidade</label>${msg('cidade')}</div>
          <div class="field field--select end__uf"><select id="end-uf">${UFS.map((u) => `<option${u === f.uf ? ' selected' : ''}>${u}</option>`).join('')}</select><label for="end-uf">UF</label></div>
        </div>
        <div class="field"><input id="end-ref" placeholder=" " maxlength="120" value="${esc(f.referencia)}"><label for="end-ref">Ponto de referência · ex.: em frente à padaria</label></div>

        <p class="end__rot">Instruções para a entrega <span>(opcional)</span></p>
        <div class="chips end__chips">${INSTRUCOES.map((t) => `<button type="button" class="chip${f.instrucoesRapidas.includes(t) ? ' is-on' : ''}" data-instr="${esc(t)}" aria-pressed="${f.instrucoesRapidas.includes(t)}">${t}</button>`).join('')}</div>
        <div class="field"><textarea id="end-instr" placeholder=" " rows="2" maxlength="200">${esc(f.instrucoes)}</textarea><label for="end-instr">Outras instruções · ex.: interfone 12, portão azul</label></div>

        <p class="end__rot">Quem vai receber?</p>
        <div class="chips end__chips"><button type="button" class="chip${!f.recebedorOutro ? ' is-on' : ''}" data-receb="eu">Eu mesmo</button><button type="button" class="chip${f.recebedorOutro ? ' is-on' : ''}" data-receb="outro">Outra pessoa</button></div>
        ${f.recebedorOutro ? `<div class="field-row">
          <div class="field${err('recNome')}"><input id="end-rnome" placeholder=" " maxlength="80" value="${esc(f.recebedor.nome)}"><label for="end-rnome">Nome de quem recebe</label>${msg('recNome')}</div>
          <div class="field${err('recFone')}"><input id="end-rfone" placeholder=" " inputmode="tel" maxlength="16" value="${esc(f.recebedor.fone)}"><label for="end-rfone">Telefone de quem recebe</label>${msg('recFone')}</div></div>` : ''}

        <p class="end__rot">Salvar como</p>
        <div class="chips end__chips">${APELIDOS.map((a) => `<button type="button" class="chip${f.apelido === a ? ' is-on' : ''}" data-apelido="${a}">${a}</button>`).join('')}
          <button type="button" class="chip${!APELIDOS.includes(f.apelido) ? ' is-on' : ''}" data-apelido="">Outro</button></div>
        ${!APELIDOS.includes(f.apelido) ? `<div class="field"><input id="end-apelido" placeholder=" " maxlength="30" value="${esc(f.apelido)}"><label for="end-apelido">Nome do endereço · ex.: Casa da mãe</label></div>` : ''}
        ${S.uid ? `<label class="end__check end__check--linha"><input type="checkbox" id="end-salvar" ${S.salvar ? 'checked' : ''}>Salvar este endereço para as próximas compras</label>` : ''}
        <button type="button" class="btn btn--ghost btn--block end__usar" data-end="usar">${icon('check')}Usar este endereço</button>`;
    }

    function htmlSugestoes() {
      const b = S.busca;
      if (b.status === 'buscando') return `<p class="end__st">${icon('search')}Procurando endereços…</p>`;
      if (b.status === 'curto') return `<p class="end__st">Digite pelo menos 3 letras do nome da rua.</p>`;
      if (b.status === 'nada') return `<p class="end__st">Não encontramos essa rua em ${esc(S.f.cidade)}/${esc(S.f.uf)}. Confira a cidade ou <button type="button" class="end__lnk" data-end="manual">preencha manualmente</button>.</p>`;
      if (b.status === 'offline') return `<p class="end__st">Sem conexão para buscar. <button type="button" class="end__lnk" data-end="manual">Preencher manualmente</button></p>`;
      if (!b.sug.length) return '';
      const { numero } = separarNumero(b.txt);
      return `<ul class="end__sugl">${b.sug.map((s, i) => `<li><button type="button" data-sug="${i}">${icon('pin')}<span><b>${esc(s.logradouro)}${numero ? ', ' + esc(numero) : ''}</b><small>${esc([s.bairro, s.cidade + '/' + s.uf].filter(Boolean).join(', '))} · CEP ${esc(fmtCep(s.cep))}${s.faixa ? ' · ' + esc(s.faixa) : ''}</small></span></button></li>`).join('')}</ul>`;
    }

    /* ---------- leitura dos campos ---------- */
    const val = (id) => { const el = box.querySelector('#' + id); return el ? el.value.trim() : null; };
    function lerForm() {
      if (S.modo !== 'form' || S.etapaForm !== 'detalhes') return;
      const f = S.f;
      const set = (k, id) => { const v = val(id); if (v !== null) f[k] = v; };
      set('logradouro', 'end-rua'); set('numero', 'end-num'); set('complemento', 'end-comp'); set('bairro', 'end-bairro');
      set('cidade', 'end-cid'); set('uf', 'end-uf'); set('referencia', 'end-ref'); set('instrucoes', 'end-instr');
      const cep = val('end-cep'); if (cep !== null) f.cep = soDig(cep);
      const ap = val('end-apelido'); if (ap !== null) f.apelido = ap;
      if (f.recebedorOutro) { const n = val('end-rnome'), t = val('end-rfone'); if (n !== null) f.recebedor.nome = n; if (t !== null) f.recebedor.fone = t; }
      const sv = box.querySelector('#end-salvar'); if (sv) S.salvar = sv.checked;
    }
    function validar() {
      const f = S.f, E = {};
      if (f.logradouro.length < 3) E.logradouro = 'Informe a rua.';
      if (!f.semNumero && !f.numero) E.numero = 'Informe o número ou marque "Sem número".';
      if ((f.tipoLocal === 'apto' || f.tipoLocal === 'condominio') && !f.complemento) E.complemento = 'Informe bloco e apartamento.';
      if (f.bairro.length < 2) E.bairro = 'Informe o bairro.';
      if (f.cidade.length < 2) E.cidade = 'Informe a cidade.';
      if (f.cep && soDig(f.cep).length !== 8) E.cep = 'CEP com 8 números (ou deixe em branco).';
      if (f.recebedorOutro) {
        if (f.recebedor.nome.length < 2) E.recNome = 'Informe quem vai receber.';
        if (soDig(f.recebedor.fone).length < 10) E.recFone = 'Telefone com DDD.';
      }
      S.erros = E;
      return !Object.keys(E).length;
    }
    function montarEndereco() {
      const f = S.f;
      const instr = [...f.instrucoesRapidas, f.instrucoes].filter(Boolean).join('; ');
      return {
        id: S.editando || 'e' + Date.now().toString(36),
        apelido: (f.apelido || 'Endereço').slice(0, 30),
        cep: soDig(f.cep), logradouro: f.logradouro, numero: f.semNumero ? '' : f.numero, semNumero: !!f.semNumero,
        complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, uf: f.uf,
        referencia: f.referencia, tipoLocal: f.tipoLocal, instrucoes: instr, instrucoesRapidas: f.instrucoesRapidas.slice(), instrucoesTexto: f.instrucoes,
        recebedor: f.recebedorOutro ? { nome: f.recebedor.nome, fone: fmtFone(f.recebedor.fone) } : null,
        lat: f.lat || null, lon: f.lon || null,
        padrao: S.editando ? !!(S.salvos.find((e) => e.id === S.editando) || {}).padrao : !S.salvos.length
      };
    }
    /** Confirma o formulário. Retorna true se ficou um endereço válido selecionado. */
    function confirmarForm() {
      lerForm();
      if (S.etapaForm === 'busca') { S.erros = {}; render(); focarPrimeiro('#end-q'); return false; }
      if (!validar()) { render(); const el = box.querySelector('.field.is-error input, .field.is-error textarea'); if (el) { el.focus(); el.parentElement.classList.remove('is-error'); void el.offsetWidth; el.parentElement.classList.add('is-error'); } return false; }
      const e = montarEndereco();
      if (S.editando) S.salvos = S.salvos.map((x) => (x.id === e.id ? e : x));
      else S.salvos.unshift(e);
      if (S.uid && S.salvar) gravarSalvos(S.uid, S.salvos);
      else if (!S.editando) e._temporario = true;
      S.selId = e.id; S.modo = 'lista'; S.editando = ''; S.erros = {};
      render(); mudou();
      return true;
    }
    function abrirForm(e) {
      S.modo = 'form'; S.erros = {};
      if (e) {
        S.editando = e.id;
        S.f = { ...vazio(), ...e, instrucoesRapidas: (e.instrucoesRapidas || []).slice(), instrucoes: e.instrucoesTexto ?? e.instrucoes ?? '', recebedorOutro: !!(e.recebedor && e.recebedor.nome), recebedor: { nome: '', fone: '', ...(e.recebedor || {}) } };
        S.etapaForm = 'detalhes';
      } else { S.editando = ''; S.f = vazio(); S.etapaForm = 'busca'; S.busca = { txt: '', sug: [], status: '', cep: '', cepStatus: '' }; }
      render(); focarPrimeiro(e ? '#end-num' : '#end-q');
    }
    function focarPrimeiro(sel) { const el = box.querySelector(sel); if (el && window.matchMedia('(pointer: fine)').matches) el.focus(); }
    function irDetalhes(dados) {
      Object.assign(S.f, dados);
      S.etapaForm = 'detalhes'; S.erros = {}; render();
      focarPrimeiro(S.f.numero ? '#end-comp' : '#end-num');
    }

    /* ---------- busca pelo texto ---------- */
    let tBusca = 0, seq = 0;
    function agendarBusca() {
      clearTimeout(tBusca);
      tBusca = setTimeout(executarBusca, 450);
    }
    async function executarBusca() {
      const { rua } = separarNumero(S.busca.txt);
      const nucleo = nucleoRua(rua);
      const sugBox = () => box.querySelector('#end-sug');
      if (!S.busca.txt) { S.busca.status = ''; S.busca.sug = []; if (sugBox()) sugBox().innerHTML = ''; return; }
      if (nucleo.length < 3 || S.f.cidade.length < 3) { S.busca.status = 'curto'; S.busca.sug = []; if (sugBox()) sugBox().innerHTML = htmlSugestoes(); return; }
      const meu = ++seq;
      S.busca.status = 'buscando'; if (sugBox()) sugBox().innerHTML = htmlSugestoes();
      try {
        const lista = await buscarRua(S.f.uf, S.f.cidade, nucleo);
        if (meu !== seq) return;
        S.busca.sug = lista; S.busca.status = lista.length ? '' : 'nada';
      } catch { if (meu !== seq) return; S.busca.sug = []; S.busca.status = 'offline'; }
      if (sugBox()) sugBox().innerHTML = htmlSugestoes();
    }

    /* ---------- eventos ---------- */
    box.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.id === 'end-q') { S.busca.txt = t.value; agendarBusca(); }
      if (t.id === 'end-bcid') { S.f.cidade = t.value.trim(); if (S.busca.txt) agendarBusca(); }
      if (t.id === 'end-bcep' || t.id === 'end-cep') {
        t.value = fmtCep(t.value);
        if (t.id === 'end-bcep') {
          S.busca.cep = t.value;
          const info = box.querySelector('#end-bcep-info');
          if (soDig(t.value).length === 8) {
            S.busca.cepStatus = 'buscando'; if (info) info.textContent = 'Buscando…';
            buscarCep(t.value).then((d) => {
              if (soDig(S.busca.cep) !== (d ? d.cep : soDig(t.value))) return;
              if (!d) { S.busca.cepStatus = 'invalido'; if (info) info.innerHTML = '<span class="end__erro">CEP não encontrado</span>'; return; }
              S.busca.cepStatus = ''; irDetalhes({ ...d, numero: '' });
            }).catch(() => { S.busca.cepStatus = ''; if (info) info.textContent = 'Sem conexão. Preencha manualmente.'; });
          }
        } else if (soDig(t.value).length === 8) {
          // CEP digitado nos detalhes completa só o que estiver vazio
          buscarCep(t.value).then((d) => { if (!d) return; lerForm(); const f = S.f; if (!f.logradouro) f.logradouro = d.logradouro; if (!f.bairro) f.bairro = d.bairro; f.cidade = d.cidade || f.cidade; f.uf = d.uf || f.uf; render(); }).catch(() => {});
        }
      }
      if (t.id === 'end-rfone') t.value = fmtFone(t.value);
      if (S.erros && t.closest('.field.is-error')) { t.closest('.field').classList.remove('is-error'); const m = t.closest('.field').querySelector('.end__erro'); if (m) m.remove(); }
    });
    box.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.id === 'end-buf') { S.f.uf = t.value; if (S.busca.txt) agendarBusca(); }
      if (t.id === 'end-sn') { lerForm(); S.f.semNumero = t.checked; if (t.checked) S.f.numero = ''; delete S.erros.numero; render(); if (!t.checked) focarPrimeiro('#end-num'); }
      if (t.name === 'end-sel') { S.selId = t.value; box.querySelectorAll('.end__item').forEach((l) => l.classList.toggle('is-sel', l.querySelector('input').value === t.value)); mudou(); }
    });
    box.addEventListener('keydown', (ev) => {
      if (ev.target.id === 'end-q' && ev.key === 'Enter') { ev.preventDefault(); clearTimeout(tBusca); executarBusca(); }
    });
    box.addEventListener('click', async (ev) => {
      const sug = ev.target.closest('[data-sug]');
      if (sug) { const s = S.busca.sug[+sug.dataset.sug]; const { numero } = separarNumero(S.busca.txt); irDetalhes({ ...s, numero }); return; }
      const tp = ev.target.closest('[data-tipo]'); if (tp) { lerForm(); S.f.tipoLocal = tp.dataset.tipo; delete S.erros.complemento; render(); return; }
      const ins = ev.target.closest('[data-instr]');
      if (ins) { lerForm(); const v = ins.dataset.instr, l = S.f.instrucoesRapidas; const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else l.push(v); render(); return; }
      const rc = ev.target.closest('[data-receb]'); if (rc) { lerForm(); S.f.recebedorOutro = rc.dataset.receb === 'outro'; render(); if (S.f.recebedorOutro) focarPrimeiro('#end-rnome'); return; }
      const ap = ev.target.closest('[data-apelido]'); if (ap) { lerForm(); S.f.apelido = ap.dataset.apelido; render(); if (!ap.dataset.apelido) focarPrimeiro('#end-apelido'); return; }
      const a = ev.target.closest('[data-end]'); if (!a) return;
      ev.preventDefault();
      const acao = a.dataset.end, id = a.dataset.id;
      if (acao === 'novo') abrirForm(null);
      if (acao === 'editar') abrirForm(S.salvos.find((e) => e.id === id));
      if (acao === 'cancelar') { S.modo = 'lista'; S.editando = ''; render(); mudou(); }
      if (acao === 'padrao') { S.salvos = S.salvos.map((e) => ({ ...e, padrao: e.id === id })); gravarSalvos(S.uid, S.salvos.filter((e) => !e._temporario)); render(); }
      if (acao === 'excluir') {
        const c = box.querySelector('[data-confirma]'); const e = S.salvos.find((x) => x.id === id);
        c.hidden = false; c.innerHTML = `<span>Excluir <b>${esc(e.apelido)}</b> (${esc(linha1(e))})?</span><button type="button" class="btn btn--soft btn--sm" data-end="nao-excluir">Manter</button><button type="button" class="btn btn--sm end__btnx" data-end="sim-excluir" data-id="${esc(id)}">Excluir</button>`;
      }
      if (acao === 'nao-excluir') { const c = box.querySelector('[data-confirma]'); c.hidden = true; }
      if (acao === 'sim-excluir') {
        const era = S.salvos.find((e) => e.id === id);
        S.salvos = S.salvos.filter((e) => e.id !== id);
        if (era && era.padrao && S.salvos[0]) S.salvos[0].padrao = true;
        gravarSalvos(S.uid, S.salvos.filter((e) => !e._temporario));
        if (S.selId === id) S.selId = S.salvos[0] ? S.salvos[0].id : '';
        if (!S.salvos.length) abrirForm(null); else render();
        mudou();
      }
      if (acao === 'manual') { const sp = separarNumero(S.busca.txt); irDetalhes(sp.rua ? { logradouro: sp.rua, numero: sp.numero } : {}); }
      if (acao === 'buscar-de-novo') { lerForm(); S.etapaForm = 'busca'; render(); focarPrimeiro('#end-q'); }
      if (acao === 'usar') confirmarForm();
      if (acao === 'local') {
        if (!navigator.geolocation) { a.querySelector('small').textContent = 'Seu navegador não permite localização.'; return; }
        const sm = a.querySelector('small'); sm.textContent = 'Localizando… aceite o pedido de localização';
        a.disabled = true;
        try { const d = await enderecoDaLocalizacao(); irDetalhes(d); }
        catch (e) { a.disabled = false; sm.textContent = e && e.code === 1 ? 'Localização negada. Digite o endereço acima.' : 'Não foi possível localizar. Digite o endereço acima.'; }
      }
    });

    render();
    return {
      /** Endereço escolhido ou null. */
      atual,
      /** Checa antes de avançar no checkout. Se o formulário estiver aberto, tenta confirmar. */
      validar() {
        if (S.modo === 'form') return confirmarForm();
        if (!atual()) { abrirForm(null); return false; }
        return true;
      },
      /** Troca de conta (outro login no mesmo navegador). */
      trocarUsuario(uid) { S.uid = uid || ''; S.salvos = lerSalvos(uid); const p = S.salvos.find((e) => e.padrao) || S.salvos[0]; S.selId = p ? p.id : ''; S.modo = S.salvos.length ? 'lista' : 'form'; S.etapaForm = 'busca'; render(); }
    };
  }

  window.LojaEndereco = { montar, formatar, formatarCompleto, linha1, linha2, mapsUrl, fmtCep, lerSalvos };
})();
