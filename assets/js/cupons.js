/* ==========================================================================
   LOJA — Cupons de desconto (só a regra; a tela fica no checkout em app.js)
   Cupons ficam em config.js → LOJA_CONFIG.cupons. Cada cupom:
     { codigo: 'BEMVINDO10', tipo: 'percentual' | 'valor' | 'frete', valor: 10,
       minimo: 0, validade: 'AAAA-MM-DD' (último dia que vale; vazio = sem prazo),
       primeiroPedido: false, ativo: true, descricao: 'texto curto' }
   - percentual: % sobre o subtotal (depois do desconto de atacado);
   - valor: R$ fixo (nunca maior que o subtotal);
   - frete: frete grátis.
   O desconto do Pix (5%) é calculado depois do cupom.
   ========================================================================== */
(function () {
  'use strict';
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const normalizar = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
  const lista = () => ((window.LOJA_CONFIG && window.LOJA_CONFIG.cupons) || []).filter((c) => c && c.codigo && c.ativo !== false);
  const r2 = (n) => Math.round(n * 100) / 100;

  /** Fim do dia da validade (horário local). */
  function fimDoDia(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999) : null;
  }

  /**
   * Confere um cupom para o pedido atual.
   * ctx: { base (subtotal já com desconto de atacado), frete, temPedidos (true/false/null = não sei), hoje (Date) }
   * Retorna { ok, cupom, desconto, freteGratis, motivo }.
   */
  function calcular(codigo, ctx) {
    const cod = normalizar(codigo);
    const nada = (motivo, cupom) => ({ ok: false, cupom: cupom || null, desconto: 0, freteGratis: false, motivo });
    if (!cod) return nada('Digite o código do cupom.');
    const cupom = lista().find((c) => normalizar(c.codigo) === cod);
    if (!cupom) return nada('Cupom não encontrado. Confira as letras e números.');
    const hoje = ctx.hoje || new Date();
    const fim = fimDoDia(cupom.validade);
    if (fim && hoje > fim) return nada(`Este cupom venceu em ${fim.toLocaleDateString('pt-BR')}.`, cupom);
    const base = Math.max(0, +ctx.base || 0);
    if (cupom.minimo && base < cupom.minimo) return nada(`Vale para pedidos a partir de ${brl(cupom.minimo)}. Faltam ${brl(cupom.minimo - base)}.`, cupom);
    // só no 1º pedido: precisa CONFIRMAR que a conta não tem pedidos (null = não deu para conferir → não libera)
    if (cupom.primeiroPedido && ctx.temPedidos !== false) return nada(ctx.temPedidos ? 'Este cupom vale só para o primeiro pedido da conta.' : 'Não deu para confirmar se este é o seu primeiro pedido. Tente aplicar de novo.', cupom);
    if (cupom.tipo === 'frete') {
      if (!(ctx.frete > 0)) return { ok: true, cupom, desconto: 0, freteGratis: true, motivo: 'O frete deste pedido já é grátis.' };
      return { ok: true, cupom, desconto: 0, freteGratis: true, motivo: '' };
    }
    const v = Math.max(0, +cupom.valor || 0);
    const desconto = cupom.tipo === 'valor' ? Math.min(v, base) : base * Math.min(v, 100) / 100;
    return { ok: true, cupom, desconto: r2(desconto), freteGratis: false, motivo: '' };
  }

  /** Texto curto do benefício, ex.: "10% de desconto", "R$ 20,00 de desconto", "Frete grátis". */
  function rotulo(cupom) {
    if (!cupom) return '';
    if (cupom.tipo === 'frete') return 'Frete grátis';
    return cupom.tipo === 'valor' ? `${brl(+cupom.valor || 0)} de desconto` : `${+cupom.valor || 0}% de desconto`;
  }

  window.LojaCupons = { calcular, rotulo, normalizar, temAtivos: () => lista().length > 0 };
})();
