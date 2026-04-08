import { useEffect, useState, useCallback, useMemo } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]

const hoje     = new Date(); hoje.setHours(0,0,0,0)
const mesAtual = hoje.getMonth() + 1
const anoAtual = hoje.getFullYear()
const mesAnterior  = mesAtual === 1 ? 12 : mesAtual - 1
const anoAnterior  = mesAtual === 1 ? anoAtual - 1 : anoAtual
const mesFormatado = (hoje.toLocaleString("pt-BR", { month: "long", year: "numeric" })).replace(/^\w/, c => c.toUpperCase())

function diasAte(dataStr: string) {
  const d = new Date(dataStr + "T00:00:00")
  return Math.round((d.getTime() - hoje.getTime()) / 86400000)
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
  if (n.includes("havan"))     return { bg: "#003087", color: "#fff", sigla: "HAV" }
  if (n.includes("pernambucanas")) return { bg: "#E30613", color: "#fff", sigla: "PER" }
  return { bg: "#e5e7eb", color: "#374151", sigla: nome.replace(/[^a-zA-Z]/g,"").slice(0,3).toUpperCase() }
}

function parseP(s: string) {
  const m = s?.match(/Parcela (\d+)\/(\d+)/i)
  return m ? { atual: +m[1], total: +m[2] } : { atual: 0, total: 0 }
}

// ── Variação com seta e cor ───────────────────────────────────────────────────
function Variacao({ atual, anterior, boaSeSubir = false }: { atual: number; anterior: number; boaSeSubir?: boolean }) {
  if (anterior === 0) return null
  const pct   = ((atual - anterior) / anterior) * 100
  const subiu = pct >= 0
  const bom   = boaSeSubir ? subiu : !subiu
  const sinal = pct >= 0 ? "+" : ""
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:12, fontWeight:700, color: bom ? "#16a34a" : "#ef4444", marginLeft:8 }}>
      {subiu ? "▲" : "▼"} {sinal}{pct.toFixed(1)}%
    </span>
  )
}

// ── Mini gráfico ──────────────────────────────────────────────────────────────
function MiniGrafico({ dados, cor, meta }: { dados: { label: string; valor: number }[]; cor: string; meta?: number }) {
  const max = Math.max(...dados.map(d => d.valor), meta || 0, 1) * 1.15
  const H = 90
  return (
    <svg width="100%" height={H+20} viewBox={`0 0 ${dados.length*36} ${H+20}`} preserveAspectRatio="none">
      {meta && <line x1={0} y1={H-(meta/max)*H} x2={dados.length*36} y2={H-(meta/max)*H} stroke={cor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}/>}
      {dados.map((d,i) => {
        const h = Math.max((d.valor/max)*H, d.valor>0?3:0)
        const c = meta ? (d.valor>meta?"#ef4444":"#16a34a") : cor
        return (
          <g key={i}>
            <rect x={i*36+6} y={H-h} width={24} height={h} fill={c} rx={3}/>
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
  const [householdId, setHouseholdId] = useState<string|null>(null)
  const [loading, setLoading]         = useState(true)
  const [contas,      setContas]      = useState<any[]>([])
  const [cartoes,     setCartoes]     = useState<any[]>([])
  const [categorias,  setCategorias]  = useState<any[]>([])
  const [movsMes,     setMovsMes]     = useState<any[]>([])
  const [movsMesAnt,  setMovsMesAnt]  = useState<any[]>([])
  const [movsAno,     setMovsAno]     = useState<any[]>([])
  const [movsCartaoAno, setMovsCartaoAno] = useState<any[]>([])
  const [saldosContas,  setSaldosContas]  = useState<Record<number,number>>({})
  const [compCartoes,   setCompCartoes]   = useState<Record<number,number>>({})
  const [dividas,       setDividas]       = useState<any[]>([])
  const [movsAll,       setMovsAll]       = useState<any[]>([])  // todas despesas (para alertas)
  const [cartaoGrafico, setCartaoGrafico] = useState<number|null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from("households").select("id").eq("owner_id", user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    const mesStr     = String(mesAtual).padStart(2,"0")
    const mesAntStr  = String(mesAnterior).padStart(2,"0")
    const dataIni    = `${anoAtual}-${mesStr}-01`
    const dataFim    = `${anoAtual}-${mesStr}-${new Date(anoAtual,mesAtual,0).getDate()}`
    const dataIniAnt = `${anoAnterior}-${mesAntStr}-01`
    const dataFimAnt = `${anoAnterior}-${mesAntStr}-${new Date(anoAnterior,mesAnterior,0).getDate()}`

    const [contasR,cartoesR,catsR,mesR,mesAntR,anoR,cartaoAnoR,todasR,pendCartR,diviR,movsAllR] = await Promise.all([
      supabase.from("contas").select("id,nome,saldo_inicial,tipo").eq("household_id",householdId).eq("ativo",true),
      supabase.from("cartoes").select("id,nome,limite_total,data_vencimento").eq("household_id",householdId).eq("ativo",true),
      supabase.from("categorias").select("id,nome,limite_gastos,classificacao").eq("household_id",householdId),
      // Mês atual
      supabase.from("movimentacoes").select("id,tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,categoria_id,descricao")
        .eq("household_id",householdId).gte("data_movimentacao",dataIni).lte("data_movimentacao",dataFim),
      // Mês anterior
      supabase.from("movimentacoes").select("tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,cartao_id")
        .eq("household_id",householdId).gte("data_movimentacao",dataIniAnt).lte("data_movimentacao",dataFimAnt),
      // Ano inteiro (gráficos)
      supabase.from("movimentacoes").select("tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,cartao_id")
        .eq("household_id",householdId).gte("data_movimentacao",`${anoAtual}-01-01`).lte("data_movimentacao",`${anoAtual}-12-31`),
      // Cartão ano por data_pagamento
      supabase.from("movimentacoes").select("cartao_id,valor,situacao,data_pagamento")
        .eq("household_id",householdId).eq("tipo","Despesa").not("cartao_id","is",null)
        .gte("data_pagamento",`${anoAtual}-01-01`).lte("data_pagamento",`${anoAtual}-12-31`),
      // Todas pagas (saldo contas)
      supabase.from("movimentacoes").select("conta_origem_destino,tipo,valor,situacao").eq("household_id",householdId).eq("situacao","Pago"),
      // Pendentes cartões (comprometido)
      supabase.from("movimentacoes").select("cartao_id,valor").eq("household_id",householdId).eq("situacao","Pendente")
        .not("cartao_id","is",null).gte("data_pagamento",hoje.toISOString().split("T")[0]),
      // Dívidas parceladas
      supabase.from("movimentacoes").select("id,descricao,valor,situacao,numero_parcela,data_pagamento,cartao_id,grupo_id,conta_origem_destino,categoria_id,categorias(nome),cartoes(nome)")
        .eq("household_id",householdId).eq("tipo","Despesa").not("numero_parcela","is",null).not("grupo_id","is",null)
        .order("data_pagamento",{ascending:true}),
      // TODAS despesas pendente+pago (para alertas — SEM filtro de mês, igual ao Alertas.tsx)
      supabase.from("movimentacoes").select("id,tipo,situacao,descricao,valor,data_movimentacao,data_pagamento,metodo_pagamento,cartao_id,categoria_id,numero_parcela")
        .eq("household_id",householdId).eq("tipo","Despesa").in("situacao",["Pendente","Pago"]),
    ])

    const conts = contasR.data || []
    setContas(conts)
    setCartoes(cartoesR.data || [])
    setCategorias(catsR.data || [])
    setMovsMes(mesR.data || [])
    setMovsMesAnt(mesAntR.data || [])
    setMovsAno(anoR.data || [])
    setMovsCartaoAno(cartaoAnoR.data || [])
    setMovsAll(movsAllR.data || [])
    if (cartoesR.data?.length) setCartaoGrafico(cartoesR.data[0].id)

    // Saldos contas
    const saldos: Record<number,number> = {}
    for (const c of conts) {
      let s = Number(c.saldo_inicial)||0
      for (const m of todasR.data||[]) {
        if (m.conta_origem_destino !== c.nome) continue
        if (m.tipo === "Receita") s += Number(m.valor)
        else if (m.tipo === "Despesa") s -= Number(m.valor)
        else if (m.tipo === "Transferência") s -= Number(m.valor)
      }
      saldos[c.id] = s
    }
    setSaldosContas(saldos)

    // Comprometido cartões
    const comp: Record<number,number> = {}
    for (const m of pendCartR.data||[]) {
      if (!m.cartao_id) continue
      comp[m.cartao_id] = (comp[m.cartao_id]||0) + Number(m.valor)
    }
    setCompCartoes(comp)

    // Dívidas — cópia fiel do Endividamento.tsx
    const divData = (diviR.data||[]).filter((m:any) => parseP(m.numero_parcela).total > 1)

    // Passo 1: agrupar por grupo_id
    const porGrupoId: Record<string,any[]> = {}
    for (const m of divData) {
      if (!porGrupoId[m.grupo_id]) porGrupoId[m.grupo_id] = []
      porGrupoId[m.grupo_id].push(m)
    }

    // Passo 2: para cada grupo_id calcular metadados — igual Endividamento.tsx
    const grupos = Object.entries(porGrupoId).map(([, parcelas]:any) => {
      parcelas.sort((a:any,b:any) => parseP(a.numero_parcela).atual - parseP(b.numero_parcela).atual)
      const p0        = parcelas[0]
      const isCredito = !!p0.cartao_id || p0.metodo_pagamento === 'Crédito'
      const catNome   = p0.categorias?.nome || null
      const isParc    = !isCredito && (catNome||'').toLowerCase() === 'parcelamento'
      const cartaoNome = p0.cartoes?.nome || null
      const foiQuit   = (p:any) => isCredito
        ? (p.situacao === 'Faturado' || p.situacao === 'Pago')
        : p.situacao === 'Pago'
      // filtroSit fixo = 'pendente' (igual ao default do Endividamento)
      const pendentes = parcelas.filter((p:any) => p.situacao === 'Pendente')
      const pagas     = parcelas.filter(foiQuit).length
      const { total } = parseP(p0.numero_parcela)
      return { p0, parcelas, isCredito, isParc, cartaoNome, catNome, pendentes, pagas, total }
    }).filter((g:any) => g.pendentes.length > 0)

    // Passo 3: agrupar por chave descricao — igual Endividamento.tsx
    const porDesc: Record<string,any[]> = {}
    for (const g of grupos) {
      const chave = g.isCredito
        ? `${g.cartaoNome}||${g.p0.descricao.trim().toLowerCase()}`
        : g.p0.descricao.trim().toLowerCase()
      if (!porDesc[chave]) porDesc[chave] = []
      porDesc[chave].push(g)
    }

    // Passo 4: montar objeto final — IGUAL ao Endividamento.tsx
    setDividas(Object.entries(porDesc).map(([, gs]:any) => {
      const totalParcelas = gs.reduce((s:number,g:any) => s + g.total, 0)
      const totalPagas    = gs.reduce((s:number,g:any) => s + g.pagas, 0)
      const totalPend     = gs.reduce((s:number,g:any) => s + g.pendentes.length, 0)
      const p0            = gs[0].p0
      return {
        descricao:    p0.descricao,
        isCredito:    gs[0].isCredito,
        isParc:       gs[0].isParc,
        cartaoNome:   gs[0].cartaoNome,
        pendentes:    totalPend,
        valorParcela: p0.valor,
        // IGUAL ao Endividamento: p0.valor * totalPend
        valorRestante: p0.valor * totalPend,
        totalParcelas,
        totalPagas,
      }
    }))

    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos mês atual ────────────────────────────────────────────────────
  const totalReceitas = useMemo(() =>
    movsMes.filter(m=>m.tipo==="Receita"&&["Pago","Pendente"].includes(m.situacao)&&m.metodo_pagamento!=="Transferência entre Contas")
      .reduce((s,m)=>s+Number(m.valor),0),[movsMes])

  const totalDespesas = useMemo(() =>
    movsMes.filter(m=>m.tipo==="Despesa"&&["Pago","Pendente"].includes(m.situacao)&&!m.cartao_id)
      .reduce((s,m)=>s+Number(m.valor),0),[movsMes])

  const totalCartao = useMemo(() =>
    movsMes.filter(m=>m.tipo==="Despesa"&&["Pago","Pendente"].includes(m.situacao)&&m.cartao_id)
      .reduce((s,m)=>s+Number(m.valor),0),[movsMes])

  const totalSaldo    = contas.filter(c=>c.tipo==="corrente").reduce((s,c)=>s+(saldosContas[c.id]||0),0)
  const totalSaldoInv = contas.filter(c=>c.tipo==="investimento").reduce((s,c)=>s+(saldosContas[c.id]||0),0)

  // ── Cálculos mês anterior ─────────────────────────────────────────────────
  const totalReceitasAnt = useMemo(() =>
    movsMesAnt.filter(m=>m.tipo==="Receita"&&["Pago","Pendente"].includes(m.situacao)&&m.metodo_pagamento!=="Transferência entre Contas")
      .reduce((s,m)=>s+Number(m.valor),0),[movsMesAnt])

  const totalDespesasAnt = useMemo(() =>
    movsMesAnt.filter(m=>m.tipo==="Despesa"&&["Pago","Pendente"].includes(m.situacao)&&!m.cartao_id)
      .reduce((s,m)=>s+Number(m.valor),0),[movsMesAnt])

  const totalCartaoAnt = useMemo(() =>
    movsMesAnt.filter(m=>m.tipo==="Despesa"&&["Pago","Pendente"].includes(m.situacao)&&m.cartao_id)
      .reduce((s,m)=>s+Number(m.valor),0),[movsMesAnt])

  // ── Cards de fluxo — USA movsAll SEM filtro de mês (igual Alertas.tsx) ───
  // Vencidos = Pendente + diasAte < 0
  // Vencendo hoje = Pendente + diasAte === 0
  // Futuro 14 dias = Pendente + diasAte > 0 && <= 14
  const fluxo = useMemo(() => {
    const pendentes = movsAll.filter(m =>
      m.situacao === "Pendente" &&
      m.metodo_pagamento !== "Transferência entre Contas"
    )

    const vencidos:   any[] = []
    const hoje14:     any[] = []
    const futuro14:   any[] = []

    for (const m of pendentes) {
      const ref  = m.data_pagamento || m.data_movimentacao
      if (!ref) continue
      const dias = diasAte(ref)
      if (dias < 0)              vencidos.push(m)
      else if (dias === 0)       hoje14.push(m)
      else if (dias <= 14)       futuro14.push(m)
    }

    const somaDesp = (arr:any[]) => arr.reduce((s,m)=>s+Number(m.valor),0)
    const cnt      = (arr:any[]) => arr.length

    return [
      { titulo:"Vencidos",  sub:"Pendentes em atraso",   cor:"#ef4444", arr:vencidos, soma:somaDesp(vencidos), qtd:cnt(vencidos) },
      { titulo:"Vencendo",  sub:"hoje",                  cor:"#f59e0b", arr:hoje14,   soma:somaDesp(hoje14),   qtd:cnt(hoje14)   },
      { titulo:"Futuro",    sub:"Próximos 14 dias",      cor:"#0d7280", arr:futuro14, soma:somaDesp(futuro14), qtd:cnt(futuro14) },
    ]
  }, [movsAll])

  // ── Limites por categoria ─────────────────────────────────────────────────
  const limitesCats = useMemo(() => {
    const gastos: Record<number,number> = {}
    for (const m of movsMes) {
      if (!m.categoria_id) continue
      if (m.situacao==="Pago"||(m.situacao==="Pendente"&&m.numero_parcela==="Parcela 1/1"))
        gastos[m.categoria_id] = (gastos[m.categoria_id]||0)+Number(m.valor)
    }
    return categorias
      .filter(c=>c.limite_gastos>0&&gastos[c.id]>0)
      .map(c=>({ nome:c.nome, gasto:gastos[c.id]||0, limite:c.limite_gastos, pct:Math.round((gastos[c.id]||0)/c.limite_gastos*100) }))
      .sort((a,b)=>b.pct-a.pct)
  }, [movsMes,categorias])

  // ── Gráficos ──────────────────────────────────────────────────────────────
  const dadosReceitas = useMemo(() => Array.from({length:12},(_,i)=>({
    label:MESES_CURTOS[i],
    valor:movsAno.filter(m=>{
      const mm=parseInt(m.data_movimentacao?.substring(5,7)||"0")
      return m.tipo==="Receita"&&m.situacao==="Pago"&&mm===i+1&&m.metodo_pagamento!=="Transferência entre Contas"
    }).reduce((s,m)=>s+Number(m.valor),0)
  })),[movsAno])

  const dadosDespesas = useMemo(() => Array.from({length:12},(_,i)=>({
    label:MESES_CURTOS[i],
    valor:movsAno.filter(m=>{
      const mm=parseInt(m.data_movimentacao?.substring(5,7)||"0")
      return m.tipo==="Despesa"&&mm===i+1&&(m.situacao==="Pago"||(m.situacao==="Pendente"&&m.numero_parcela==="Parcela 1/1"))
    }).reduce((s,m)=>s+Number(m.valor),0)
  })),[movsAno])

  const metaDespesas = useMemo(() =>
    categorias.filter(c=>!["Renda Ativa","Renda Passiva"].includes(c.classificacao)&&c.limite_gastos>0)
      .reduce((s,c)=>s+c.limite_gastos,0),[categorias])

  const dadosCartao = useMemo(() => Array.from({length:12},(_,i)=>({
    label:MESES_CURTOS[i],
    valor:movsCartaoAno.filter(m=>{
      if(!m.data_pagamento) return false
      const mf=parseInt(m.data_pagamento.substring(5,7))
      const af=parseInt(m.data_pagamento.substring(0,4))
      return m.cartao_id===cartaoGrafico&&mf===i+1&&af===anoAtual&&["Faturado","Pendente","Previsto"].includes(m.situacao)
    }).reduce((s,m)=>s+Number(m.valor),0)
  })),[movsCartaoAno,cartaoGrafico])

  // ── Dívidas ───────────────────────────────────────────────────────────────
  const totalDividas    = dividas.reduce((s,d)=>s+d.valorRestante,0)
  const totalDivCredito = dividas.filter(d=>d.isCredito).reduce((s,d)=>s+d.valorRestante,0)
  const totalDivDebito  = dividas.filter(d=>!d.isCredito&&!d.isParc).reduce((s,d)=>s+d.valorRestante,0)
  const totalDivParc    = dividas.filter(d=>d.isParc).reduce((s,d)=>s+d.valorRestante,0)
  const cartaoNomeGraf  = cartoes.find(c=>c.id===cartaoGrafico)?.nome||"Cartão"

  const S: React.CSSProperties = { background:"#fff", borderRadius:12, padding:"18px 20px", border:"1px solid #e2e8f0" }

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f5f0e8",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{color:"#6b7280",fontSize:15}}>Carregando visão geral...</div>
    </div>
  )

  return (
    <div style={{background:"#f5f0e8",minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:"28px 32px"}}>

      {/* ── Título ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:"#1a2332",margin:0}}>Visão Geral</h1>
          <p style={{color:"#6b7280",fontSize:13,margin:"4px 0 0"}}>{mesFormatado}</p>
        </div>
        <button onClick={fetchDados} style={{fontSize:13,color:"#0d7280",background:"none",border:"1px solid #0d7280",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:600}}>
          ↻ Atualizar
        </button>
      </div>

      {/* ── Cards resumo com variação ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
        {/* Saldo */}
        <div style={{...S,borderLeft:"4px solid #6ee7b7"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.05em"}}>Saldo em Contas</div>
          <div style={{fontSize:22,fontWeight:700,color:totalSaldo>=0?"#065f46":"#991b1b",margin:"8px 0 2px"}}>{fmt(totalSaldo)}</div>
          <div style={{fontSize:11,color:"#9ca3af"}}>Contas correntes ativas</div>
        </div>
        {/* Receitas */}
        <div style={{...S,borderLeft:"4px solid #6ee7b7"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.05em"}}>Receitas do Mês</div>
          <div style={{fontSize:22,fontWeight:700,color:"#111827",margin:"8px 0 2px"}}>
            {fmt(totalReceitas)}
            <Variacao atual={totalReceitas} anterior={totalReceitasAnt} boaSeSubir={true}/>
          </div>
          <div style={{fontSize:11,color:"#9ca3af"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalReceitasAnt)}</div>
        </div>
        {/* Despesas */}
        <div style={{...S,borderLeft:"4px solid #fca5a5"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.05em"}}>Despesas do Mês</div>
          <div style={{fontSize:22,fontWeight:700,color:"#111827",margin:"8px 0 2px"}}>
            {fmt(totalDespesas)}
            <Variacao atual={totalDespesas} anterior={totalDespesasAnt} boaSeSubir={false}/>
          </div>
          <div style={{fontSize:11,color:"#9ca3af"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalDespesasAnt)}</div>
        </div>
        {/* Cartão */}
        <div style={{...S,borderLeft:"4px solid #fca5a5"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.05em"}}>Despesas Cartão Crédito</div>
          <div style={{fontSize:22,fontWeight:700,color:"#111827",margin:"8px 0 2px"}}>
            {fmt(totalCartao)}
            <Variacao atual={totalCartao} anterior={totalCartaoAnt} boaSeSubir={false}/>
          </div>
          <div style={{fontSize:11,color:"#9ca3af"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalCartaoAnt)}</div>
        </div>
      </div>

      {/* ── 3 Cards de fluxo ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
        {fluxo.map((f,i) => (
          <div key={i} style={{background:f.cor,borderRadius:12,padding:"16px 20px",color:"#fff"}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>
              {f.titulo} <span style={{fontSize:12,fontWeight:400,opacity:0.75}}>{f.sub}</span>
            </div>
            <div style={{fontSize:26,fontWeight:800,marginBottom:4}}>{fmt(f.soma)}</div>
            <div style={{fontSize:12,opacity:0.75}}>{f.qtd} lançamento{f.qtd!==1?"s":""} pendente{f.qtd!==1?"s":""}</div>
          </div>
        ))}
      </div>

      {/* ── Endividamento ── */}
      <div style={{...S, marginBottom:24}}>
        <div style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:16}}>💰 Endividamento</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          <div style={{background:"#f5f0e8",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"#6b7280",marginBottom:6}}>Total em Dívidas</div>
            <div style={{fontSize:20,fontWeight:800,color:"#1a2332"}}>{fmt(totalDividas)}</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{dividas.length} parcelamento(s)</div>
          </div>
          <div style={{background:"#fff5f5",border:"1px solid #fecaca",borderLeft:"4px solid #e05252",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"#6b7280",marginBottom:6}}>💳 Crédito</div>
            <div style={{fontSize:20,fontWeight:800,color:"#e05252"}}>{fmt(totalDivCredito)}</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{[...new Set(dividas.filter(d=>d.isCredito).map(d=>d.cartaoNome))].length} cartão(ões) · {dividas.filter(d=>d.isCredito).length} item(s)</div>
          </div>
          <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderLeft:"4px solid #4a9eff",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"#6b7280",marginBottom:6}}>🏦 Débito / PIX</div>
            <div style={{fontSize:20,fontWeight:800,color:"#4a9eff"}}>{fmt(totalDivDebito)}</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{dividas.filter(d=>!d.isCredito&&!d.isParc).length} item(s)</div>
          </div>
          <div style={{background:"#fdf4ff",border:"1px solid #e9d5ff",borderLeft:"4px solid #9b59b6",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"#6b7280",marginBottom:6}}>📋 Parcelamento</div>
            <div style={{fontSize:20,fontWeight:800,color:"#9b59b6"}}>{fmt(totalDivParc)}</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{dividas.filter(d=>d.isParc).length} item(s)</div>
          </div>
        </div>
      </div>


      {/* ── Contas + Cartões ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
        <div style={{display:"flex",flexDirection:"column" as const,gap:16}}>
          {/* Contas Correntes */}
          <div style={S}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>🏦 Contas Correntes</div>
              <div style={{fontSize:14,fontWeight:700,color:totalSaldo>=0?"#065f46":"#991b1b"}}>{fmt(totalSaldo)}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
              {contas.filter(c=>c.tipo==="corrente").map(c=>{
                const saldo=saldosContas[c.id]??0; const logo=logoBanco(c.nome)
                return (
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,background:"#f5f0e8",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#111827",wordBreak:"break-word"}}>{c.nome}</div>
                      <div style={{fontSize:11,color:"#9ca3af"}}>Conta corrente</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:saldo>=0?"#065f46":"#991b1b",whiteSpace:"nowrap"}}>{fmt(saldo)}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Investimentos */}
          {contas.filter(c=>c.tipo==="investimento").length > 0 && (
            <div style={S}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>📈 Investimentos</div>
                <div style={{fontSize:14,fontWeight:700,color:"#065f46"}}>{fmt(totalSaldoInv)}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
                {contas.filter(c=>c.tipo==="investimento").map(c=>{
                  const saldo=saldosContas[c.id]??0; const logo=logoBanco(c.nome)
                  return (
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,background:"#f0fdf4",borderRadius:10,padding:"10px 12px",border:"1px solid #bbf7d0"}}>
                      <div style={{width:36,height:36,borderRadius:8,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"#111827",wordBreak:"break-word"}}>{c.nome}</div>
                        <div style={{fontSize:11,color:"#16a34a"}}>Investimento</div>
                      </div>
                      <div style={{fontSize:13,fontWeight:700,color:"#065f46",whiteSpace:"nowrap"}}>{fmt(saldo)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={S}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>💳 Cartões de Crédito</div>
            <div style={{fontSize:12,color:"#6b7280"}}>{cartoes.length} cartão(ões)</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
            {cartoes.map(c=>{
              const usado=compCartoes[c.id]||0; const disp=c.limite_total-usado
              const pct=c.limite_total>0?(usado/c.limite_total)*100:0
              const cor=pct>80?"#ef4444":pct>50?"#f59e0b":"#10b981"
              const logo=logoBanco(c.nome)
              return (
                <div key={c.id} style={{background:"#f5f0e8",borderRadius:10,padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:32,height:32,borderRadius:7,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:"#111827",wordBreak:"break-word"}}>{c.nome}</div>
                      <div style={{fontSize:10,color:"#6b7280"}}>Vence dia {c.data_vencimento}</div>
                    </div>
                    <div style={{textAlign:"right" as const}}>
                      <div style={{fontSize:12,fontWeight:700,color:disp>=0?"#065f46":"#991b1b"}}>{fmt(disp)}</div>
                      <div style={{fontSize:9,color:"#9ca3af"}}>disponível</div>
                    </div>
                  </div>
                  <div style={{background:"#e2e8f0",borderRadius:99,height:5}}>
                    <div style={{background:cor,borderRadius:99,height:5,width:`${Math.min(pct,100)}%`}}/>
                  </div>
                  <div style={{fontSize:10,color:cor,fontWeight:700,marginTop:3}}>{pct.toFixed(0)}% usado · {fmt(usado)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 3 Gráficos ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24}}>
        <div style={S}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>📈 Receitas {anoAtual}</div>
          <div style={{fontSize:11,color:"#9ca3af",margin:"2px 0 6px"}}>Mês a mês — Pago</div>
          <MiniGrafico dados={dadosReceitas} cor="#16a34a"/>
        </div>
        <div style={S}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>📉 Despesas {anoAtual}</div>
          <div style={{fontSize:11,color:"#9ca3af",margin:"2px 0 6px"}}>Mês a mês{metaDespesas>0?` · Meta ${fmt(metaDespesas)}`:""}</div>
          <MiniGrafico dados={dadosDespesas} cor="#ef4444" meta={metaDespesas||undefined}/>
        </div>
        <div style={S}>
          <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>💳 Cartão {anoAtual}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",margin:"4px 0"}}>
            {cartoes.map(c=>(
              <button key={c.id} onClick={()=>setCartaoGrafico(c.id)} style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,cursor:"pointer",border:"none",background:cartaoGrafico===c.id?"#7c3aed":"#f3f4f6",color:cartaoGrafico===c.id?"#fff":"#374151"}}>
                {c.nome}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{cartaoNomeGraf}</div>
          <MiniGrafico dados={dadosCartao} cor="#7c3aed"/>
        </div>
      </div>

      {/* ── Limites por Categoria ── */}
      {limitesCats.length>0&&(
        <div style={{...S,marginBottom:24}}>
          <div style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:16}}>
            🏷️ Limites por Categoria — {MESES_CURTOS[mesAtual-1]}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {limitesCats.map((c,i)=>{
              const cor=c.pct>100?"#ef4444":c.pct>80?"#f59e0b":"#10b981"
              return (
                <div key={i} style={{background:"#f5f0e8",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>{c.nome}</span>
                    <span style={{fontSize:12,color:cor,fontWeight:700,whiteSpace:"nowrap",marginLeft:8}}>{fmt(c.gasto)} / {fmt(c.limite)}</span>
                  </div>
                  <div style={{background:"#e2e8f0",borderRadius:99,height:7}}>
                    <div style={{background:cor,borderRadius:99,height:7,width:`${Math.min(c.pct,100)}%`,transition:"width 0.4s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                    <span style={{fontSize:10,color:cor,fontWeight:700}}>{c.pct}% do limite</span>
                    <span style={{fontSize:10,color:"#9ca3af"}}>{c.pct>100?`⚠️ ${fmt(c.gasto-c.limite)} acima`:`${fmt(c.limite-c.gasto)} restante`}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


    </div>
  )
}
