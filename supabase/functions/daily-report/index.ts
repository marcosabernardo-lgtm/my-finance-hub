// supabase/functions/daily-report/index.ts
// Deploy: supabase functions deploy daily-report --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!; // ex: https://evolution.railway.app
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!;
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'my-finance-hub';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function today(): string {
  // Data atual no fuso de Brasília
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function nowBrasilia(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ─── Busca saldos das contas ─────────────────────────────────────────────────

async function getSaldos(householdId: string) {
  // Busca contas ativas
  const { data: contas } = await supabase
    .from('contas')
    .select('id, nome, saldo_inicial, data_inicial, tipo')
    .eq('household_id', householdId)
    .eq('ativo', true);

  if (!contas || contas.length === 0) return [];

  // Mesma lógica do Dashboard: só movimentações Pagas, por conta_origem_destino = conta.nome
  const { data: todasMovs } = await supabase
    .from('movimentacoes')
    .select('conta_origem_destino, tipo, valor')
    .eq('household_id', householdId)
    .eq('situacao', 'Pago');

  const movs = todasMovs || [];
  const result = [];

  for (const conta of contas) {
    let saldo = Number(conta.saldo_inicial) || 0;

    for (const m of movs) {
      if (m.conta_origem_destino !== conta.nome) continue;
      if (m.tipo === 'Receita') saldo += Number(m.valor);
      else if (m.tipo === 'Despesa') saldo -= Number(m.valor);
      else if (m.tipo === 'Transferência') saldo -= Number(m.valor);
    }

    result.push({ nome: conta.nome, saldo, tipo: conta.tipo });
  }

  return result;
}

// ─── Busca alertas ───────────────────────────────────────────────────────────

async function getAlertas(householdId: string) {
  const hoje = nowBrasilia();
  const hojeISO = toISO(hoje);
  const em5Dias = toISO(addDays(hoje, 5));

  // Busca cartões para lookup nome + vencimento
  const { data: cartoes } = await supabase
    .from('cartoes')
    .select('id, nome, data_vencimento')
    .eq('household_id', householdId);
  const mapaCartoes: Record<number, { nome: string; vencimento: number }> = {};
  for (const c of cartoes || []) {
    mapaCartoes[c.id] = { nome: c.nome, vencimento: c.data_vencimento };
  }

  // Vencidos (Pendente + data_pagamento < hoje)
  const { data: vencidos } = await supabase
    .from('movimentacoes')
    .select('descricao, valor, data_pagamento, metodo_pagamento, cartao_id')
    .eq('household_id', householdId)
    .eq('situacao', 'Pendente')
    .eq('tipo', 'Despesa')
    .lt('data_pagamento', hojeISO)
    .order('data_pagamento', { ascending: true })
    .limit(20);

  // Próximos 5 dias
  const { data: proximos } = await supabase
    .from('movimentacoes')
    .select('descricao, valor, data_pagamento, metodo_pagamento, cartao_id')
    .eq('household_id', householdId)
    .eq('situacao', 'Pendente')
    .eq('tipo', 'Despesa')
    .gte('data_pagamento', hojeISO)
    .lte('data_pagamento', em5Dias)
    .order('data_pagamento', { ascending: true })
    .limit(20);

  // Limites estourados
  const mesAtual = hojeISO.substring(0, 7); // YYYY-MM
  const { data: categorias } = await supabase
    .from('categorias')
    .select('id, nome, limite_mensal')
    .eq('household_id', householdId)
    .not('limite_mensal', 'is', null)
    .gt('limite_mensal', 0);

  const limitesEstourados = [];

  if (categorias) {
    for (const cat of categorias) {
      const { data: gastos } = await supabase
        .from('movimentacoes')
        .select('valor')
        .eq('household_id', householdId)
        .eq('categoria_id', cat.id)
        .eq('tipo', 'Despesa')
        .gte('data_movimentacao', `${mesAtual}-01`)
        .lte('data_movimentacao', `${mesAtual}-31`);

      const total = gastos?.reduce((s, m) => s + m.valor, 0) ?? 0;
      if (total > cat.limite_mensal) {
        limitesEstourados.push({ nome: cat.nome, gasto: total, limite: cat.limite_mensal });
      }
    }
  }

  return { vencidos: vencidos ?? [], proximos: proximos ?? [], limitesEstourados, mapaCartoes };
}

// ─── Monta mensagem WhatsApp ─────────────────────────────────────────────────

function montaMensagem(saldos: any[], alertas: any): string {
  const linhas: string[] = [];

  linhas.push(`📊 *Resumo Financeiro - ${today()}*`);
  linhas.push('');

  // ── Saldos ──
  linhas.push('💰 *Saldos das Contas*');
  if (saldos.length === 0) {
    linhas.push('Nenhuma conta cadastrada.');
  } else {
    const correntes = saldos.filter(s => s.tipo === 'corrente');
    const investimentos = saldos.filter(s => s.tipo === 'investimento');

    if (correntes.length > 0) {
      linhas.push('_Contas Correntes:_');
      let totalCorrente = 0;
      for (const c of correntes) {
        const emoji = c.saldo >= 0 ? '🟢' : '🔴';
        linhas.push(`${emoji} ${c.nome}: *${formatMoney(c.saldo)}*`);
        totalCorrente += c.saldo;
      }
      linhas.push(`*Subtotal: ${formatMoney(totalCorrente)}*`);
    }

    if (investimentos.length > 0) {
      linhas.push('');
      linhas.push('_Investimentos:_');
      let totalInvest = 0;
      for (const c of investimentos) {
        const emoji = c.saldo >= 0 ? '📈' : '🔴';
        linhas.push(`${emoji} ${c.nome}: *${formatMoney(c.saldo)}*`);
        totalInvest += c.saldo;
      }
      linhas.push(`*Subtotal: ${formatMoney(totalInvest)}*`);
    }

    const totalGeral = saldos.reduce((s, c) => s + c.saldo, 0);
    linhas.push('');
    linhas.push(`💼 *Total Geral: ${formatMoney(totalGeral)}*`);
  }

  linhas.push('');

  // ── Helpers de alertas ──
  const { mapaCartoes } = alertas;

  const agruparCartoes = (lista: any[]) => {
    const grupos: Record<string, { nome: string; vencimento: number; total: number; data_pagamento: string }> = {};
    for (const i of lista) {
      if (!i.cartao_id) continue;
      const info = mapaCartoes[i.cartao_id] || { nome: 'Cartão', vencimento: 0 };
      const key = String(i.cartao_id);
      if (!grupos[key]) grupos[key] = { nome: info.nome, vencimento: info.vencimento, total: 0, data_pagamento: i.data_pagamento };
      grupos[key].total += Number(i.valor);
    }
    return Object.values(grupos);
  };

  // Vencidos
  if (alertas.vencidos.length > 0) {
    const pixDebito = alertas.vencidos.filter((i: any) => !i.cartao_id);
    const cartoesAgrup = agruparCartoes(alertas.vencidos);
    linhas.push(`🔴 *Vencidos (${alertas.vencidos.length})*`);
    if (pixDebito.length > 0) {
      linhas.push('_PIX / Débito:_');
      for (const v of pixDebito) {
        const data = new Date(v.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR');
        linhas.push(`• ${data} - ${v.descricao} - ${formatMoney(v.valor)}`);
      }
    }
    if (cartoesAgrup.length > 0) {
      linhas.push('_Cartões:_');
      for (const c of cartoesAgrup) {
        const data = new Date(c.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR');
        linhas.push(`• ${data} - ${c.nome} - ${formatMoney(c.total)}`);
      }
      if (cartoesAgrup.length > 1) {
        const totalCartoes = cartoesAgrup.reduce((s, c) => s + c.total, 0);
        linhas.push(`*Total Cartões: ${formatMoney(totalCartoes)}*`);
      }
    }
    linhas.push('');
  }

  // Próximos 5 dias
  if (alertas.proximos.length > 0) {
    const pixDebito = alertas.proximos.filter((i: any) => !i.cartao_id);
    const cartoesAgrup = agruparCartoes(alertas.proximos);
    linhas.push(`⚠️ *Vencem nos próximos 5 dias (${alertas.proximos.length})*`);
    if (pixDebito.length > 0) {
      linhas.push('_PIX / Débito:_');
      for (const p of pixDebito) {
        const data = new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR');
        linhas.push(`• ${data} - ${p.descricao} - ${formatMoney(p.valor)}`);
      }
    }
    if (cartoesAgrup.length > 0) {
      linhas.push('_Cartões:_');
      for (const c of cartoesAgrup) {
        const data = new Date(c.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR');
        linhas.push(`• ${data} - ${c.nome} - ${formatMoney(c.total)}`);
      }
      if (cartoesAgrup.length > 1) {
        const totalCartoes = cartoesAgrup.reduce((s, c) => s + c.total, 0);
        linhas.push(`*Total Cartões: ${formatMoney(totalCartoes)}*`);
      }
    }
    linhas.push('');
  }

  // Limites estourados
  if (alertas.limitesEstourados.length > 0) {
    linhas.push(`🚨 *Limites Estourados*`);
    for (const l of alertas.limitesEstourados) {
      const pct = Math.round((l.gasto / l.limite) * 100);
      linhas.push(`• ${l.nome}: ${formatMoney(l.gasto)} / ${formatMoney(l.limite)} (${pct}%)`);
    }
    linhas.push('');
  }

  if (alertas.vencidos.length === 0 && alertas.proximos.length === 0 && alertas.limitesEstourados.length === 0) {
    linhas.push('✅ *Nenhum alerta no momento!*');
    linhas.push('');
  }

  linhas.push('_Enviado automaticamente pelo my-finance-hub_ 🚀');

  return linhas.join('\n');
}

// ─── Envia WhatsApp via Evolution API ────────────────────────────────────────

async function enviarWhatsApp(numero: string, mensagem: string): Promise<boolean> {
  try {
    const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: numero,
        text: mensagem,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Erro ao enviar para ${numero}:`, err);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Exceção ao enviar para ${numero}:`, e);
    return false;
  }
}

// ─── Handler principal ───────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  try {
    // Busca todos os households com notificação ativa
    const { data: configs, error } = await supabase
      .from('notification_settings')
      .select('household_id, whatsapp_number')
      .eq('ativo', true);

    if (error) throw error;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma notificação configurada.' }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const resultados = [];

    for (const config of configs) {
      try {
        const [saldos, alertas] = await Promise.all([
          getSaldos(config.household_id),
          getAlertas(config.household_id),
        ]);

        const mensagem = montaMensagem(saldos, alertas);
        const enviado = await enviarWhatsApp(config.whatsapp_number, mensagem);

        resultados.push({
          household_id: config.household_id,
          numero: config.whatsapp_number,
          enviado,
        });
      } catch (e) {
        console.error(`Erro no household ${config.household_id}:`, e);
        resultados.push({ household_id: config.household_id, erro: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, resultados }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erro geral:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
