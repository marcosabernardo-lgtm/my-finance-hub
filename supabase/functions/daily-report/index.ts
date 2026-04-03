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

  const result = [];

  for (const conta of contas) {
    // Soma movimentações que afetam o saldo
    const { data: movs } = await supabase
      .from('movimentacoes')
      .select('tipo, valor, metodo_pagamento, conta_origem_destino, situacao')
      .eq('household_id', householdId)
      .gte('data_movimentacao', conta.data_inicial)
      .or(`conta_origem_destino.eq.${conta.id},and(metodo_pagamento.neq.Crédito,cartao_id.is.null)`);

    let saldo = conta.saldo_inicial ?? 0;

    if (movs) {
      for (const mov of movs) {
        if (mov.situacao === 'Cancelado') continue;

        const isTransferencia = mov.metodo_pagamento === 'Transferência entre Contas';

        if (isTransferencia) {
          if (mov.conta_origem_destino === conta.id) {
            // Conta destino: soma
            saldo += mov.valor;
          }
          // Conta origem já é deduzida pelo tipo Despesa abaixo
        } else {
          if (mov.tipo === 'Receita') saldo += mov.valor;
          if (mov.tipo === 'Despesa') saldo -= mov.valor;
        }
      }
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

  // Vencidos (Pendente + data_pagamento < hoje)
  const { data: vencidos } = await supabase
    .from('movimentacoes')
    .select('descricao, valor, data_pagamento, metodo_pagamento')
    .eq('household_id', householdId)
    .eq('situacao', 'Pendente')
    .eq('tipo', 'Despesa')
    .lt('data_pagamento', hojeISO)
    .order('data_pagamento', { ascending: true })
    .limit(5);

  // Próximos 5 dias
  const { data: proximos } = await supabase
    .from('movimentacoes')
    .select('descricao, valor, data_pagamento, metodo_pagamento')
    .eq('household_id', householdId)
    .eq('situacao', 'Pendente')
    .eq('tipo', 'Despesa')
    .gte('data_pagamento', hojeISO)
    .lte('data_pagamento', em5Dias)
    .order('data_pagamento', { ascending: true })
    .limit(5);

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

  return { vencidos: vencidos ?? [], proximos: proximos ?? [], limitesEstourados };
}

// ─── Monta mensagem WhatsApp ─────────────────────────────────────────────────

function montaMensagem(saldos: any[], alertas: any): string {
  const linhas: string[] = [];

  linhas.push(`📊 *Resumo Financeiro - ${today()}*`);
  linhas.push('');

  // Saldos
  linhas.push('💰 *Saldos das Contas*');
  if (saldos.length === 0) {
    linhas.push('Nenhuma conta cadastrada.');
  } else {
    const correntes = saldos.filter(s => s.tipo === 'corrente');
    const investimentos = saldos.filter(s => s.tipo === 'investimento');

    if (correntes.length > 0) {
      linhas.push('_Contas Correntes:_');
      for (const c of correntes) {
        const emoji = c.saldo >= 0 ? '🟢' : '🔴';
        linhas.push(`${emoji} ${c.nome}: *${formatMoney(c.saldo)}*`);
      }
    }
    if (investimentos.length > 0) {
      linhas.push('_Investimentos:_');
      for (const c of investimentos) {
        linhas.push(`📈 ${c.nome}: *${formatMoney(c.saldo)}*`);
      }
    }
  }

  linhas.push('');

  // Vencidos
  if (alertas.vencidos.length > 0) {
    linhas.push(`🔴 *Vencidos (${alertas.vencidos.length})*`);
    for (const v of alertas.vencidos) {
      const data = new Date(v.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR');
      linhas.push(`• ${v.descricao} — ${formatMoney(v.valor)} (${data})`);
    }
    linhas.push('');
  }

  // Próximos 5 dias
  if (alertas.proximos.length > 0) {
    linhas.push(`⚠️ *Vencem nos próximos 5 dias (${alertas.proximos.length})*`);
    for (const p of alertas.proximos) {
      const data = new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR');
      linhas.push(`• ${p.descricao} — ${formatMoney(p.valor)} (${data})`);
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
        textMessage: { text: mensagem },
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

Deno.serve(async (_req) => {
  try {
    // Busca todos os households com notificação ativa
    const { data: configs, error } = await supabase
      .from('notification_settings')
      .select('household_id, whatsapp_number')
      .eq('ativo', true);

    if (error) throw error;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma notificação configurada.' }), { status: 200 });
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
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erro geral:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});