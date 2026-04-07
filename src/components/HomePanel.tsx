import { useEffect, useState, useCallback, useMemo } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

const hoje = new Date()
const mesAtual  = hoje.getMonth() + 1
const anoAtual  = hoje.getFullYear()
const mesNome   = hoje.toLocaleString("pt-BR", { month: "long", year: "numeric" })
const mesFormatado = mesNome.charAt(0).toUpperCase() + mesNome.slice(1)

function diasAte(dataStr: string) {
  const d = new Date(dataStr + "T00:00:00")
  const h = new Date(); h.setHours(0,0,0,0)
  return Math.round((d.getTime() - h.getTime()) / 86400000)
}

function logoBanco(nome: string) {
  const n = nome.toLowerCase()
  if (n.includes("nubank"))    return { bg: "#8A05BE", color: "#fff", sigla: "NU" }
  if (n.includes("itaú") || n.includes("itau")) return { bg: "#EC7000", color: "#fff", sigla: "ITÁ" }
  if (n.includes("bradesco"))  return { bg: "#CC092F", color: "#fff", sigla: "BRA" }
  if (n.includes("sicredi"))   return { bg: "#00813D", color: "#fff", sigla: "SIC" }
  if (n.includes("inter"))     return { bg: "#FF7A00", color: "#fff", sigla: "INT" }
  if (n.includes("mercado") || n.includes("pago")) return { bg: "#00AEEF", color: "#fff", sigla: "MP" }
  if (n.includes("cactus"))    return { bg: "#2D7A3A", color: "#fff", sigla: "CAC" }
  if (n.includes("c6"))        return { bg: "#242424", color: "#fff", sigla: "C6" }
  if (n.includes("swile"))     return { bg: "#FF6B6B", color: "#fff", sigla: "SWI" }
  const sigla = nome.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase()
  return { bg: "#e5e7eb", color: "#374151", sigla }
}

function parseP(s: string) {
  const m = s?.match(/Parcela (\d+)\/(\d+)/i)
  return m ? { atual: +m[1], total: +m[2] } : { atual: 0, total: 0 }
}

// ─── Mini gráfico de barras ───────────────────────────────────────────────────
function MiniGrafico({ dados, cor, meta }: { dados: { label: string; valor: number }[]; cor: string; meta?: number }) {
  const max = Math.max(...dados.map(d => d.valor), meta || 0, 1) * 1.15
  const H = 80
  return (
    <svg width="100%" height={H + 20} viewBox={`0 0 ${dados.length * 36} ${H + 20}`} preserveAspectRatio="none">
      {meta && <line x1={0} y1={H-(meta/max)*H} x2={dados.length*36} y2={H-(meta/max)*H} stroke={cor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />}
      {dados.map((d, i) => {
        const h = Math.max((d.valor/max)*H, d.valor > 0 ? 3 : 0)
        const c = meta ? (d.valor > meta ? "#ef4444" : "#16a34a") : cor
        return (
          <g key={i}>
            <rect x={i*36+6} y={H-h} width={24} height={h} fill={c} rx={3} />
            <text x={i*36+18} y={H+14} textAnchor="middle" fontSize={8} fill="#9ca3af">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function HomePanel() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [contas,    setContas]         = useState<any[]>([])
  const [cartoes,   setCartoes]        = useState<any[]>([])
  const [categorias,setCategorias]     = useState<any[]>([])
  const [movsMes,   setMovsMes]        = useState<any[]>([])
  const [movsAno,   setMovsAno]        = useState<any[]>([])
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
    const mesStr  = String(mesAtual).padStart(2, "0")
    const dataIni = `${anoAtual}-${mesStr}-01`
    const dataFim = `${anoAtual}-${mesStr}-${new Date(anoAtual, mesAtual, 0).getDate()}`

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
      // Dívidas: mesma query do Endividamento.tsx
      supabase.from("movimentacoes").select("id,descricao,valor,situacao,numero_parcela,data_pagamento,cartao_id,grupo_id,conta_origem_destino,categoria_id")
        .eq("household_id", householdId).eq("tipo", "Despesa").not("numero_parcela", "is", null).not("grupo_id", "is", null)
        .order("data_pagamento", { ascending: true }),
    ])

    const conts = contasR.data || []
    setContas(conts); setCartoes(cartoesR.data || []); setCategorias(catsR.data || [])
    setMovsMes(mesR.data || []); setMovsAno(anoR.data || []); setMovsCartaoAno(cartaoAnoR.data || [])

    // Saldos contas — igual ao Dashboard
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

    // Dívidas — exatamente igual ao Endividamento.tsx
    const divData = (diviR.data || []).filter((m: any) => parseP(m.numero_parcela).total > 1)
    // Agrupa por grupo_id
    const porGrupoId: Record<string, any[]> = {}
    for (const m of divData) {
      if (!porGrupoId[m.grupo_id]) porGrupoId[m.grupo_id] = []
      porGrupoId[m.grupo_id].push(m)
    }
    // Para cada grupo_id calcula pendentes com mesma regra do Endividamento
    const grupos = Object.values(porGrupoId).map((ps: any[]) => {
      ps.sort((a: any, b: any) => parseP(a.numero_parcela).atual - parseP(b.numero_parcela).atual)
      const p0        = ps[0]
      const isCredito = !!p0.cartao_id
      const catNome   = p0.categorias?.nome || null
      const isParc    = !isCredito && (catNome || "").toLowerCase() === "parcelamento"
      // Pendentes = situacao Pendente (filtro padrão do Endividamento)
      const foiQuitada = (p: any) => isCredito
        ? (p.situacao === "Faturado" || p.situacao === "Pago")
        : p.situacao === "Pago"
      const pendentes = ps.filter((p: any) => p.situacao === "Pendente")
      if (pendentes.length === 0) return null
      return {
        chave: isCredito
          ? `${p0.cartao_id}||${p0.descricao.trim().toLowerCase()}`
          : p0.descricao.trim().toLowerCase(),
        descricao:   p0.descricao,
        isCredito,
        isParc,
        pendentes:   pendentes.length,
        valorParcela: p0.valor,
        valorRestante: p0.valor * pendentes.length,
        pagas: ps.filter(foiQuitada).length,
        total: parseP(p0.numero_parcela).total,
      }
    }).filter(Boolean)

    // Agrupa por chave (mesmo nome = mesma dívida, como o Endividamento faz)
    const porChave: Record<string, any[]> = {}
    for (const g of grupos as any[]) {
      if (!porChave[g.chave]) porChave[g.chave] = []
      porChave[g.chave].push(g)
    }
    const divAtivas = Object.values(porChave).map((gs: any[]) => ({
      descricao:    gs[0].descricao,
      isCredito:    gs[0].isCredito,
      isParc:       gs[0].isParc,
      pendentes:    gs.reduce((s, g) => s + g.pendentes, 0),
      valorParcela: gs[0].valorParcela,
      valorRestante: gs.reduce((s, g) => s + g.valorRestante, 0),
    }))
    setDividas(divAtivas)
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos Dashboard ────────────────────────────────────────────────────
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

  // ── Cálculos Dívidas ──────────────────────────────────────────────────────
  const totalDividas      = dividas.reduce((s,d) => s + d.valorRestante, 0)
  const totalDivCredito   = dividas.filter(d => d.isCredito).reduce((s,d) => s + d.valorRestante, 0)
  const totalDivDebito    = dividas.filter(d => !d.isCredito && !d.isParc).reduce((s,d) => s + d.valorRestante, 0)
  const totalDivParc      = dividas.filter(d => d.isParc).reduce((s,d) => s + d.valorRestante, 0)
  const qtdCartoes        = [...new Set(dividas.filter(d => d.isCredito).map(d => d.descricao))].length

  // ── Cálculos Alertas ──────────────────────────────────────────────────────
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

  const limitesEstourados = useMemo(() => {
    const gastos: Record<number, number> = {}
    for (const m of movsMes) {
      if (!m.categoria_id) continue
      if (m.situacao === "Pago" || (m.situacao === "Pendente" && m.numero_parcela === "Parcela 1/1"))
        gastos[m.categoria_id] = (gastos[m.categoria_id]||0) + Number(m.valor)
    }
    return categorias.filter(c => c.limite_gastos > 0 && (gastos[c.id]||0) > c.limite_gastos)
      .map(c => ({ nome: c.nome, gasto: gastos[c.id]||0, limite: c.limite_gastos, pct: Math.round((gastos[c.id]||0)/c.limite_gastos*100) }))
  }, [movsMes, categorias])

  // ── Gráficos ──────────────────────────────────────────────────────────────
  const dadosReceitas = useMemo(() => Array.from({length:12}, (_,i) => ({
    label: MESES_CURTOS[i],
    valor: movsAno.filter(m => {
      const mm = m.data_movimentacao ? parseInt(m.data_movimentacao.substring(5,7)) : 0
      return m.tipo === "Receita" && m.situacao === "Pago" && mm === i+1 && m.metodo_pagamento !== "Transferência entre Contas"
    }).reduce((s,m) => s+Number(m.valor),0)
  })), [movsAno])

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

  const primeiroCartao = cartoes[0]
  const dadosCartao = useMemo(() => Array.from({length:12}, (_,i) => ({
    label: MESES_CURTOS[i],
    valor: movsCartaoAno.filter(m => {
      if (!m.data_pagamento) return false
      const mf = parseInt(m.data_pagamento.substring(5,7))
      const af = parseInt(m.data_pagamento.substring(0,4))
      return m.cartao_id === primeiroCartao?.id && mf === i+1 && af === anoAtual && ["Faturado","Pendente","Previsto"].includes(m.situacao)
    }).reduce((s,m) => s+Number(m.valor),0)
  })), [movsCartaoAno, primeiroCartao])

  // ── Estilos ───────────────────────────────────────────────────────────────
  const card = (borda: string): React.CSSProperties => ({
    background: "#fff", borderRadius: 12, padding: "16px 18px",
    border: "1px solid #e2e8f0", borderLeft: `4px solid ${borda}`,
  })
  const cardPlain: React.CSSProperties = {
    background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e2e8f0",
  }

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f5f0e8", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ color:"#6b7280", fontSize:15 }}>Carregando visão geral...</div>
    </div>
  )

  return (
    <div style={{ background:"#f5f0e8", minHeight:"100vh", fontFamily:"'Segoe UI', system-ui, sans-serif", padding:"28px 32px" }}>

      {/* ── Título ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, color:"#1a2332", margin:0 }}>Visão Geral</h1>
          <p style={{ color:"#6b7280", fontSize:13, margin:"4px 0 0" }}>{mesFormatado}</p>
        </div>
        <button onClick={fetchDados} style={{ fontSize:13, color:"#0d7280", background:"none", border:"1px solid #0d7280", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontWeight:600 }}>
          ↻ Atualizar
        </button>
      </div>

      {/* ── Cards resumo Dashboard ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
        <div style={card("#6ee7b7")}>
          <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>Saldo em Contas</div>
          <div style={{ fontSize:22, fontWeight:700, color: totalSaldo>=0 ? "#065f46" : "#991b1b", margin:"8px 0 2px" }}>{fmt(totalSaldo)}</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Contas correntes ativas</div>
        </div>
        <div style={card("#93c5fd")}>
          <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>Receitas do Mês</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#111827", margin:"8px 0 2px" }}>{fmt(totalReceitas)}</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Pagamentos recebidos</div>
        </div>
        <div style={card("#fca5a5")}>
          <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>Despesas do Mês</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#111827", margin:"8px 0 2px" }}>{fmt(totalDespesas)}</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Pago + Pendente à vista</div>
        </div>
        <div style={card("#c4b5fd")}>
          <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.05em" }}>Despesas Cartão Crédito</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#111827", margin:"8px 0 2px" }}>{fmt(totalCartao)}</div>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Todas as compras no crédito</div>
        </div>
      </div>

      {/* ── Contas + Cartões ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
        {/* Contas Correntes */}
        <div style={cardPlain}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>🏦 Contas Correntes</div>
            <div style={{ fontSize:14, fontWeight:700, color: totalSaldo>=0 ? "#065f46" : "#991b1b" }}>{fmt(totalSaldo)}</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:10 }}>
            {contas.filter(c => c.tipo === "corrente").map(c => {
              const saldo = saldosContas[c.id] ?? 0
              const logo  = logoBanco(c.nome)
              return (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#f5f0e8", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:logo.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:logo.color, flexShrink:0 }}>{logo.sigla}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.nome}</div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>Conta corrente</div>
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, color: saldo>=0 ? "#065f46" : "#991b1b", whiteSpace:"nowrap" }}>{fmt(saldo)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cartões de Crédito */}
        <div style={cardPlain}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>💳 Cartões de Crédito</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>{cartoes.length} cartão(ões)</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:10 }}>
            {cartoes.map(c => {
              const usado = compCartoes[c.id] || 0
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
                      <div style={{ fontSize:10, color:"#6b7280" }}>Vence dia {c.data_vencimento}</div>
                    </div>
                    <div style={{ textAlign:"right" as const }}>
                      <div style={{ fontSize:12, fontWeight:700, color: disp>=0 ? "#065f46" : "#991b1b" }}>{fmt(disp)}</div>
                      <div style={{ fontSize:9, color:"#9ca3af" }}>disponível</div>
                    </div>
                  </div>
                  <div style={{ background:"#e2e8f0", borderRadius:99, height:5 }}>
                    <div style={{ background:cor, borderRadius:99, height:5, width:`${Math.min(pct,100)}%` }} />
                  </div>
                  <div style={{ fontSize:10, color:cor, fontWeight:700, marginTop:3 }}>{pct.toFixed(0)}% usado · {fmt(usado)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 3 Gráficos ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:24 }}>
        <div style={cardPlain}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>📈 Receitas {anoAtual}</div>
          <div style={{ fontSize:11, color:"#9ca3af", margin:"2px 0 8px" }}>Mês a mês — Pago</div>
          <MiniGrafico dados={dadosReceitas} cor="#2563eb" />
        </div>
        <div style={cardPlain}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>📉 Despesas {anoAtual}</div>
          <div style={{ fontSize:11, color:"#9ca3af", margin:"2px 0 8px" }}>Mês a mês{metaDespesas > 0 ? ` · Meta ${fmt(metaDespesas)}` : ""}</div>
          <MiniGrafico dados={dadosDespesas} cor="#ef4444" meta={metaDespesas || undefined} />
        </div>
        <div style={cardPlain}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>💳 {primeiroCartao?.nome || "Cartão"} {anoAtual}</div>
          <div style={{ fontSize:11, color:"#9ca3af", margin:"2px 0 8px" }}>Faturas mês a mês</div>
          <MiniGrafico dados={dadosCartao} cor="#7c3aed" />
        </div>
      </div>

      {/* ── Alertas + Endividamento ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

        {/* Alertas */}
        <div style={cardPlain}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#111827" }}>🔔 Alertas</div>
            {(vencidos.length + proximos5.length + limitesEstourados.length) > 0 && (
              <span style={{ fontSize:11, fontWeight:700, background:"#ef4444", color:"#fff", borderRadius:99, padding:"2px 10px" }}>
                {vencidos.length + proximos5.length + limitesEstourados.length} ativos
              </span>
            )}
          </div>

          {/* Resumo vencidos/proximos */}
          {(vencidos.length > 0 || proximos5.length > 0) && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <div style={{ background:"#fff", border:"1px solid #fecaca", borderLeft:"4px solid #ef4444", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#ef4444", textTransform:"uppercase" as const }}>Vencido</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#111827", margin:"4px 0 2px" }}>{fmt(vencidos.reduce((s,m)=>s+Number(m.valor),0))}</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>{vencidos.length} lançamento{vencidos.length !== 1 ? "s" : ""} em atraso</div>
              </div>
              <div style={{ background:"#fff", border:"1px solid #fde68a", borderLeft:"4px solid #f59e0b", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#f59e0b", textTransform:"uppercase" as const }}>Vence em 5 dias</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#111827", margin:"4px 0 2px" }}>{fmt(proximos5.reduce((s,m)=>s+Number(m.valor),0))}</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>{proximos5.length} lançamento{proximos5.length !== 1 ? "s" : ""} a vencer</div>
              </div>
            </div>
          )}

          {/* Lista vencidos */}
          {vencidos.length > 0 && (
            <div style={{ background:"#fff5f5", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #ef4444", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#ef4444", marginBottom:6 }}>🚨 Vencidos ({vencidos.length})</div>
              {vencidos.slice(0,4).map((m:any) => (
                <div key={m.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"3px 0" }}>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"65%" }}>{m.descricao}</span>
                  <span style={{ fontWeight:700, color:"#ef4444", whiteSpace:"nowrap" }}>{fmt(Number(m.valor))}</span>
                </div>
              ))}
              {vencidos.length > 4 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{vencidos.length-4} mais</div>}
            </div>
          )}

          {/* Lista próximos */}
          {proximos5.length > 0 && (
            <div style={{ background:"#fffbeb", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #f59e0b", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#f59e0b", marginBottom:6 }}>⏰ Vencem em 5 dias ({proximos5.length})</div>
              {proximos5.slice(0,4).map((m:any) => (
                <div key={m.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"3px 0" }}>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"65%" }}>{m.descricao}</span>
                  <span style={{ fontWeight:700, color:"#f59e0b", whiteSpace:"nowrap" }}>{fmt(Number(m.valor))}</span>
                </div>
              ))}
              {proximos5.length > 4 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{proximos5.length-4} mais</div>}
            </div>
          )}

          {/* Limites estourados */}
          {limitesEstourados.length > 0 && (
            <div style={{ background:"#fdf4ff", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #7c3aed" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#7c3aed", marginBottom:8 }}>💸 Limites estourados ({limitesEstourados.length})</div>
              {limitesEstourados.map((c:any,i:number) => (
                <div key={i} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", marginBottom:3 }}>
                    <span style={{ fontWeight:500 }}>{c.nome}</span>
                    <span style={{ fontWeight:700, color:"#7c3aed" }}>{c.pct}% · {fmt(c.gasto)} / {fmt(c.limite)}</span>
                  </div>
                  <div style={{ background:"#e9d5ff", borderRadius:99, height:5 }}>
                    <div style={{ background:"#7c3aed", width:"100%", height:5, borderRadius:99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {vencidos.length === 0 && proximos5.length === 0 && limitesEstourados.length === 0 && (
            <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center" as const, padding:"24px 0" }}>✅ Nenhum alerta ativo</div>
          )}
        </div>

        {/* Endividamento */}
        <div style={cardPlain}>
          <div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:16 }}>💰 Endividamento</div>

          {/* 4 cards resumo — igual ao Endividamento.tsx */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:14 }}>
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, color:"#6b7280", marginBottom:6 }}>Total em Dívidas</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#1a2332" }}>{fmt(totalDividas)}</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{dividas.length} parcelamento(s)</div>
            </div>
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderLeft:"4px solid #e05252", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, color:"#6b7280", marginBottom:6 }}>💳 Crédito</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#e05252" }}>{fmt(totalDivCredito)}</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{qtdCartoes} cartão(ões)</div>
            </div>
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderLeft:"4px solid #4a9eff", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, color:"#6b7280", marginBottom:6 }}>🏦 Débito / PIX</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#4a9eff" }}>{fmt(totalDivDebito)}</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{dividas.filter(d=>!d.isCredito&&!d.isParc).length} item(s)</div>
            </div>
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderLeft:"4px solid #9b59b6", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, color:"#6b7280", marginBottom:6 }}>📋 Parcelamento</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#9b59b6" }}>{fmt(totalDivParc)}</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{dividas.filter(d=>d.isParc).length} item(s)</div>
            </div>
          </div>

          {/* Lista crédito */}
          {dividas.filter(d=>d.isCredito).length > 0 && (
            <div style={{ background:"#fff5f5", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #e05252", marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#e05252", marginBottom:6 }}>
                💳 Crédito — {fmt(totalDivCredito)}
              </div>
              {dividas.filter(d=>d.isCredito).slice(0,4).map((d:any,i:number) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"3px 0" }}>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%" }}>{d.descricao}</span>
                  <span style={{ fontWeight:700, color:"#e05252", whiteSpace:"nowrap" }}>{d.pendentes}x {fmt(d.valorParcela)}</span>
                </div>
              ))}
              {dividas.filter(d=>d.isCredito).length > 4 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{dividas.filter(d=>d.isCredito).length-4} mais</div>}
            </div>
          )}

          {/* Lista débito+parcelamento */}
          {dividas.filter(d=>!d.isCredito).length > 0 && (
            <div style={{ background:"#eff6ff", borderRadius:10, padding:"10px 14px", borderLeft:"3px solid #4a9eff" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#4a9eff", marginBottom:6 }}>
                🏦 Débito / Parcelamento — {fmt(totalDivDebito + totalDivParc)}
              </div>
              {dividas.filter(d=>!d.isCredito).slice(0,4).map((d:any,i:number) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", padding:"3px 0" }}>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"60%" }}>{d.descricao}</span>
                  <span style={{ fontWeight:700, color:"#4a9eff", whiteSpace:"nowrap" }}>{d.pendentes}x {fmt(d.valorParcela)}</span>
                </div>
              ))}
              {dividas.filter(d=>!d.isCredito).length > 4 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>+{dividas.filter(d=>!d.isCredito).length-4} mais</div>}
            </div>
          )}

          {dividas.length === 0 && (
            <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center" as const, padding:"24px 0" }}>🎉 Nenhuma dívida ativa</div>
          )}
        </div>
      </div>
    </div>
  )
}
