// supabase/functions/whatsapp-bot/index.ts
// Deploy: supabase functions deploy whatsapp-bot --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!;
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!;
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'my-finance-hub';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Etapa =
  | 'aguardando_categoria'
  | 'aguardando_pagamento'
  | 'aguardando_conta'
  | 'aguardando_cartao'
  | 'aguardando_parcelamento'
  | 'aguardando_parcelas'
  | 'aguardando_confirmacao';

type Sessao = {
  etapa: Etapa;
  household_id: string;
  descricao: string;
  valor: number;
  data: string;
  numero_whatsapp?: string;
  nome_remetente?: string;
  categoria_id?: number;
  categoria_nome?: string;
  metodo?: string;
  conta?: string;
  cartao_id?: number;
  cartao_nome?: string;
  parcelas?: number;
  categorias: { id: number; nome: string }[];
  contas: string[];
  cartoes: { id: number; nome: string }[];
};

// ─── Sessões no Supabase ──────────────────────────────────────────────────────

async function getSessao(numero: string): Promise<Sessao | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('dados')
    .eq('numero', numero)
    .single();
  return data?.dados || null;
}

async function setSessao(numero: string, sessao: Sessao): Promise<void> {
  await supabase.from('whatsapp_sessions').upsert(
    { numero, dados: sessao, updated_at: new Date().toISOString() },
    { onConflict: 'numero' }
  );
}

async function deleteSessao(numero: string): Promise<void> {
  await supabase.from('whatsapp_sessions').delete().eq('numero', numero);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function hojeFormatado(): string {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function enviarWhatsApp(numero: string, mensagem: string): Promise<void> {
  try {
    await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: numero, text: mensagem }),
    });
  } catch (e) {
    console.error('Erro ao enviar WhatsApp:', e);
  }
}

// ─── Claude interpreta a despesa ─────────────────────────────────────────────

async function interpretarDespesa(texto: string): Promise<{ descricao: string; valor: number } | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `Você extrai despesas de mensagens em português brasileiro.
Responda APENAS com JSON válido: {"descricao": "string", "valor": number}
Se não for uma despesa com valor claro: {"erro": "nao_entendi"}
Regras:
- descricao = estabelecimento ou o que foi comprado (ex: "Giassi", "Conta de Luz", "Farmácia")
- valor = número decimal com ponto (ex: 45.90)
- Vírgula vira ponto decimal
Exemplos:
"gastei 45,90 no Giassi" → {"descricao":"Giassi","valor":45.90}
"paguei 120,50 de luz" → {"descricao":"Conta de Luz","valor":120.50}
"farmácia 38 reais" → {"descricao":"Farmácia","valor":38}
"oi tudo bem" → {"erro":"nao_entendi"}`,
      messages: [{ role: 'user', content: texto }],
    }),
  });
  const data = await res.json();
  try {
    const t = data.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}';
    const parsed = JSON.parse(t);
    if (parsed.erro || !parsed.valor || !parsed.descricao) return null;
    return { descricao: String(parsed.descricao), valor: Number(parsed.valor) };
  } catch { return null; }
}

// ─── Sugere categorias via Claude ────────────────────────────────────────────

async function sugerirCategorias(
  descricao: string,
  categorias: { id: number; nome: string }[]
): Promise<{ id: number; nome: string }[]> {
  const lista = categorias.map(c => c.nome).join(', ');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: `Dado uma despesa e lista de categorias, retorne as 3 mais adequadas.
Responda APENAS com JSON: {"sugestoes":["Cat1","Cat2","Cat3"]}
Use exatamente os nomes da lista.`,
      messages: [{ role: 'user', content: `Despesa: "${descricao}"\nCategorias: ${lista}` }],
    }),
  });
  const data = await res.json();
  try {
    const t = data.content?.[0]?.text?.replace(/```json|```/g, '').trim() || '{}';
    const parsed = JSON.parse(t);
    return (parsed.sugestoes || [])
      .map((nome: string) => categorias.find(c => c.nome === nome))
      .filter(Boolean)
      .slice(0, 3);
  } catch { return categorias.slice(0, 3); }
}

// ─── Buscar dados do household ────────────────────────────────────────────────

async function buscarHousehold(numero: string): Promise<string | null> {
  const numeroLimpo = numero.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  
  // Primeiro tenta encontrar pelo número exato
  const { data } = await supabase
    .from('notification_settings')
    .select('household_id')
    .eq('whatsapp_number', numeroLimpo)
    .eq('ativo', true)
    .single();
  
  if (data?.household_id) return data.household_id;

  // Se não encontrar, retorna o primeiro household ativo (permite que qualquer
  // número do mesmo grupo familiar use o bot)
  const { data: qualquer } = await supabase
    .from('notification_settings')
    .select('household_id')
    .eq('ativo', true)
    .single();
  
  return qualquer?.household_id || null;
}

async function buscarCategorias(householdId: string): Promise<{ id: number; nome: string }[]> {
  const { data } = await supabase
    .from('categorias')
    .select('id, nome')
    .eq('household_id', householdId)
    .order('nome');
  return data || [];
}

async function buscarContas(householdId: string): Promise<string[]> {
  const { data } = await supabase
    .from('contas')
    .select('nome')
    .eq('household_id', householdId)
    .eq('ativo', true)
    .eq('tipo', 'corrente')
    .order('nome');
  return (data || []).map(c => c.nome);
}

async function buscarCartoes(householdId: string): Promise<{ id: number; nome: string }[]> {
  const { data } = await supabase
    .from('cartoes')
    .select('id, nome')
    .eq('household_id', householdId)
    .eq('ativo', true)
    .order('nome');
  return data || [];
}

// ─── Salvar rascunho em cupons_pendentes ─────────────────────────────────────

async function salvarDespesa(householdId: string, s: Sessao): Promise<boolean> {
  const { error } = await supabase.from('cupons_pendentes').insert({
    household_id: householdId,
    origem: 'whatsapp',
    numero_whatsapp: s.numero_whatsapp || '',
    nome_remetente: s.nome_remetente || '',
    estabelecimento: s.descricao,
    valor_total: s.valor,
    data_compra: s.data,
    categoria_id: s.categoria_id || null,
    categoria_sugerida: s.categoria_nome || null,
    metodo_pagamento: s.metodo || '',
    conta_origem_destino: s.conta || null,
    cartao_id: s.cartao_id || null,
    cartao_nome: s.cartao_nome || null,
    parcelas: s.parcelas || 1,
    situacao: 'pendente',
  });
  return !error;
}

// ─── Monta resumo da despesa ──────────────────────────────────────────────────

function montaResumo(s: Sessao): string {
  const parcelas = s.parcelas || 1;
  const valorParcela = formatMoney(s.valor / parcelas);
  const parcelaInfo = parcelas > 1 ? ` (${parcelas}x ${valorParcela})` : '';
  const pagamento = s.metodo === 'Crédito'
    ? `💳 Crédito — ${s.cartao_nome}${parcelaInfo}`
    : `${s.metodo === 'PIX' ? '⚡' : '🏦'} ${s.metodo} — ${s.conta}`;

  return `📋 *Resumo da despesa:*\n` +
    `📦 ${s.descricao} — *${formatMoney(s.valor)}*\n` +
    `🏷️ ${s.categoria_nome}\n` +
    `${pagamento}\n` +
    `📅 ${hojeFormatado()}\n\n` +
    `Confirma? Digite *sim* ou *não*`;
}

// ─── Processar mensagem ───────────────────────────────────────────────────────

async function processarMensagem(numero: string, texto: string): Promise<void> {
  const textoLimpo = texto.trim().toLowerCase();

  // Cancelar a qualquer momento
  if (['cancelar', 'cancel', 'sair', 'parar'].includes(textoLimpo)) {
    await deleteSessao(numero);
    await enviarWhatsApp(numero, '❌ Lançamento cancelado. Quando quiser lançar uma despesa, é só me contar!');
    return;
  }

  const sessao = await getSessao(numero);

  // ── Sem sessão ativa: tenta interpretar como nova despesa ──────────────────
  if (!sessao) {
    const householdId = await buscarHousehold(numero);
    if (!householdId) {
      await enviarWhatsApp(numero,
        '⚠️ Seu número não está cadastrado no my-finance-hub.\n' +
        'Acesse o app e configure as notificações WhatsApp com seu número.'
      );
      return;
    }

    const despesa = await interpretarDespesa(texto);
    if (!despesa) {
      await enviarWhatsApp(numero,
        '🤔 Não entendi. Me informe uma despesa como:\n' +
        '_"gastei 45,90 no Giassi"_\n' +
        '_"farmácia 38 reais"_\n' +
        '_"conta de luz 120,50"_'
      );
      return;
    }

    // Busca dados necessários
    const [categorias, contas, cartoes] = await Promise.all([
      buscarCategorias(householdId),
      buscarContas(householdId),
      buscarCartoes(householdId),
    ]);

    // Sugere categorias
    const sugeridas = await sugerirCategorias(despesa.descricao, categorias);
    const outras = categorias.filter(c => !sugeridas.find(s => s.id === c.id)).slice(0, 2);
    const todasSugeridas = [...sugeridas, ...outras].slice(0, 5);

    const listaCats = todasSugeridas.map((c, i) => `${i + 1}️⃣ ${c.nome}`).join('\n');

    const pushName = body?.data?.pushName || '';
    const novaSessao: Sessao = {
      etapa: 'aguardando_categoria',
      household_id: householdId,
      descricao: despesa.descricao,
      valor: despesa.valor,
      data: hojeISO(),
      numero_whatsapp: numero,
      nome_remetente: pushName,
      categorias: todasSugeridas,
      contas,
      cartoes,
    };

    await setSessao(numero, novaSessao);
    await enviarWhatsApp(numero,
      `🛒 *${despesa.descricao}* — *${formatMoney(despesa.valor)}*\n\n` +
      `Qual a categoria?\n${listaCats}\n\n` +
      `_(ou digite o nome da categoria)_`
    );
    return;
  }

  // ── Com sessão ativa: processa conforme a etapa ────────────────────────────

  switch (sessao.etapa) {

    // ── Categoria ──────────────────────────────────────────────────────────────
    case 'aguardando_categoria': {
      let cat: { id: number; nome: string } | undefined;

      const num = parseInt(textoLimpo);
      if (!isNaN(num) && num >= 1 && num <= sessao.categorias.length) {
        cat = sessao.categorias[num - 1];
      } else {
        // Busca pelo nome digitado
        const todasCats = await buscarCategorias(sessao.household_id);
        cat = todasCats.find(c => c.nome.toLowerCase().includes(textoLimpo));
      }

      if (!cat) {
        const listaCats = sessao.categorias.map((c, i) => `${i + 1}️⃣ ${c.nome}`).join('\n');
        await enviarWhatsApp(numero,
          `❓ Não encontrei essa categoria. Escolha uma opção:\n${listaCats}\n\n_(ou digite o nome)_`
        );
        return;
      }

      const novoEstado: Sessao = { ...sessao, etapa: 'aguardando_pagamento', categoria_id: cat.id, categoria_nome: cat.nome };
      await setSessao(numero, novoEstado);
      await enviarWhatsApp(numero,
        `✅ Categoria: *${cat.nome}*\n\n` +
        `Forma de pagamento?\n` +
        `1️⃣ PIX\n2️⃣ Débito\n3️⃣ Crédito`
      );
      break;
    }

    // ── Pagamento ──────────────────────────────────────────────────────────────
    case 'aguardando_pagamento': {
      const opcoes: Record<string, string> = { '1': 'PIX', '2': 'Débito', '3': 'Crédito', 'pix': 'PIX', 'debito': 'Débito', 'débito': 'Débito', 'credito': 'Crédito', 'crédito': 'Crédito' };
      const metodo = opcoes[textoLimpo];

      if (!metodo) {
        await enviarWhatsApp(numero, '❓ Escolha:\n1️⃣ PIX\n2️⃣ Débito\n3️⃣ Crédito');
        return;
      }

      if (metodo === 'Crédito') {
        if (sessao.cartoes.length === 0) {
          await enviarWhatsApp(numero, '⚠️ Nenhum cartão ativo cadastrado. Escolha PIX ou Débito.\n1️⃣ PIX\n2️⃣ Débito');
          return;
        }
        const listaCartoes = sessao.cartoes.map((c, i) => `${i + 1}️⃣ ${c.nome}`).join('\n');
        await setSessao(numero, { ...sessao, etapa: 'aguardando_cartao', metodo });
        await enviarWhatsApp(numero, `💳 Qual cartão?\n${listaCartoes}`);
      } else {
        if (sessao.contas.length === 0) {
          await enviarWhatsApp(numero, '⚠️ Nenhuma conta ativa cadastrada.');
          return;
        }
        const listaContas = sessao.contas.map((c, i) => `${i + 1}️⃣ ${c}`).join('\n');
        await setSessao(numero, { ...sessao, etapa: 'aguardando_conta', metodo });
        await enviarWhatsApp(numero, `🏦 Qual conta?\n${listaContas}`);
      }
      break;
    }

    // ── Conta (PIX/Débito) ─────────────────────────────────────────────────────
    case 'aguardando_conta': {
      let conta: string | undefined;

      const num = parseInt(textoLimpo);
      if (!isNaN(num) && num >= 1 && num <= sessao.contas.length) {
        conta = sessao.contas[num - 1];
      } else {
        conta = sessao.contas.find(c => c.toLowerCase().includes(textoLimpo));
      }

      if (!conta) {
        const listaContas = sessao.contas.map((c, i) => `${i + 1}️⃣ ${c}`).join('\n');
        await enviarWhatsApp(numero, `❓ Conta não encontrada. Escolha:\n${listaContas}`);
        return;
      }

      const novoEstado: Sessao = { ...sessao, etapa: 'aguardando_confirmacao', conta };
      await setSessao(numero, novoEstado);
      await enviarWhatsApp(numero, montaResumo(novoEstado));
      break;
    }

    // ── Cartão (Crédito) ───────────────────────────────────────────────────────
    case 'aguardando_cartao': {
      let cartao: { id: number; nome: string } | undefined;

      const num = parseInt(textoLimpo);
      if (!isNaN(num) && num >= 1 && num <= sessao.cartoes.length) {
        cartao = sessao.cartoes[num - 1];
      } else {
        cartao = sessao.cartoes.find(c => c.nome.toLowerCase().includes(textoLimpo));
      }

      if (!cartao) {
        const listaCartoes = sessao.cartoes.map((c, i) => `${i + 1}️⃣ ${c.nome}`).join('\n');
        await enviarWhatsApp(numero, `❓ Cartão não encontrado. Escolha:\n${listaCartoes}`);
        return;
      }

      const novoEstado: Sessao = { ...sessao, etapa: 'aguardando_parcelamento', cartao_id: cartao.id, cartao_nome: cartao.nome };
      await setSessao(numero, novoEstado);
      await enviarWhatsApp(numero,
        `💳 Cartão: *${cartao.nome}*\n\n` +
        `À vista ou parcelado?\n` +
        `1️⃣ À vista\n2️⃣ Parcelado`
      );
      break;
    }

    // ── Parcelamento ───────────────────────────────────────────────────────────
    case 'aguardando_parcelamento': {
      const opcoes: Record<string, boolean> = { '1': false, 'a vista': false, 'à vista': false, '2': true, 'parcelado': true };
      const isParcelado = opcoes[textoLimpo];

      if (isParcelado === undefined) {
        await enviarWhatsApp(numero, '❓ Escolha:\n1️⃣ À vista\n2️⃣ Parcelado');
        return;
      }

      if (isParcelado) {
        await setSessao(numero, { ...sessao, etapa: 'aguardando_parcelas' });
        await enviarWhatsApp(numero, '🔢 Quantas parcelas?');
      } else {
        const novoEstado: Sessao = { ...sessao, etapa: 'aguardando_confirmacao', parcelas: 1 };
        await setSessao(numero, novoEstado);
        await enviarWhatsApp(numero, montaResumo(novoEstado));
      }
      break;
    }

    // ── Quantidade de parcelas ─────────────────────────────────────────────────
    case 'aguardando_parcelas': {
      const qtd = parseInt(textoLimpo);
      if (isNaN(qtd) || qtd < 2 || qtd > 48) {
        await enviarWhatsApp(numero, '❓ Informe um número de parcelas válido (entre 2 e 48).');
        return;
      }

      const novoEstado: Sessao = { ...sessao, etapa: 'aguardando_confirmacao', parcelas: qtd };
      await setSessao(numero, novoEstado);
      await enviarWhatsApp(numero, montaResumo(novoEstado));
      break;
    }

    // ── Confirmação final ──────────────────────────────────────────────────────
    case 'aguardando_confirmacao': {
      if (['sim', 's', 'yes', '👍'].includes(textoLimpo)) {
        const ok = await salvarDespesa(sessao.household_id, sessao);
        await deleteSessao(numero);

        if (ok) {
          const parcelas = sessao.parcelas || 1;
          const emoji = sessao.metodo === 'Crédito' ? '💳' : sessao.metodo === 'PIX' ? '⚡' : '🏦';
          await enviarWhatsApp(numero,
            `✅ *Rascunho salvo!*\n\n` +
            `📦 ${sessao.descricao} — *${formatMoney(sessao.valor)}*\n` +
            `🏷️ ${sessao.categoria_nome}\n` +
            `${emoji} ${sessao.metodo}${sessao.cartao_nome ? ` — ${sessao.cartao_nome}` : sessao.conta ? ` — ${sessao.conta}` : ''}\n` +
            `${parcelas > 1 ? `📊 ${parcelas}x ${formatMoney(sessao.valor / parcelas)}\n` : ''}` +
            `📅 ${hojeFormatado()}\n\n` +
            `⏳ _Aguardando confirmação no app my-finance-hub_ 🚀`
          );
        } else {
          await enviarWhatsApp(numero, '❌ Erro ao salvar. Tente novamente.');
        }
      } else if (['não', 'nao', 'n', 'no'].includes(textoLimpo)) {
        await deleteSessao(numero);
        await enviarWhatsApp(numero, '❌ Cancelado! Quando quiser lançar, é só me contar.');
      } else {
        await enviarWhatsApp(numero, '❓ Digite *sim* para confirmar ou *não* para cancelar.');
      }
      break;
    }
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const rawText = await req.text();
    console.log('Raw body:', rawText.substring(0, 800));
    
    if (!rawText || rawText.trim() === '') {
      return new Response('ok', { status: 200 });
    }
    
    const body = JSON.parse(rawText);
    console.log('Webhook recebido:', JSON.stringify(body).substring(0, 500));

    // Evolution API v2
    const evento = body?.event || body?.type || '';
    const isUpsert = evento === 'messages.upsert' || evento === 'MESSAGES_UPSERT' || evento === 'message';
    
    if (!isUpsert) {
      console.log('Evento ignorado:', evento);
      return new Response('ok', { status: 200 });
    }

    const mensagem = body?.data || body?.message || body;
    const msg = mensagem?.message || mensagem?.messages?.[0]?.message;
    const key = mensagem?.key || mensagem?.messages?.[0]?.key;

    const numero = (key?.remoteJid || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const texto = (msg?.conversation || msg?.extendedTextMessage?.text || mensagem?.text || '').trim();

    console.log('Numero:', numero, '| Texto:', texto);

    if (!numero || !texto) {
      return new Response('ok', { status: 200 });
    }

    const textoLower = texto.toLowerCase();

    // Só processa se começar com !gasto OU se já tiver sessão ativa
    const sessaoAtiva = await getSessao(numero);
    const temComando = textoLower.startsWith('!gasto');

    if (!temComando && !sessaoAtiva) {
      console.log('Sem comando !gasto e sem sessão ativa, ignorando');
      return new Response('ok', { status: 200 });
    }

    // Se tem comando !gasto, extrai o texto após o comando
    let textoFinal = texto;
    if (temComando) {
      textoFinal = texto.substring(6).trim(); // remove "!gasto"
      if (!textoFinal) {
        await enviarWhatsApp(numero,
          '💰 *my-finance-hub Bot*

' +
          'Como usar:
' +
          '_!gasto [valor] [descrição]_

' +
          'Exemplos:
' +
          '• !gasto 45,90 Giassi
' +
          '• !gasto 120 farmácia
' +
          '• !gasto 38,50 padaria

' +
          '_Digite cancelar a qualquer momento para desistir._'
        );
        return new Response('ok', { status: 200 });
      }
    }

    // Processa em background
    processarMensagem(numero, textoFinal).catch(e => console.error('Erro ao processar:', e));

    return new Response(JSON.stringify({ ok: true }), {
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
