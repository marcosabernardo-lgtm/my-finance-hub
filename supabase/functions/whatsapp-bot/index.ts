// supabase/functions/whatsapp-bot/index.ts
// Deploy: supabase functions deploy whatsapp-bot --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!;
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!;
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'my-finance-hub';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function getSessao(numero: string): Promise<Sessao | null> {
  const { data } = await supabase.from('whatsapp_sessions').select('dados').eq('numero', numero).single();
  return data?.dados || null;
}

async function setSessao(numero: string, sessao: Sessao): Promise<void> {
  await supabase.from('whatsapp_sessions').upsert({ numero, dados: sessao, updated_at: new Date().toISOString() }, { onConflict: 'numero' });
}

async function deleteSessao(numero: string): Promise<void> {
  await supabase.from('whatsapp_sessions').delete().eq('numero', numero);
}

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
  } catch (e) { console.error('Erro envio:', e); }
}

function interpretarDespesa(texto: string): { descricao: string; valor: number } | null {
  let t = texto.replace(/\s+reais\s*$/i, '').replace(/r\$\s*/gi, '').trim();
  let valor = 0, descricao = '';

  const m1 = t.match(/^(\d+(?:[.,]\d{1,2})?)\s+(?:no|na|de|do|da|em|pelo|pela|num|numa)\s+(.+)$/i);
  const m2 = t.match(/^(\d+(?:[.,]\d{1,2})?)\s+(.+)$/);
  const m3 = t.match(/^(.+?)\s+(?:de|por)\s+(\d+(?:[.,]\d{1,2})?)$/i);
  const m4 = t.match(/^(.+?)\s+(\d+(?:[.,]\d{1,2})?)$/);

  if (m1) { valor = parseFloat(m1[1].replace(',', '.')); descricao = m1[2].trim(); }
  else if (m3) { descricao = m3[1].trim(); valor = parseFloat(m3[2].replace(',', '.')); }
  else if (m2) { valor = parseFloat(m2[1].replace(',', '.')); descricao = m2[2].trim(); }
  else if (m4) { descricao = m4[1].trim(); valor = parseFloat(m4[2].replace(',', '.')); }

  if (!valor || valor <= 0 || !descricao) return null;
  descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);
  return { descricao, valor };
}

function sugerirCategorias(descricao: string, categorias: { id: number; nome: string }[]): { id: number; nome: string }[] {
  const d = descricao.toLowerCase();
  const keywords: Record<string, string[]> = {
    'alimenta': ['mercado', 'supermercado', 'giassi', 'bistek', 'angeloni', 'restaurante', 'lanche', 'pizza', 'hamburguer', 'padaria', 'ifood', 'rappi'],
    'saude': ['farmacia', 'drogaria', 'medico', 'hospital', 'remedio', 'exame', 'consulta', 'dentista'],
    'transporte': ['uber', 'gasolina', 'combustivel', 'estacionamento', 'onibus', 'taxi', 'posto'],
    'educa': ['escola', 'faculdade', 'curso', 'livro'],
    'lazer': ['cinema', 'netflix', 'spotify', 'show', 'ingresso', 'bar'],
    'conta': ['luz', 'agua', 'internet', 'telefone', 'energia', 'gas', 'condominio', 'aluguel'],
    'vestuario': ['roupa', 'sapato', 'tenis', 'calcado', 'renner', 'riachuelo'],
  };
  const porNome = categorias.filter(c => d.includes(c.nome.toLowerCase()) || c.nome.toLowerCase().includes(d));
  if (porNome.length > 0) return porNome.slice(0, 5);
  for (const [catKey, words] of Object.entries(keywords)) {
    if (words.some(w => d.includes(w))) {
      const cat = categorias.find(c => c.nome.toLowerCase().includes(catKey));
      if (cat) return [cat, ...categorias.filter(c => c.id !== cat.id).slice(0, 4)];
    }
  }
  return categorias.slice(0, 5);
}

async function buscarHousehold(numero: string): Promise<string | null> {
  const n = numero.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  const { data } = await supabase.from('notification_settings').select('household_id').eq('whatsapp_number', n).eq('ativo', true).single();
  if (data?.household_id) return data.household_id;
  const { data: q } = await supabase.from('notification_settings').select('household_id').eq('ativo', true).single();
  return q?.household_id || null;
}

async function buscarCategorias(hid: string) {
  const { data } = await supabase.from('categorias').select('id, nome').eq('household_id', hid).eq('tipo', 'Despesa').order('nome');
  return data || [];
}

async function buscarContas(hid: string): Promise<string[]> {
  const { data } = await supabase.from('contas').select('nome').eq('household_id', hid).eq('ativo', true).eq('tipo', 'corrente').order('nome');
  return (data || []).map((c: any) => c.nome);
}

async function buscarCartoes(hid: string) {
  const { data } = await supabase.from('cartoes').select('id, nome').eq('household_id', hid).eq('ativo', true).order('nome');
  return data || [];
}

async function salvarDespesa(hid: string, s: Sessao): Promise<boolean> {
  const { error } = await supabase.from('cupons_pendentes').insert({
    household_id: hid, origem: 'whatsapp',
    numero_whatsapp: s.numero_whatsapp || '', nome_remetente: s.nome_remetente || '',
    estabelecimento: s.descricao, valor_total: s.valor, data_compra: s.data,
    categoria_id: s.categoria_id || null, categoria_sugerida: s.categoria_nome || null,
    metodo_pagamento: s.metodo || '', conta_origem_destino: s.conta || null,
    cartao_id: s.cartao_id || null, cartao_nome: s.cartao_nome || null,
    parcelas: s.parcelas || 1, situacao: 'pendente',
  });
  return !error;
}

function montaResumo(s: Sessao): string {
  const parcelas = s.parcelas || 1;
  const parcelaInfo = parcelas > 1 ? ` (${parcelas}x ${formatMoney(s.valor / parcelas)})` : '';
  const pagamento = s.metodo === 'Credito' || s.metodo === 'Credito'
    ? `Credito — ${s.cartao_nome}${parcelaInfo}`
    : `${s.metodo} — ${s.conta}`;
  return `Resumo da despesa:\n` +
    `${s.descricao} — ${formatMoney(s.valor)}\n` +
    `Categoria: ${s.categoria_nome}\n` +
    `Pagamento: ${pagamento}\n` +
    `Data: ${hojeFormatado()}\n\n` +
    `Confirma? Digite sim ou nao`;
}

async function processarMensagem(numero: string, texto: string, body: any): Promise<void> {
  const tl = texto.trim().toLowerCase();
  if (['cancelar', 'cancel', 'sair'].includes(tl)) {
    await deleteSessao(numero);
    await enviarWhatsApp(numero, 'Lancamento cancelado. Quando quiser lancar, e so me contar!');
    return;
  }

  const sessao = await getSessao(numero);

  if (!sessao) {
    const hid = await buscarHousehold(numero);
    if (!hid) { await enviarWhatsApp(numero, 'Seu numero nao esta cadastrado no my-finance-hub. Acesse o app e configure as notificacoes WhatsApp.'); return; }
    const despesa = interpretarDespesa(texto);
    if (!despesa) { await enviarWhatsApp(numero, 'Nao entendi. Exemplos:\ngastei 45,90 no Giassi\nfarmacia 38 reais\nconta de luz 120,50'); return; }
    const [cats, contas, cartoes] = await Promise.all([buscarCategorias(hid), buscarContas(hid), buscarCartoes(hid)]);
    const sugeridas = sugerirCategorias(despesa.descricao, cats);
    const listaCats = sugeridas.map((c: any, i: number) => `${i + 1} ${c.nome}`).join('\n');
    const pushName = body?.data?.pushName || '';
    await setSessao(numero, { etapa: 'aguardando_categoria', household_id: hid, descricao: despesa.descricao, valor: despesa.valor, data: hojeISO(), numero_whatsapp: numero, nome_remetente: pushName, categorias: sugeridas, contas, cartoes });
    await enviarWhatsApp(numero, `${despesa.descricao} — ${formatMoney(despesa.valor)}\n\nQual a categoria?\n${listaCats}\n\n(ou digite o nome da categoria)`);
    return;
  }

  switch (sessao.etapa) {
    case 'aguardando_categoria': {
      let cat: any;
      const num = parseInt(tl);
      if (!isNaN(num) && num >= 1 && num <= sessao.categorias.length) cat = sessao.categorias[num - 1];
      else { const all = await buscarCategorias(sessao.household_id); cat = all.find((c: any) => c.nome.toLowerCase().includes(tl)); }
      if (!cat) { await enviarWhatsApp(numero, `Categoria nao encontrada. Escolha:\n${sessao.categorias.map((c: any, i: number) => `${i + 1} ${c.nome}`).join('\n')}`); return; }
      await setSessao(numero, { ...sessao, etapa: 'aguardando_pagamento', categoria_id: cat.id, categoria_nome: cat.nome });
      await enviarWhatsApp(numero, `Categoria: ${cat.nome}\n\nForma de pagamento?\n1 PIX\n2 Debito\n3 Credito`);
      break;
    }
    case 'aguardando_pagamento': {
      const op: any = { '1': 'PIX', '2': 'Debito', '3': 'Credito', 'pix': 'PIX', 'debito': 'Debito', 'credito': 'Credito', 'debito': 'Debito' };
      const metodo = op[tl];
      if (!metodo) { await enviarWhatsApp(numero, 'Escolha:\n1 PIX\n2 Debito\n3 Credito'); return; }
      if (metodo === 'Credito') {
        if (!sessao.cartoes.length) { await enviarWhatsApp(numero, 'Nenhum cartao ativo.\n1 PIX\n2 Debito'); return; }
        await setSessao(numero, { ...sessao, etapa: 'aguardando_cartao', metodo });
        await enviarWhatsApp(numero, `Qual cartao?\n${sessao.cartoes.map((c: any, i: number) => `${i + 1} ${c.nome}`).join('\n')}`);
      } else {
        if (!sessao.contas.length) { await enviarWhatsApp(numero, 'Nenhuma conta ativa.'); return; }
        await setSessao(numero, { ...sessao, etapa: 'aguardando_conta', metodo });
        await enviarWhatsApp(numero, `Qual conta?\n${sessao.contas.map((c: any, i: number) => `${i + 1} ${c}`).join('\n')}`);
      }
      break;
    }
    case 'aguardando_conta': {
      const num = parseInt(tl);
      const conta = !isNaN(num) && num >= 1 && num <= sessao.contas.length ? sessao.contas[num - 1] : sessao.contas.find(c => c.toLowerCase().includes(tl));
      if (!conta) { await enviarWhatsApp(numero, `Conta nao encontrada:\n${sessao.contas.map((c, i) => `${i + 1} ${c}`).join('\n')}`); return; }
      const ns: Sessao = { ...sessao, etapa: 'aguardando_confirmacao', conta };
      await setSessao(numero, ns);
      await enviarWhatsApp(numero, montaResumo(ns));
      break;
    }
    case 'aguardando_cartao': {
      const num = parseInt(tl);
      const cartao: any = !isNaN(num) && num >= 1 && num <= sessao.cartoes.length ? sessao.cartoes[num - 1] : sessao.cartoes.find((c: any) => c.nome.toLowerCase().includes(tl));
      if (!cartao) { await enviarWhatsApp(numero, `Cartao nao encontrado:\n${sessao.cartoes.map((c: any, i: number) => `${i + 1} ${c.nome}`).join('\n')}`); return; }
      await setSessao(numero, { ...sessao, etapa: 'aguardando_parcelamento', cartao_id: cartao.id, cartao_nome: cartao.nome });
      await enviarWhatsApp(numero, `Cartao: ${cartao.nome}\n\nA vista ou parcelado?\n1 A vista\n2 Parcelado`);
      break;
    }
    case 'aguardando_parcelamento': {
      const op: any = { '1': false, 'a vista': false, '2': true, 'parcelado': true };
      const isParc = op[tl];
      if (isParc === undefined) { await enviarWhatsApp(numero, 'Escolha:\n1 A vista\n2 Parcelado'); return; }
      if (isParc) {
        await setSessao(numero, { ...sessao, etapa: 'aguardando_parcelas' });
        await enviarWhatsApp(numero, 'Quantas parcelas? (maximo 5)');
      } else {
        const ns: Sessao = { ...sessao, etapa: 'aguardando_confirmacao', parcelas: 1 };
        await setSessao(numero, ns);
        await enviarWhatsApp(numero, montaResumo(ns));
      }
      break;
    }
    case 'aguardando_parcelas': {
      const qtd = parseInt(tl);
      if (isNaN(qtd) || qtd < 2 || qtd > 5) { await enviarWhatsApp(numero, 'Informe um numero entre 2 e 5.'); return; }
      const ns: Sessao = { ...sessao, etapa: 'aguardando_confirmacao', parcelas: qtd };
      await setSessao(numero, ns);
      await enviarWhatsApp(numero, montaResumo(ns));
      break;
    }
    case 'aguardando_confirmacao': {
      if (['sim', 's', 'yes'].includes(tl)) {
        const ok = await salvarDespesa(sessao.household_id, sessao);
        await deleteSessao(numero);
        if (ok) {
          const p = sessao.parcelas || 1;
          await enviarWhatsApp(numero,
            `Rascunho salvo!\n\n${sessao.descricao} — ${formatMoney(sessao.valor)}\nCategoria: ${sessao.categoria_nome}\n${sessao.metodo}${sessao.cartao_nome ? ` — ${sessao.cartao_nome}` : sessao.conta ? ` — ${sessao.conta}` : ''}\n${p > 1 ? `${p}x ${formatMoney(sessao.valor / p)}\n` : ''}Data: ${hojeFormatado()}\n\nAguardando confirmacao no app.`
          );
        } else { await enviarWhatsApp(numero, 'Erro ao salvar. Tente novamente.'); }
      } else if (['nao', 'n', 'no', 'não'].includes(tl)) {
        await deleteSessao(numero);
        await enviarWhatsApp(numero, 'Cancelado! Quando quiser lancar, e so me contar.');
      } else {
        await enviarWhatsApp(numero, 'Digite sim para confirmar ou nao para cancelar.');
      }
      break;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const rawText = await req.text();
    if (!rawText?.trim()) return new Response('ok', { status: 200 });
    const body = JSON.parse(rawText);
    const evento = body?.event || '';
    if (evento !== 'messages.upsert' && evento !== 'MESSAGES_UPSERT') return new Response('ok', { status: 200 });
    const msg = body?.data?.message;
    const key = body?.data?.key;
    if (key?.fromMe) return new Response('ok', { status: 200 });
    const numero = (key?.remoteJid || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const texto = (msg?.conversation || msg?.extendedTextMessage?.text || '').trim();
    if (!numero || !texto) return new Response('ok', { status: 200 });
    const tl = texto.toLowerCase();
    const COMANDOS = ['!gasto', 'gastei', 'gasto', 'comprei', 'compra'];
    const cmd = COMANDOS.find(c => tl.startsWith(c));
    const sessaoAtiva = await getSessao(numero);
    if (!cmd && !sessaoAtiva) return new Response('ok', { status: 200 });
    let textoFinal = texto;
    if (cmd) {
      textoFinal = texto.substring(cmd.length).trim();
      if (!textoFinal) {
        await enviarWhatsApp(numero, 'Como usar:\ngastei [valor] [descricao]\n\nExemplos:\ngastei 45,90 no Giassi\ncomprei 38 na farmacia\ngasto 120,50 conta de luz');
        return new Response('ok', { status: 200 });
      }
    }
    processarMensagem(numero, textoFinal, body).catch(e => console.error('Erro:', e));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Erro geral:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});