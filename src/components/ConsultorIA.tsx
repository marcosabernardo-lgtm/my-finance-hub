import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const HOUSEHOLD_ID = 'fdfc5a94-c5e4-42d1-b1c2-015dfa492556'
const PROXY_URL = 'https://wmvujvyutvwojecwmruy.supabase.co/functions/v1/anthropic-proxy'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVqdnl1dHZ3b2plY3dtcnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDEwMDgsImV4cCI6MjA4OTY3NzAwOH0.udql_zBepK2fzAxaGcsNsLavZuUSG7vefqSrVT8bABA'

type Mensagem = { role: 'user' | 'assistant'; content: string }

type DadosFinanceiros = {
  saldos: { nome: string; saldo: number; tipo: string }[]
  gastosCategoria: { nome: string; total: number; limite: number | null }[]
  dividas: { descricao: string; valor: number; data_pagamento: string; cartao_nome: string | null }[]
  cartoes: { nome: string; comprometido: number; limite: number }[]
  receitaMes: number
  despesaMes: number
  saldoMes: number
}

function formatMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function hoje() {
  return new Date().toISOString().split('T')[0]
}

function inicioMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fimMes() {
  const d = new Date()
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return fim.toISOString().split('T')[0]
}

async function buscarDadosFinanceiros(): Promise<DadosFinanceiros> {
  const inicio = inicioMes()
  const fim = fimMes()

  // Contas e saldos
  const { data: contas } = await supabase
    .from('contas').select('id, nome, saldo_inicial, tipo').eq('household_id', HOUSEHOLD_ID).eq('ativo', true)

  const { data: todasMovs } = await supabase
    .from('movimentacoes').select('conta_origem_destino, tipo, valor')
    .eq('household_id', HOUSEHOLD_ID).eq('situacao', 'Pago')

  const movs = todasMovs || []
  const saldos = (contas || []).map(c => {
    let saldo = Number(c.saldo_inicial) || 0
    for (const m of movs) {
      if (m.conta_origem_destino !== c.nome) continue
      if (m.tipo === 'Receita') saldo += Number(m.valor)
      else if (m.tipo === 'Despesa') saldo -= Number(m.valor)
      else if (m.tipo === 'Transferência') saldo -= Number(m.valor)
    }
    return { nome: c.nome, saldo, tipo: c.tipo }
  })

  // Gastos por categoria no mês
  const { data: movMes } = await supabase
    .from('movimentacoes')
    .select('valor, tipo, categoria_id, categorias(nome, limite_mensal)')
    .eq('household_id', HOUSEHOLD_ID)
    .gte('data_movimentacao', inicio)
    .lte('data_movimentacao', fim)
    .neq('situacao', 'Cancelado')

  const mapaCategoria: Record<string, { nome: string; total: number; limite: number | null }> = {}
  let receitaMes = 0, despesaMes = 0

  for (const m of movMes || []) {
    if (m.tipo === 'Receita') receitaMes += Number(m.valor)
    if (m.tipo === 'Despesa') {
      despesaMes += Number(m.valor)
      const cat = (m as any).categorias
      if (cat) {
        if (!mapaCategoria[cat.nome]) mapaCategoria[cat.nome] = { nome: cat.nome, total: 0, limite: cat.limite_mensal }
        mapaCategoria[cat.nome].total += Number(m.valor)
      }
    }
  }

  const gastosCategoria = Object.values(mapaCategoria).sort((a, b) => b.total - a.total).slice(0, 8)

  // Dívidas pendentes
  const { data: dividas } = await supabase
    .from('movimentacoes')
    .select('descricao, valor, data_pagamento, cartoes(nome)')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('situacao', 'Pendente')
    .eq('tipo', 'Despesa')
    .lte('data_pagamento', fim)
    .order('data_pagamento')
    .limit(15)

  const dividasFormatadas = (dividas || []).map((d: any) => ({
    descricao: d.descricao,
    valor: Number(d.valor),
    data_pagamento: d.data_pagamento,
    cartao_nome: d.cartoes?.nome || null,
  }))

  // Cartões comprometidos
  const { data: cartoesData } = await supabase
    .from('cartoes').select('id, nome, limite_total').eq('household_id', HOUSEHOLD_ID).eq('ativo', true)

  const { data: pendCartao } = await supabase
    .from('movimentacoes')
    .select('cartao_id, valor')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('situacao', 'Pendente')
    .eq('tipo', 'Despesa')
    .gte('data_pagamento', hoje())
    .not('cartao_id', 'is', null)

  const mapaCartao: Record<number, number> = {}
  for (const p of pendCartao || []) {
    if (!mapaCartao[p.cartao_id]) mapaCartao[p.cartao_id] = 0
    mapaCartao[p.cartao_id] += Number(p.valor)
  }

  const cartoes = (cartoesData || []).map(c => ({
    nome: c.nome,
    comprometido: mapaCartao[c.id] || 0,
    limite: Number(c.limite_total),
  })).filter(c => c.comprometido > 0 || c.limite > 0)

  return {
    saldos,
    gastosCategoria,
    dividas: dividasFormatadas,
    cartoes,
    receitaMes,
    despesaMes,
    saldoMes: receitaMes - despesaMes,
  }
}

function montarContexto(dados: DadosFinanceiros): string {
  const linhas: string[] = []
  linhas.push('=== DADOS FINANCEIROS REAIS DO USUÁRIO ===\n')

  linhas.push('📊 SALDOS ATUAIS:')
  for (const s of dados.saldos) {
    linhas.push(`  ${s.nome} (${s.tipo}): ${formatMoney(s.saldo)}`)
  }

  linhas.push(`\n📅 MÊS ATUAL:`)
  linhas.push(`  Receitas: ${formatMoney(dados.receitaMes)}`)
  linhas.push(`  Despesas: ${formatMoney(dados.despesaMes)}`)
  linhas.push(`  Saldo do mês: ${formatMoney(dados.saldoMes)}`)

  linhas.push(`\n🏷️ GASTOS POR CATEGORIA (mês):`)
  for (const g of dados.gastosCategoria) {
    const pct = g.limite ? ` (${Math.round((g.total / g.limite) * 100)}% do limite de ${formatMoney(g.limite)})` : ''
    linhas.push(`  ${g.nome}: ${formatMoney(g.total)}${pct}`)
  }

  linhas.push(`\n💳 CARTÕES:`)
  for (const c of dados.cartoes) {
    const pct = c.limite > 0 ? Math.round((c.comprometido / c.limite) * 100) : 0
    linhas.push(`  ${c.nome}: ${formatMoney(c.comprometido)} comprometido de ${formatMoney(c.limite)} (${pct}%)`)
  }

  if (dados.dividas.length > 0) {
    linhas.push(`\n⚠️ DÍVIDAS/PENDÊNCIAS:`)
    for (const d of dados.dividas) {
      const cartao = d.cartao_nome ? ` [${d.cartao_nome}]` : ''
      linhas.push(`  ${d.descricao}${cartao}: ${formatMoney(d.valor)} — vence ${new Date(d.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}`)
    }
  }

  return linhas.join('\n')
}

async function chamarClaude(mensagens: Mensagem[], systemPrompt: string): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: mensagens.map(m => ({ role: m.role, content: m.content })),
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || 'Erro ao obter resposta.'
}

// ─── Cards fixos ─────────────────────────────────────────────────────────────

type CardAnalise = {
  titulo: string
  emoji: string
  conteudo: string
  cor: string
}

function CardAnaliseComponent({ card, carregando }: { card: CardAnalise | null; carregando: boolean }) {
  const darkMode = localStorage.getItem('fh_theme') === 'dark'
  const bg = darkMode ? '#16213e' : '#ffffff'
  const border = darkMode ? '#1e2d45' : '#e2e8f0'
  const texto = darkMode ? '#e2e8f0' : '#1a202c'
  const subtexto = darkMode ? '#94a3b8' : '#64748b'

  if (carregando) {
    return (
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 24, minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <p style={{ color: subtexto, fontSize: 13, margin: 0 }}>Analisando...</p>
        </div>
      </div>
    )
  }

  if (!card) return null

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 16,
      padding: 24,
      borderTop: `3px solid ${card.cor}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>{card.emoji}</span>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: texto }}>{card.titulo}</h3>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: subtexto, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{card.conteudo}</p>
    </div>
  )
}

// ─── Chat ────────────────────────────────────────────────────────────────────

function Chat({ systemPrompt, darkMode }: { systemPrompt: string; darkMode: boolean }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  const bg = darkMode ? '#16213e' : '#ffffff'
  const bgUser = darkMode ? '#1e3a6e' : '#eff6ff'
  const bgAssistant = darkMode ? '#1a2744' : '#f5f0e8'
  const border = darkMode ? '#1e2d45' : '#e2e8f0'
  const texto = darkMode ? '#e2e8f0' : '#1a202c'
  const subtexto = darkMode ? '#94a3b8' : '#64748b'
  const inputBg = darkMode ? '#0d1526' : '#f7fafc'

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens])

  const enviar = async () => {
    if (!input.trim() || loading) return
    const novaMensagem: Mensagem = { role: 'user', content: input.trim() }
    const novaLista = [...mensagens, novaMensagem]
    setMensagens(novaLista)
    setInput('')
    setLoading(true)

    try {
      const resposta = await chamarClaude(novaLista, systemPrompt)
      setMensagens(prev => [...prev, { role: 'assistant', content: resposta }])
    } catch {
      setMensagens(prev => [...prev, { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' }])
    }
    setLoading(false)
  }

  const sugestoes = [
    'Como posso quitar meu cartão mais rápido?',
    'Onde estou gastando mais do que deveria?',
    'Quanto preciso cortar para investir R$ 500/mês?',
    'Qual é minha situação financeira atual?',
  ]

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: texto }}>Chat com o Consultor</p>
          <p style={{ margin: 0, fontSize: 12, color: subtexto }}>Pergunte qualquer coisa sobre suas finanças</p>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={chatRef} style={{ height: 340, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mensagens.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: subtexto, fontSize: 13, marginBottom: 16 }}>Sugestões de perguntas:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sugestoes.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setInput(s)}
                  style={{
                    padding: '10px 16px', background: inputBg, border: `1px solid ${border}`,
                    borderRadius: 10, cursor: 'pointer', color: subtexto, fontSize: 13,
                    textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  💬 {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%',
              background: m.role === 'user' ? bgUser : bgAssistant,
              border: `1px solid ${border}`,
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding: '10px 14px',
              fontSize: 13,
              color: texto,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: bgAssistant, border: `1px solid ${border}`, borderRadius: '16px 16px 16px 4px', padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#667eea',
                    animation: 'pulse 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${border}`, display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
          placeholder="Pergunte sobre suas finanças..."
          style={{
            flex: 1, padding: '10px 14px', background: inputBg, border: `1px solid ${border}`,
            borderRadius: 10, color: texto, fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={enviar}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 18px', background: loading || !input.trim() ? '#94a3b8' : 'linear-gradient(135deg, #667eea, #764ba2)',
            border: 'none', borderRadius: 10, color: 'white', fontWeight: 700,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}

// ─── Principal ───────────────────────────────────────────────────────────────

export default function ConsultorIA() {
  const darkMode = localStorage.getItem('fh_theme') === 'dark'
  const [dados, setDados] = useState<DadosFinanceiros | null>(null)
  const [cards, setCards] = useState<(CardAnalise | null)[]>([null, null, null])
  const [carregandoCards, setCarregandoCards] = useState(false)
  const [carregandoDados, setCarregandoDados] = useState(true)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [erro, setErro] = useState('')

  const bg = darkMode ? '#0b1120' : '#f0f4f8'
  const texto = darkMode ? '#e2e8f0' : '#1a202c'
  const subtexto = darkMode ? '#94a3b8' : '#64748b'
  const border = darkMode ? '#1e2d45' : '#e2e8f0'
  const cardBg = darkMode ? '#16213e' : '#ffffff'

  useEffect(() => { inicializar() }, [])

  const inicializar = async () => {
    setCarregandoDados(true)
    setErro('')
    try {
      const d = await buscarDadosFinanceiros()
      setDados(d)
      const contexto = montarContexto(d)
      const prompt = `Você é um consultor financeiro pessoal brasileiro, direto, empático e prático. Você tem acesso aos dados financeiros REAIS do usuário abaixo. Use esses dados para dar conselhos personalizados, específicos e acionáveis. Nunca dê conselhos genéricos — sempre baseie-se nos números reais. Seja encorajador mas honesto. Use emojis com moderação. Responda sempre em português brasileiro.\n\n${contexto}`
      setSystemPrompt(prompt)
      await gerarCards(d, prompt)
    } catch (e) {
      setErro('Erro ao carregar dados financeiros.')
    }
    setCarregandoDados(false)
  }

  const gerarCards = async (_d: DadosFinanceiros, prompt: string) => {
    setCarregandoCards(true)
    setCards([null, null, null])

    const perguntas = [
      { titulo: 'Diagnóstico do Mês', emoji: '🔍', cor: '#667eea', pergunta: 'Faça um diagnóstico financeiro CURTO do mês atual do usuário. Máximo 5 linhas. Destaque o principal ponto positivo e o principal problema. Seja direto.' },
      { titulo: 'Plano Anti-Dívida', emoji: '💳', cor: '#ef4444', pergunta: 'Com base nas dívidas e cartões do usuário, sugira um plano PRÁTICO e CURTO (máximo 5 linhas) para quitar as dívidas. Use a estratégia snowball ou avalanche conforme o perfil. Cite valores reais.' },
      { titulo: 'Meta de Sobra', emoji: '📈', cor: '#22c55e', pergunta: 'Com base na receita e gastos do usuário, sugira em MÁXIMO 5 linhas como ele pode sobrar dinheiro todo mês e começar a investir. Seja específico com categorias e valores reais.' },
    ]

    for (let i = 0; i < perguntas.length; i++) {
      const p = perguntas[i]
      try {
        const resposta = await chamarClaude([{ role: 'user', content: p.pergunta }], prompt)
        setCards(prev => {
          const nova = [...prev]
          nova[i] = { titulo: p.titulo, emoji: p.emoji, cor: p.cor, conteudo: resposta }
          return nova
        })
      } catch {
        setCards(prev => {
          const nova = [...prev]
          nova[i] = { titulo: p.titulo, emoji: p.emoji, cor: p.cor, conteudo: 'Não foi possível gerar esta análise.' }
          return nova
        })
      }
    }
    setCarregandoCards(false)
  }

  if (carregandoDados) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <p style={{ color: texto, fontSize: 16, fontWeight: 600 }}>Carregando seus dados...</p>
          <p style={{ color: subtexto, fontSize: 13 }}>Buscando informações financeiras</p>
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ef4444' }}>{erro}</p>
          <button onClick={inicializar} style={{ marginTop: 12, padding: '10px 20px', background: '#667eea', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer' }}>Tentar novamente</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', padding: '24px' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: texto }}>Consultor IA</h1>
              <p style={{ margin: 0, fontSize: 13, color: subtexto }}>Análise personalizada baseada nos seus dados reais</p>
            </div>
          </div>
        </div>
        <button
          onClick={inicializar}
          style={{ padding: '9px 18px', background: cardBg, border: `1px solid ${border}`, borderRadius: 10, color: subtexto, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          🔄 Atualizar análise
        </button>
      </div>

      {/* Resumo rápido */}
      {dados && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Receita do Mês', valor: dados.receitaMes, cor: '#22c55e', emoji: '📥' },
            { label: 'Despesa do Mês', valor: dados.despesaMes, cor: '#ef4444', emoji: '📤' },
            { label: 'Saldo do Mês', valor: dados.saldoMes, cor: dados.saldoMes >= 0 ? '#22c55e' : '#ef4444', emoji: dados.saldoMes >= 0 ? '✅' : '⚠️' },
          ].map((item, i) => (
            <div key={i} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: '16px 20px', borderLeft: `3px solid ${item.cor}` }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, color: subtexto }}>{item.emoji} {item.label}</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: item.cor }}>{formatMoney(item.valor)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Cards de análise */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {cards.map((card, i) => (
          <CardAnaliseComponent key={i} card={card} carregando={card === null && carregandoCards} />
        ))}
      </div>

      {/* Chat */}
      {systemPrompt && <Chat systemPrompt={systemPrompt} darkMode={darkMode} />}
    </div>
  )
}
