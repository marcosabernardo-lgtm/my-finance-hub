import { useEffect, useState, useMemo, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"
import { useAuth } from "../hooks/useAuth"

const supabase = createClient(
  "https://wmvujvyutvwojecwmruy.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVqdnl1dHZ3b2plY3dtcnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDEwMDgsImV4cCI6MjA4OTY3NzAwOH0.udql_zBepK2fzAxaGcsNsLavZuUSG7vefqSrVT8bABA"
)

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

function logoBanco(nome: string): { bg: string; color: string; sigla: string } {
  const n = nome.toLowerCase()
  if (n.includes("nubank"))    return { bg: "#8A05BE", color: "#fff", sigla: "NU" }
  if (n.includes("itaú") || n.includes("itau")) return { bg: "#EC7000", color: "#fff", sigla: "ITÁ" }
  if (n.includes("bradesco"))  return { bg: "#CC092F", color: "#fff", sigla: "BRA" }
  if (n.includes("sicredi"))   return { bg: "#00813D", color: "#fff", sigla: "SIC" }
  if (n.includes("inter"))     return { bg: "#FF7A00", color: "#fff", sigla: "INT" }
  if (n.includes("mercado") || n.includes("pago")) return { bg: "#00AEEF", color: "#fff", sigla: "MP" }
  if (n.includes("cactus"))    return { bg: "#2D7A3A", color: "#fff", sigla: "CAC" }
  if (n.includes("c6"))        return { bg: "#242424", color: "#fff", sigla: "C6" }
  const sigla = nome.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase()
  return { bg: "#e5e7eb", color: "#374151", sigla }
}

const hoje = new Date()
const mesAtual = hoje.getMonth() + 1
const anoAtual = hoje.getFullYear()

function diasAte(dataStr: string) {
  const d = new Date(dataStr + "T00:00:00")
  const h = new Date(); h.setHours(0,0,0,0)
  return Math.round((d.getTime() - h.getTime()) / 86400000)
}

// ─── Mini gráfico de barras ───────────────────────────────────────────────────
function MiniGrafico({ dados, cor, meta }: {
  dados: { label: string; valor: number }[]
  cor: string
  meta?: number
}) {
  const max = Math.max(...dados.map(d => d.valor), meta || 0, 1) * 1.15
  const H = 80
  return (
    <svg width="100%" height={H + 24} viewBox={`0 0 ${dados.length * 40} ${H + 24}`} preserveAspectRatio="none">
      {meta && (
        <line x1={0} y1={H - (meta/max)*H} x2={dados.length*40} y2={H - (meta/max)*H}
          stroke={cor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
      )}
      {dados.map((d, i) => {
        const h = Math.max((d.valor / max) * H, d.valor > 0 ? 3 : 0)
        const acima = meta && d.valor > meta
        const c = meta ? (acima ? "#ef4444" : "#16a34a") : cor
        return (
          <g key={i}>
            <rect x={i*40+8} y={H-h} width={24} height={h} fill={c} rx={3} />
            <text x={i*40+20} y={H+16} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Card resumo ──────────────────────────────────────────────────────────────
function CardResumo({ label, valor, sub, borda, icone, corValor }: {
  label: string; valor: string; sub: string; borda: string; icone: string; corValor?: string
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", border: "1px solid #e2e8f0", borderLeft: `4px solid ${borda}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <span style={{ fontSize: 20 }}>{icone}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: corValor || "#111827", margin: "8px 0 2px" }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function HomePanel() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Dados
  const [contas,    setContas]    = useState<any[]>([])
  const [cartoes,   setCartoes]   = useState<any[]>([])
  const [categorias,setCategorias]= useState<any[]>([])
  const [movsMes,   setMovsMes]   = useState<any[]>([])
  const [movsAno,   setMovsAno]   = useState<any[]>([])
  const [movsCartaoAno, setMovsCartaoAno] = useState<any[]>([])
  const [saldosContas,  setSaldosContas]  = useState<Record<number, number>>({})
  const [compCartoes,   setCompCartoes]   = useState<Record<number, number>>({})
  const [dividas,       setDividas]       = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    supabase.from("households").select("id").eq("owner_id", user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const mesStr   = String(mesAtual).padStart(2, "0")
    const dataIni  = `${anoAtual}-${mesStr}-01`
    const dataFim  = `${anoAtual}-${mesStr}-${new Date(anoAtual, mesAtual, 0).getDate()}`

    const [contasR, cartoesR, catsR, mesR, anoR, cartaoAnoR, todasR, pendCartR, diviR] = await Promise.all([
      supabase.from("contas").select("id,nome,saldo_inicial,tipo").eq("household_id", householdId).eq("ativo", true),
      supabase.from("cartoes").select("id,nome,limite_total,data_vencimento").eq("household_id", householdId).eq("ativo", true),
      supabase.from("categorias").select("id,nome,limite_gastos,classificacao").eq("household_id", householdId),
      supabase.from("movimentacoes").select("id,tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,categoria_id,descricao")
        .eq("household_id", householdId).gte("data_movimentacao", dataIni).lte("data_movimentacao", dataFim),
      supabase.from("movimentacoes").select("tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,cartao_id")
        .eq("household_id", householdId).gte("data_movimentacao", `${anoAtual}-01-01`).lte("data_movimentacao", `${anoAtual}-12-31`),
      supabase.from("movimentacoes").select("cartao_id,valor,situacao,data_pagamento")
        .eq("household_id", householdId).eq("tipo", "Despesa").not("cartao_id", "is", null)
        .gte("data_pagamento", `${anoAtual}-01-01`).lte("data_pagamento", `${anoAtual}-12-31`),
      supabase.from("movimentacoes").select("conta_origem_destino,tipo,valor,situacao").eq("household_id", householdId).eq("situacao", "Pago"),
      supabase.from("movimentacoes").select("cartao_id,valor").eq("household_id", householdId).eq("situacao", "Pendente")
        .not("cartao_id", "is", null).gte("data_pagamento", hoje.toISOString().split("T")[0]),
      supabase.from("movimentacoes").select("id,descricao,valor,situacao,numero_parcela,data_pagamento,cartao_id,grupo_id,conta_origem_destino")
        .eq("household_id", householdId).eq("tipo", "Despesa").not("numero_parcela", "is", null).not("grupo_id", "is", null),
    ])

    const conts = contasR.data || []
    setContas(conts)
    setCartoes(cartoesR.data || [])
    setCategorias(catsR.data || [])
    setMovsMes(mesR.data || [])
    setMovsAno(anoR.data || [])
    setMovsCartaoAno(cartaoAnoR.data || [])

    // Saldos contas
    const saldos: Record<number, number> = {}
    for (const c of conts) {
      let s = Number(c.saldo_inicial) || 0
      for (const m of todasR.data || []) {
        if (m.conta_origem_destino !== c.nome) continue
        if (m.tipo === "Receita") s += Number(m.valor)
        else if (m.tipo === "Despesa") s -= Number(m.valor)
        else if (m.tipo === "Transferência") s -= Number(m.valor)
      }
      saldos[c.id] = s
    }
    setSaldosContas(saldos)

    // Comprometido cartões
    const comp: Record<number, number> = {}
    for (const m of pendCartR.data || []) {
      if (!m.cartao_id) continue
      comp[m.cartao_id] = (comp[m.cartao_id] || 0) + Number(m.valor)
    }
    setCompCartoes(comp)

    // Dívidas ativas (parceladas com pendentes)
    const divData = diviR.data || []
    const porGrupo: Record<string, any[]> = {}
    for (const m of divData) {
      const match = m.numero_parcela?.match(/Parcela (\d+)\/(\d+)/i)
      if (!match || +match[2] <= 1) continue
      if (!porGrupo[m.grupo_id]) porGrupo[m.grupo_id] = []
      porGrupo[m.grupo_id].push(m)
    }
    const divAtivas = Object.values(porGrupo).map((ps: any[]) => {
      ps.sort((a,b) => {
        const pa = a.numero_parcela?.match(/Parcela (\d+)\/(\d+)/i)
        const pb = b.numero_parcela?.match(/Parcela (\d+)\/(\d+)/i)
        return (+pa?.[1]||0) - (+pb?.[1]||0)
      })
      const p0 = ps[0]
      const isCredito = !!p0.cartao_id
      const pend = ps.filter(p => isCredito
        ? (p.situacao === "Pendente")
        : p.situacao === "Pendente")
      return { descricao: p0.descricao, valor_parcela: p0.valor, pendentes: pend.length, valor_restante: p0.valor * pend.length, isCredito }
    }).filter(d => d.pendentes > 0)
    setDividas(divAtivas)

    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const totalReceitas = useMemo(() =>
    movsMes.filter(m => m.tipo === "Receita" && ["Pago","Pendente"].includes(m.situacao) && m.metodo_pagamento !== "Transferência entre Contas")
      .reduce((s,m) => s + Number(m.valor), 0), [movsMes])

  const totalDespesas = useMemo(() =>
    movsMes.filter(m => m.tipo === "Despesa" && ["Pago","Pendente"].includes(m.situacao) && !m.cartao_id)
      .reduce((s,m) => s + Number(m.valor), 0), [movsMes])

  const totalCartao = useMemo(() =>
    movsMes.filter(m => m.tipo === "Despesa" && ["Pago","Pendente"].includes(m.situacao) && m.cartao_id)
      .reduce((s,m) => s + Number(m.valor), 0), [movsMes])

  const totalSaldo = contas.filter(c => c.tipo === "corrente").reduce((s,c) => s + (saldosContas[c.id]||0), 0)

  const totalDividas = dividas.reduce((s,d) => s + d.valor_restante, 0)

  // Gráfico receitas mês a mês
  const dadosReceitas = useMemo(() => Array.from({length:12}, (_,i) => ({
    label: MESES_CURTOS[i],
    valor: movsAno.filter(m => {
      const mm = m.data_movimentacao ? parseInt(m.data_movimentacao.substring(5,7)) : 0
      return m.tipo === "Receita" && m.situacao === "Pago" && mm === i+1 && m.metodo_pagamento !== "Transferência entre Contas"
    }).reduce((s,m) => s+Number(m.valor),0)
  })), [movsAno])

  // Gráfico despesas mês a mês
  const dadosDespesas = useMemo(() => Array.from({length:12}, (_,i) => ({
    label: MESES_CURTOS[i],
    valor: movsAno.filter(m => {
      const mm = m.data_movimentacao ? parseInt(m.data_movimentacao.substring(5,7)) : 0
      return m.tipo === "Despesa" && mm === i+1 && (m.situacao === "Pago" || (m.situacao === "Pendente" && m.numero_parcela === "Parcela 1/1"))
    }).reduce((s,m) => s+Number(m.valor),0)
  })), [movsAno])

  const metaDespesas = useMemo(() =>
    categorias.filter(c => !["Renda Ativa","Renda Passiva"].includes(c.classificacao) && c.limite_gastos > 0)
      .reduce((s,c) => s + c.limite_gastos, 0), [categorias])

  // Gráfico cartão (primeiro cartão)
  const primeiroCartao = cartoes[0]
  const dadosCartao = useMemo(() => Array.from({length:12}, (_,i) => ({
    label: MESES_CURTOS[i],
    valor: movsCartaoAno.filter(m => {
      if (!m.data_pagamento) return false
      const mf = parseInt(m.data_pagamento.substring(5,7))
      return m.cartao_id === primeiroCartao?.id && mf === i+1 && ["Faturado","Pendente","Previsto"].includes(m.situacao)
    }).reduce((s,m) => s+Number(m.valor),0)
  })), [movsCartaoAno, primeiroCartao])

  // Alertas: vencidos + próximos 5 dias
  const vencidos = useMemo(() =>
    movsMes.filter(m => {
      if (m.situacao !== "Pendente") return false
      const ref = m.data_pagamento || m.data_movimentacao
      return ref && diasAte(ref) < 0
    }), [movsMes])

  const proximos5 = useMemo(() =>
    movsMes.filter(m => {
      if (m.situacao !== "Pendente") return false
      const ref = m.data_pagamento || m.data_movimentacao
      if (!ref) return false
      const d = diasAte(ref)
      return d >= 0 && d <= 5
    }), [movsMes])

  // Limites estourados
  const limitesEstourados = useMemo(() => {
    const gastos: Record<number, number> = {}
    for (const m of movsMes) {
      if (!m.categoria_id) continue
      if (m.situacao === "Pago" || (m.situacao === "Pendente" && m.numero_parcela === "Parcela 1/1"))
        gastos[m.categoria_id] = (gastos[m.categoria_id]||0) + Number(m.valor)
    }
    return categorias.filter(c => c.limite_gastos > 0 && (gastos[c.id]||0) > c.limite_gastos)
      .map(c => ({ nome: c.nome, gasto: gastos[c.id], limite: c.limite_gastos, pct: Math.round(gastos[c.id]/c.limite_gastos*100) }))
  }, [movsMes, categorias])

  const mesNome = new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" })

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f5f0e8", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ color:"#6b7280", fontSize:16 }}>Carregando visão geral...</div>
    </div>
  )

  return (
    <div style={{ background:"#f5f0e8", minHeight:"100vh", fontFamily:"'Segoe UI', system-ui, sans-serif", padding:"28px 32px" }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:26, fontWeight:800, color:"#1a2332", margin:0 }}>Visão Geral</h1>
        <p style={{ color:"#6b7280", fontSize:13, marginTop:4 }}>
          {mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} · Atualizado agora
          <button onClick={fetchDados} style={{ marginLeft:12, fontSize:12, color:"#0d7280", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>↻ Atualizar</button>
        </p>
      </div>

      {/* ── 1. Cards resumo ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:14, marginBottom:28 }}>
        <CardResumo label="Saldo em Contas"    valor={fmt(totalSaldo)}    sub="Contas correntes"        borda="#6ee7b7" icone="🏦" corValor={totalSaldo>=0?"#065f46":"#991b1b"} />
        <CardResumo label="Receitas do Mês"    valor={fmt(totalReceitas)} sub="Pago + Pendente"         borda="#93c5fd" icone="📈" />
        <CardResumo label="Despesas do Mês"    valor={fmt(totalDespesas)} sub="Sem cartão"              borda="#fca5a5" icone="📉" />
        <CardResumo label="Cartão de Crédito"  valor={fmt(totalCartao)}   sub="Todas as compras"        borda="#c4b5fd" icone="💳" />
        <CardResumo label="Total em Dívidas"   valor={fmt(totalDividas)}  sub={`${dividas.length} parcelamentos`} borda="#e05252" icone="🔴" corValor="#e05252" />
      </div>

      {/* ── 2. Contas + Cartões ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:28 }}>

        {/* Contas */}
        <div style={{ background:"#fff", borderRadius:14, padding:"20px", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:14 }}>🏦 Contas Correntes</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {contas.filter(c=>c.tipo==="corrente").map(c => {
              const saldo = saldosContas[c.id]??0
              const logo  = logoBanco(c.nome)
              return (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#f5f0e8", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:logo.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:logo.color, flexShrink:0 }}>{logo.sigla}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.nome}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:saldo>=0?"#065f46":"#991b1b" }}>{fmt(saldo)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cartões */}
        <div style={{ background:"#fff", borderRadius:14, padding:"20px", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:14 }}>💳 Cartões de Crédito</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {cartoes.map(c => {
              const usado = compCartoes[c.id]||0
              const disp  = c.limite_total - usado
              const pct   = c.limite_total > 0 ? (usado/c.limite_total)*100 : 0
              const cor   = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#10b981"
              const logo  = logoBanco(c.nome)
              return (
                <div key={c.id} style={{ background:"#f5f0e8", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ width:32, height:32, borderRadius:7, background:logo.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:logo.color, flexShrink:0 }}>{logo.sigla}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.nome}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:disp>=0?"#065f46":"#991b1b" }}>{fmt(disp)} disp.</div>
                    </div>
                  </div>
                  <div style={{ background:"#e2e8f0", borderRadius:99, height:5 }}>
                    <div style={{ background:cor, borderRadius:99, height:5, width:`${Math.min(pct,100)}%`, transition:"width 0.4s" }} />
                  </div>
                  <div style={{ fontSize:10, color:cor, fontWeight:700, marginTop:3 }}>{pct.toFixed(0)}% usado · {fmt(usado)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 3. Gráficos ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:28 }}>

        <div style={{ background:"#fff", borderRadius:14, padding:"18px 20px", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111827", marginBottom:4 }}>📈 Receitas {anoAtual}</div>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:8 }}>Mês a mês — Pago</div>
          <MiniGrafico dados={dadosReceitas} cor="#2563eb" />
        </div>

        <div style={{ background:"#fff", borderRadius:14, padding:"18px 20px", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111827", marginBottom:4 }}>📉 Despesas {anoAtual}</div>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:8 }}>Mês a mês {metaDespesas > 0 ? `· Meta ${fmt(metaDespesas)}` : ""}</div>
          <MiniGrafico dados={dadosDespesas} cor="#ef4444" meta={metaDespesas || undefined} />
        </div>

        <div style={{ background:"#fff", borderRadius:14, padding:"18px 20px", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111827", marginBottom:4 }}>💳 {primeiroCartao?.nome || "Cartão"} {anoAtual}</div>
          <div style={{ fontSize:11, color:"#9ca3af", marginBottom:8 }}>Faturas mês a mês</div>
          <MiniGrafico dados={dadosCartao} cor="#7c3aed" />
        </div>
      </div>

      {/* ── 4. Alertas + Endividamento ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

        {/* Alertas */}
        <div style={{ background:"#fff", borderRadius:14, padding:"20px", border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#111827", marginBottom:14 }}>
            🔔 Alertas
            {(vencidos.length + proximos5.length + limitesEstourados.length) > 0 && (
              <span style={{ marginLeft:8, fontSize:11, fontWeight:700, background:"#ef4444", color:"#fff", borderRadius:99, padding:"2px 10px" }}>
                {vencidos.length + proximos5.length + limitesEstourados.length}
              </span>
            )}
          </div>

          {vencidos.length === 0 && proximos5.length === 0 && limitesEstourados.length === 0 ? (
            <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:"20px 0" }}>✅ Nenhum alerta ativo</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {/* Vencidos */}
              {vencidos.length > 0 && (
                <div style={{ background:"#fff5f5", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #ef4444" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#ef4444", marginBottom:6 }}>🚨 Vencidos ({vencidos.length})</div>
                  {vencidos.slice(0,3).map(m => (
                    <div key={m.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"2px 0" }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%" }}>{m.descricao}</span>
                      <span style={{ fontWeight:700, color:"#ef4444" }}>{fmt(Number(m.valor))}</span>
                    </div>
                  ))}
                  {vencidos.length > 3 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{vencidos.length-3} mais</div>}
                </div>
              )}

              {/* Próximos 5 dias */}
              {proximos5.length > 0 && (
                <div style={{ background:"#fffbeb", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #f59e0b" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#f59e0b", marginBottom:6 }}>⏰ Vencem em 5 dias ({proximos5.length})</div>
                  {proximos5.slice(0,3).map(m => (
                    <div key={m.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"2px 0" }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%" }}>{m.descricao}</span>
                      <span style={{ fontWeight:700, color:"#f59e0b" }}>{fmt(Number(m.valor))}</span>
                    </div>
                  ))}
                  {proximos5.length > 3 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{proximos5.length-3} mais</div>}
                </div>
              )}

              {/* Limites estourados */}
              {limitesEstourados.length > 0 && (
                <div style={{ background:"#fdf4ff", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #7c3aed" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#7c3aed", marginBottom:6 }}>💸 Limites estourados ({limitesEstourados.length})</div>
                  {limitesEstourados.slice(0,3).map((c,i) => (
                    <div key={i} style={{ marginBottom:6 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151" }}>
                        <span>{c.nome}</span>
                        <span style={{ fontWeight:700, color:"#7c3aed" }}>{c.pct}%</span>
                      </div>
                      <div style={{ background:"#e9d5ff", borderRadius:99, height:4, marginTop:3 }}>
                        <div style={{ background:"#7c3aed", width:"100%", height:4, borderRadius:99 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Endividamento */}
        <div style={{ background:"#fff", borderRadius:14, padding:"20px", border:"1px solid #e2e8f0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>
              💰 Endividamento
            </div>
            <div style={{ fontSize:16, fontWeight:800, color:"#e05252" }}>{fmt(totalDividas)}</div>
          </div>

          {dividas.length === 0 ? (
            <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:"20px 0" }}>🎉 Nenhuma dívida ativa</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {/* Crédito */}
              {dividas.filter(d=>d.isCredito).length > 0 && (
                <div style={{ background:"#fff5f5", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #e05252", marginBottom:4 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#e05252", marginBottom:6 }}>
                    💳 Crédito — {fmt(dividas.filter(d=>d.isCredito).reduce((s,d)=>s+d.valor_restante,0))}
                  </div>
                  {dividas.filter(d=>d.isCredito).slice(0,4).map((d,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"2px 0" }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"65%" }}>{d.descricao}</span>
                      <span style={{ fontWeight:700, color:"#e05252", whiteSpace:"nowrap" }}>{d.pendentes}x {fmt(d.valor_parcela)}</span>
                    </div>
                  ))}
                  {dividas.filter(d=>d.isCredito).length > 4 && (
                    <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{dividas.filter(d=>d.isCredito).length-4} mais</div>
                  )}
                </div>
              )}

              {/* Débito/Parcelamento */}
              {dividas.filter(d=>!d.isCredito).length > 0 && (
                <div style={{ background:"#eff6ff", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #4a9eff" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#4a9eff", marginBottom:6 }}>
                    🏦 Débito / Parcelamento — {fmt(dividas.filter(d=>!d.isCredito).reduce((s,d)=>s+d.valor_restante,0))}
                  </div>
                  {dividas.filter(d=>!d.isCredito).slice(0,4).map((d,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"2px 0" }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"65%" }}>{d.descricao}</span>
                      <span style={{ fontWeight:700, color:"#4a9eff", whiteSpace:"nowrap" }}>{d.pendentes}x {fmt(d.valor_parcela)}</span>
                    </div>
                  ))}
                  {dividas.filter(d=>!d.isCredito).length > 4 && (
                    <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{dividas.filter(d=>!d.isCredito).length-4} mais</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
