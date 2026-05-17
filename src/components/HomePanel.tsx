import { useEffect, useState, useCallback, useMemo } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../hooks/useAuth"
import { useMobile } from "../hooks/useMobile"
import Alertas from "./Alertas"

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

function Variacao({ atual, anterior, boaSeSubir = false }: { atual: number; anterior: number; boaSeSubir?: boolean }) {
  if (anterior === 0) return null
  const pct   = ((atual - anterior) / anterior) * 100
  const subiu = pct >= 0
  const bom   = boaSeSubir ? subiu : !subiu
  const sinal = pct >= 0 ? "+" : ""
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:11, fontWeight:700, color: bom ? "#16a34a" : "#ef4444", marginLeft:6 }}>
      {subiu ? "▲" : "▼"} {sinal}{pct.toFixed(1)}%
    </span>
  )
}

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
            <text x={i*36+18} y={H+14} textAnchor="middle" fontSize={8} fill="var(--text-3)">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function HomePanel() {
  const { user } = useAuth()
  const isMobile = useMobile()
  const [householdId, setHouseholdId] = useState<string|null>(null)
  const [loading, setLoading]         = useState(true)
  const [contas,          setContas]          = useState<any[]>([])
  const [cartoes,         setCartoes]         = useState<any[]>([])
  const [categorias,      setCategorias]      = useState<any[]>([])
  const [movsMes,         setMovsMes]         = useState<any[]>([])
  const [movsMesPgto,     setMovsMesPgto]     = useState<any[]>([])
  const [movsMesAnt,      setMovsMesAnt]      = useState<any[]>([])
  const [movsMesAntPgto,  setMovsMesAntPgto]  = useState<any[]>([])
  const [movsAno,         setMovsAno]         = useState<any[]>([])
  const [movsCartaoAno,   setMovsCartaoAno]   = useState<any[]>([])
  const [saldosContas,    setSaldosContas]     = useState<Record<number,number>>({})
  const [compCartoes,     setCompCartoes]      = useState<Record<number,number>>({})
  const [dividas,         setDividas]          = useState<any[]>([])
  const [movsAll,         setMovsAll]          = useState<any[]>([])
  const [pagtoFaturaMes,  setPagtoFaturaMes]   = useState<number>(0)
  const [pagtoFaturaAnt,  setPagtoFaturaAnt]   = useState<number>(0)
  const [cartaoGrafico,   setCartaoGrafico]    = useState<number|null>(null)

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

    const [contasR,cartoesR,catsR,mesR,mesPgtoR,mesAntR,mesAntPgtoR,anoR,cartaoAnoR,todasR,pendCartR,diviR,pgtoFatR,pgtoFatAntR,movsAllR] = await Promise.all([
      supabase.from("contas").select("id,nome,saldo_inicial,tipo").eq("household_id",householdId).eq("ativo",true),
      supabase.from("cartoes").select("id,nome,limite_total,data_vencimento").eq("household_id",householdId).eq("ativo",true),
      supabase.from("categorias").select("id,nome,limite_gastos,classificacao").eq("household_id",householdId),
      supabase.from("movimentacoes").select("id,tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,categoria_id,descricao")
        .eq("household_id",householdId).gte("data_movimentacao",dataIni).lte("data_movimentacao",dataFim),
      supabase.from("movimentacoes").select("id,tipo,situacao,valor,metodo_pagamento,cartao_id,data_pagamento,numero_parcela")
        .eq("household_id",householdId).eq("tipo","Despesa").in("situacao",["Pago","Faturado"])
        .gte("data_pagamento",dataIni).lte("data_pagamento",dataFim),
      supabase.from("movimentacoes").select("tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,cartao_id")
        .eq("household_id",householdId).gte("data_movimentacao",dataIniAnt).lte("data_movimentacao",dataFimAnt),
      supabase.from("movimentacoes").select("tipo,situacao,valor,metodo_pagamento,cartao_id,data_pagamento,numero_parcela")
        .eq("household_id",householdId).eq("tipo","Despesa").in("situacao",["Pago","Faturado"])
        .gte("data_pagamento",dataIniAnt).lte("data_pagamento",dataFimAnt),
      supabase.from("movimentacoes").select("tipo,situacao,valor,metodo_pagamento,numero_parcela,data_movimentacao,cartao_id")
        .eq("household_id",householdId).gte("data_movimentacao",`${anoAtual}-01-01`).lte("data_movimentacao",`${anoAtual}-12-31`),
      supabase.from("movimentacoes").select("cartao_id,valor,situacao,data_pagamento")
        .eq("household_id",householdId).eq("tipo","Despesa").not("cartao_id","is",null)
        .gte("data_pagamento",`${anoAtual}-01-01`).lte("data_pagamento",`${anoAtual}-12-31`),
      supabase.from("movimentacoes").select("conta_origem_destino,tipo,valor,situacao")
        .eq("household_id",householdId).eq("situacao","Pago"),
      supabase.from("movimentacoes").select("cartao_id,valor").eq("household_id",householdId).eq("situacao","Pendente")
        .not("cartao_id","is",null).gte("data_pagamento",hoje.toISOString().split("T")[0]),
      supabase.from("movimentacoes").select("id,descricao,valor,situacao,numero_parcela,data_pagamento,cartao_id,grupo_id,conta_origem_destino,categoria_id,categorias(nome),cartoes(nome)")
        .eq("household_id",householdId).eq("tipo","Despesa").not("numero_parcela","is",null).not("grupo_id","is",null)
        .order("data_pagamento",{ascending:true}),
      supabase.from("movimentacoes").select("valor")
        .eq("household_id",householdId).eq("tipo","Transferência").eq("situacao","Pago")
        .not("cartao_id","is",null)
        .gte("data_pagamento",dataIni).lte("data_pagamento",dataFim),
      supabase.from("movimentacoes").select("valor")
        .eq("household_id",householdId).eq("tipo","Transferência").eq("situacao","Pago")
        .not("cartao_id","is",null)
        .gte("data_pagamento",dataIniAnt).lte("data_pagamento",dataFimAnt),
      supabase.from("movimentacoes").select("id,tipo,situacao,descricao,valor,data_movimentacao,data_pagamento,metodo_pagamento,cartao_id,categoria_id,numero_parcela")
        .eq("household_id",householdId).eq("tipo","Despesa").in("situacao",["Pendente","Pago"]),
    ])

    const conts = contasR.data || []
    setContas(conts)
    setCartoes(cartoesR.data || [])
    setCategorias(catsR.data || [])
    setMovsMes(mesR.data || [])
    setMovsMesPgto(mesPgtoR.data || [])
    setMovsMesAnt(mesAntR.data || [])
    setMovsMesAntPgto(mesAntPgtoR.data || [])
    setMovsAno(anoR.data || [])
    setMovsCartaoAno(cartaoAnoR.data || [])
    setMovsAll(movsAllR.data || [])
    setPagtoFaturaMes((pgtoFatR.data||[]).reduce((s:number,m:any) => s+Number(m.valor), 0))
    setPagtoFaturaAnt((pgtoFatAntR.data||[]).reduce((s:number,m:any) => s+Number(m.valor), 0))
    if (cartoesR.data?.length) setCartaoGrafico(cartoesR.data[0].id)

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

    const comp: Record<number,number> = {}
    for (const m of pendCartR.data||[]) {
      if (!m.cartao_id) continue
      comp[m.cartao_id] = (comp[m.cartao_id]||0) + Number(m.valor)
    }
    setCompCartoes(comp)

    const divData = (diviR.data||[]).filter((m:any) => parseP(m.numero_parcela).total > 1)
    const porGrupoId: Record<string,any[]> = {}
    for (const m of divData) {
      if (!porGrupoId[m.grupo_id]) porGrupoId[m.grupo_id] = []
      porGrupoId[m.grupo_id].push(m)
    }
    const grupos = Object.entries(porGrupoId).map(([, parcelas]:any) => {
      parcelas.sort((a:any,b:any) => parseP(a.numero_parcela).atual - parseP(b.numero_parcela).atual)
      const p0        = parcelas[0]
      const isCredito = !!p0.cartao_id || p0.metodo_pagamento === "Crédito"
      const catNome   = p0.categorias?.nome || null
      const isParc    = !isCredito && (catNome||"").toLowerCase() === "parcelamento"
      const cartaoNome = p0.cartoes?.nome || null
      const foiQuit   = (p:any) => isCredito ? (p.situacao === "Faturado" || p.situacao === "Pago") : p.situacao === "Pago"
      const pendentes = parcelas.filter((p:any) => p.situacao === "Pendente")
      const pagas     = parcelas.filter(foiQuit).length
      const { total } = parseP(p0.numero_parcela)
      return { p0, parcelas, isCredito, isParc, cartaoNome, catNome, pendentes, pagas, total }
    }).filter((g:any) => g.pendentes.length > 0)
    const porDesc: Record<string,any[]> = {}
    for (const g of grupos) {
      const chave = g.isCredito
        ? `${g.cartaoNome}||${g.p0.descricao.trim().toLowerCase()}`
        : g.p0.descricao.trim().toLowerCase()
      if (!porDesc[chave]) porDesc[chave] = []
      porDesc[chave].push(g)
    }
    setDividas(Object.entries(porDesc).map(([, gs]:any) => {
      const totalParcelas = gs.reduce((s:number,g:any) => s + g.total, 0)
      const totalPagas    = gs.reduce((s:number,g:any) => s + g.pagas, 0)
      const totalPend     = gs.reduce((s:number,g:any) => s + g.pendentes.length, 0)
      const p0            = gs[0].p0
      return { descricao: p0.descricao, isCredito: gs[0].isCredito, isParc: gs[0].isParc, cartaoNome: gs[0].cartaoNome, pendentes: totalPend, valorParcela: p0.valor, valorRestante: p0.valor * totalPend, totalParcelas, totalPagas }
    }))

    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchDados() }, [fetchDados])

  const totalReceitas = useMemo(() =>
    movsMes.filter(m => m.tipo==="Receita" && m.situacao==="Pago" && m.metodo_pagamento!=="Transferência entre Contas")
      .reduce((s,m) => s+Number(m.valor), 0), [movsMes])

  const totalDespesas = useMemo(() =>
    movsMesPgto.filter(m => !m.cartao_id)
      .reduce((s,m) => s+Number(m.valor), 0), [movsMesPgto])

  const totalCartao = useMemo(() =>
    movsMes.filter(m => m.tipo==="Despesa" && m.situacao==="Pendente" && m.cartao_id)
      .reduce((s,m) => s+Number(m.valor), 0), [movsMes])

  const totalSaldo    = contas.filter(c=>c.tipo==="corrente").reduce((s,c)=>s+(saldosContas[c.id]||0),0)
  const totalSaldoInv = contas.filter(c=>c.tipo==="investimento").reduce((s,c)=>s+(saldosContas[c.id]||0),0)

  const totalReceitasAnt = useMemo(() =>
    movsMesAnt.filter(m => m.tipo==="Receita" && m.situacao==="Pago" && m.metodo_pagamento!=="Transferência entre Contas")
      .reduce((s,m) => s+Number(m.valor), 0), [movsMesAnt])
  const totalDespesasAnt = useMemo(() =>
    movsMesAntPgto.filter(m => !m.cartao_id).reduce((s,m) => s+Number(m.valor), 0), [movsMesAntPgto])
  const totalCartaoAnt = useMemo(() =>
    movsMesAnt.filter(m => m.tipo==="Despesa" && m.situacao==="Pendente" && m.cartao_id)
      .reduce((s,m) => s+Number(m.valor), 0), [movsMesAnt])

  const fluxo = useMemo(() => {
    const pendentes = movsAll.filter(m => m.situacao==="Pendente" && m.metodo_pagamento!=="Transferência entre Contas")
    const vencidos: any[] = [], hoje14: any[] = [], futuro14: any[] = []
    for (const m of pendentes) {
      const ref = m.data_pagamento || m.data_movimentacao
      if (!ref) continue
      const dias = diasAte(ref)
      if (dias < 0) vencidos.push(m)
      else if (dias === 0) hoje14.push(m)
      else if (dias <= 14) futuro14.push(m)
    }
    const soma = (arr:any[]) => arr.reduce((s,m)=>s+Number(m.valor),0)
    return [
      { titulo:"Vencidos",  sub:"Pendentes em atraso",  cor:"#ef4444", soma:soma(vencidos),  qtd:vencidos.length  },
      { titulo:"Vencendo",  sub:"hoje",                 cor:"#f59e0b", soma:soma(hoje14),    qtd:hoje14.length    },
      { titulo:"Futuro",    sub:"Próximos 14 dias",     cor:"#0d7280", soma:soma(futuro14),  qtd:futuro14.length  },
    ]
  }, [movsAll])


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

  const totalDividas    = dividas.reduce((s,d)=>s+d.valorRestante,0)
  const totalDivCredito = dividas.filter(d=>d.isCredito).reduce((s,d)=>s+d.valorRestante,0)
  const totalDivDebito  = dividas.filter(d=>!d.isCredito&&!d.isParc).reduce((s,d)=>s+d.valorRestante,0)
  const totalDivParc    = dividas.filter(d=>d.isParc).reduce((s,d)=>s+d.valorRestante,0)
  const cartaoNomeGraf  = cartoes.find(c=>c.id===cartaoGrafico)?.nome||"Cartão"
  const S: React.CSSProperties = { background:"var(--bg-card)", borderRadius:12, padding:"18px 20px", border:"1px solid var(--border)" }
  const SC: React.CSSProperties = { background:"var(--bg-card)", borderRadius:12, padding:"12px 14px", border:"1px solid var(--border)" }

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg-page)",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{color:"var(--text-2)",fontSize:15}}>Carregando visão geral...</div>
    </div>
  )

  if (isMobile) return (
    <div style={{background:"var(--bg-page)",minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:"14px 12px 76px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:14}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,color:"var(--text-1)",margin:0,lineHeight:1.1}}>Visão Geral</h1>
          <p style={{color:"var(--text-2)",fontSize:12,margin:"5px 0 0"}}>{mesFormatado}</p>
        </div>
        <button onClick={fetchDados} style={{fontSize:12,color:"#0d7280",background:"none",border:"1px solid #0d7280",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
          ↻ Atualizar
        </button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginBottom:12}}>
        <div style={{...SC,padding:"10px 11px",borderLeft:"4px solid #6ee7b7",minWidth:0}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Saldo</div>
          <div style={{fontSize:15,fontWeight:800,color:totalSaldo>=0?"#065f46":"#991b1b",margin:"5px 0 2px",lineHeight:1.15}}>{fmt(totalSaldo)}</div>
          <div style={{fontSize:9,color:"var(--text-3)"}}>Contas correntes</div>
        </div>
        <div style={{...SC,padding:"10px 11px",borderLeft:"4px solid #6ee7b7",minWidth:0}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Receitas</div>
          <div style={{fontSize:15,fontWeight:800,color:"var(--text-1)",margin:"5px 0 2px",lineHeight:1.15}}>{fmt(totalReceitas)}<Variacao atual={totalReceitas} anterior={totalReceitasAnt} boaSeSubir={true}/></div>
          <div style={{fontSize:9,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalReceitasAnt)}</div>
        </div>
        <div style={{...SC,padding:"10px 11px",borderLeft:"4px solid #fca5a5",minWidth:0}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Despesas</div>
          <div style={{fontSize:15,fontWeight:800,color:"var(--text-1)",margin:"5px 0 2px",lineHeight:1.15}}>{fmt(totalDespesas)}<Variacao atual={totalDespesas} anterior={totalDespesasAnt} boaSeSubir={false}/></div>
          <div style={{fontSize:9,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalDespesasAnt)}</div>
        </div>
        <div style={{...SC,padding:"10px 11px",borderLeft:"4px solid #fbbf24",minWidth:0}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Pag. Fatura</div>
          <div style={{fontSize:15,fontWeight:800,color:"var(--text-1)",margin:"5px 0 2px",lineHeight:1.15}}>{fmt(pagtoFaturaMes)}<Variacao atual={pagtoFaturaMes} anterior={pagtoFaturaAnt} boaSeSubir={false}/></div>
          <div style={{fontSize:9,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(pagtoFaturaAnt)}</div>
        </div>
        <div style={{...SC,padding:"10px 11px",borderLeft:"4px solid #c4b5fd",minWidth:0}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Cartão</div>
          <div style={{fontSize:15,fontWeight:800,color:"var(--text-1)",margin:"5px 0 2px",lineHeight:1.15}}>{fmt(totalCartao)}<Variacao atual={totalCartao} anterior={totalCartaoAnt} boaSeSubir={false}/></div>
          <div style={{fontSize:9,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalCartaoAnt)}</div>
        </div>
        <div style={{...SC,padding:"10px 11px",borderLeft:"4px solid #ef4444",background:"var(--bg-danger-soft)",minWidth:0}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--text-danger)",textTransform:"uppercase",letterSpacing:"0.04em"}}>Total Gasto</div>
          <div style={{fontSize:15,fontWeight:800,color:"var(--text-danger)",margin:"5px 0 2px",lineHeight:1.15}}>{fmt(totalDespesas+pagtoFaturaMes)}<Variacao atual={totalDespesas+pagtoFaturaMes} anterior={totalDespesasAnt+pagtoFaturaAnt} boaSeSubir={false}/></div>
          <div style={{fontSize:9,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalDespesasAnt+pagtoFaturaAnt)}</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:12}}>
        {fluxo.map((f,i) => (
          <div key={i} style={{background:f.cor,borderRadius:10,padding:"10px 8px",color:"#fff",minWidth:0}}>
            <div style={{fontSize:11,fontWeight:800,marginBottom:8,lineHeight:1.1}}>{f.titulo}</div>
            <div style={{fontSize:16,fontWeight:800,marginBottom:3,lineHeight:1.1,wordBreak:"break-word"}}>{fmt(f.soma)}</div>
            <div style={{fontSize:9,opacity:0.78,lineHeight:1.2}}>{f.qtd} pendente{f.qtd!==1?"s":""}</div>
          </div>
        ))}
      </div>

      <div style={{...S,padding:"12px",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)",marginBottom:10}}>Endividamento</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
          <div style={{background:"var(--bg-row)",border:"1px solid var(--border)",borderRadius:9,padding:"10px",minWidth:0}}>
            <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:5}}>Total em Dívidas</div>
            <div style={{fontSize:16,fontWeight:800,color:"var(--text-1)"}}>{fmt(totalDividas)}</div>
            <div style={{fontSize:9,color:"var(--text-3)"}}>{dividas.length} parcelamento(s)</div>
          </div>
          <div style={{background:"var(--bg-danger-soft)",border:"1px solid var(--border-danger)",borderLeft:"4px solid #e05252",borderRadius:9,padding:"10px",minWidth:0}}>
            <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:5}}>Crédito</div>
            <div style={{fontSize:16,fontWeight:800,color:"#e05252"}}>{fmt(totalDivCredito)}</div>
            <div style={{fontSize:9,color:"var(--text-3)"}}>{dividas.filter(d=>d.isCredito).length} item(s)</div>
          </div>
          <div style={{background:"var(--bg-info-soft)",border:"1px solid var(--border-info)",borderLeft:"4px solid #4a9eff",borderRadius:9,padding:"10px",minWidth:0}}>
            <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:5}}>Débito / PIX</div>
            <div style={{fontSize:16,fontWeight:800,color:"#4a9eff"}}>{fmt(totalDivDebito)}</div>
            <div style={{fontSize:9,color:"var(--text-3)"}}>{dividas.filter(d=>!d.isCredito&&!d.isParc).length} item(s)</div>
          </div>
          <div style={{background:"var(--bg-purple-soft)",border:"1px solid var(--border-purple)",borderLeft:"4px solid #9b59b6",borderRadius:9,padding:"10px",minWidth:0}}>
            <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:5}}>Parcelamento</div>
            <div style={{fontSize:16,fontWeight:800,color:"#9b59b6"}}>{fmt(totalDivParc)}</div>
            <div style={{fontSize:9,color:"var(--text-3)"}}>{dividas.filter(d=>d.isParc).length} item(s)</div>
          </div>
        </div>
      </div>

      <div style={{...S,padding:"12px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)"}}>Contas</div>
          <div style={{fontSize:12,fontWeight:800,color:totalSaldo>=0?"#065f46":"#991b1b",whiteSpace:"nowrap"}}>{fmt(totalSaldo)}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
          {contas.filter(c=>c.tipo==="corrente").map(c=>{
            const saldo=saldosContas[c.id]??0; const logo=logoBanco(c.nome)
            return (
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:9,background:"var(--bg-row)",borderRadius:9,padding:"9px 10px",minWidth:0}}>
                <div style={{width:32,height:32,borderRadius:7,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nome}</div>
                  <div style={{fontSize:10,color:"var(--text-3)"}}>Conta corrente</div>
                </div>
                <div style={{fontSize:12,fontWeight:800,color:saldo>=0?"#065f46":"#991b1b",whiteSpace:"nowrap"}}>{fmt(saldo)}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{...S,padding:"12px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)"}}>Cartões de Crédito</div>
          <div style={{fontSize:10,color:"var(--text-2)",whiteSpace:"nowrap"}}>{cartoes.length} cartão(ões)</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
          {cartoes.map(c=>{
            const usado=compCartoes[c.id]||0; const disp=c.limite_total-usado
            const pct=c.limite_total>0?(usado/c.limite_total)*100:0
            const cor=pct>80?"#ef4444":pct>50?"#f59e0b":"#10b981"
            const logo=logoBanco(c.nome)
            return (
              <div key={c.id} style={{background:"var(--bg-row)",borderRadius:9,padding:"9px 10px",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{width:30,height:30,borderRadius:7,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--text-1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nome}</div>
                    <div style={{fontSize:9,color:"var(--text-2)"}}>Vence dia {c.data_vencimento}</div>
                  </div>
                  <div style={{textAlign:"right" as const,flexShrink:0}}>
                    <div style={{fontSize:11,fontWeight:800,color:disp>=0?"#065f46":"#991b1b"}}>{fmt(disp)}</div>
                    <div style={{fontSize:8,color:"var(--text-3)"}}>disponível</div>
                  </div>
                </div>
                <div style={{background:"var(--border)",borderRadius:99,height:5}}>
                  <div style={{background:cor,borderRadius:99,height:5,width:`${Math.min(pct,100)}%`}}/>
                </div>
                <div style={{fontSize:9,color:cor,fontWeight:800,marginTop:3}}>{pct.toFixed(0)}% usado · {fmt(usado)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{background:"var(--bg-page)",minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",padding:"28px 32px"}}>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:"var(--text-1)",margin:0}}>Visão Geral</h1>
          <p style={{color:"var(--text-2)",fontSize:13,margin:"4px 0 0"}}>{mesFormatado}</p>
        </div>
        <button onClick={fetchDados} style={{fontSize:13,color:"#0d7280",background:"none",border:"1px solid #0d7280",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontWeight:600}}>
          ↻ Atualizar
        </button>
      </div>

      {/* 6 Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:24}}>
        <div style={{...SC,borderLeft:"4px solid #6ee7b7"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Saldo em Contas</div>
          <div style={{fontSize:17,fontWeight:700,color:totalSaldo>=0?"#065f46":"#991b1b",margin:"6px 0 2px"}}>{fmt(totalSaldo)}</div>
          <div style={{fontSize:10,color:"var(--text-3)"}}>Contas correntes</div>
        </div>
        <div style={{...SC,borderLeft:"4px solid #6ee7b7"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Receitas do Mês</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--text-1)",margin:"6px 0 2px"}}>
            {fmt(totalReceitas)}<Variacao atual={totalReceitas} anterior={totalReceitasAnt} boaSeSubir={true}/>
          </div>
          <div style={{fontSize:10,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalReceitasAnt)}</div>
        </div>
        <div style={{...SC,borderLeft:"4px solid #fca5a5"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Despesas do Mês</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--text-1)",margin:"6px 0 2px"}}>
            {fmt(totalDespesas)}<Variacao atual={totalDespesas} anterior={totalDespesasAnt} boaSeSubir={false}/>
          </div>
          <div style={{fontSize:10,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalDespesasAnt)}</div>
        </div>
        <div style={{...SC,borderLeft:"4px solid #fbbf24"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Pag. Fatura</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--text-1)",margin:"6px 0 2px"}}>
            {fmt(pagtoFaturaMes)}<Variacao atual={pagtoFaturaMes} anterior={pagtoFaturaAnt} boaSeSubir={false}/>
          </div>
          <div style={{fontSize:10,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(pagtoFaturaAnt)}</div>
        </div>
        <div style={{...SC,borderLeft:"4px solid #c4b5fd"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Cartão do Mês</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--text-1)",margin:"6px 0 2px"}}>
            {fmt(totalCartao)}<Variacao atual={totalCartao} anterior={totalCartaoAnt} boaSeSubir={false}/>
          </div>
          <div style={{fontSize:10,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalCartaoAnt)}</div>
        </div>
        <div style={{...SC,borderLeft:"4px solid #ef4444",background:"var(--bg-danger-soft)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-danger)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Total Gasto</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--text-danger)",margin:"6px 0 2px"}}>
            {fmt(totalDespesas+pagtoFaturaMes)}<Variacao atual={totalDespesas+pagtoFaturaMes} anterior={totalDespesasAnt+pagtoFaturaAnt} boaSeSubir={false}/>
          </div>
          <div style={{fontSize:10,color:"var(--text-3)"}}>vs {MESES_CURTOS[mesAnterior-1]}: {fmt(totalDespesasAnt+pagtoFaturaAnt)}</div>
        </div>
      </div>

      {/* 3 Cards fluxo */}
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

      {/* Endividamento */}
      <div style={{...S, marginBottom:24}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--text-1)",marginBottom:16}}>💰 Endividamento</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          <div style={{background:"var(--bg-row)",border:"1px solid var(--border)",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:6}}>Total em Dívidas</div>
            <div style={{fontSize:20,fontWeight:800,color:"var(--text-1)"}}>{fmt(totalDividas)}</div>
            <div style={{fontSize:11,color:"var(--text-3)"}}>{dividas.length} parcelamento(s)</div>
          </div>
          <div style={{background:"var(--bg-danger-soft)",border:"1px solid var(--border-danger)",borderLeft:"4px solid #e05252",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:6}}>💳 Crédito</div>
            <div style={{fontSize:20,fontWeight:800,color:"#e05252"}}>{fmt(totalDivCredito)}</div>
            <div style={{fontSize:11,color:"var(--text-3)"}}>{[...new Set(dividas.filter(d=>d.isCredito).map(d=>d.cartaoNome))].length} cartão(ões) · {dividas.filter(d=>d.isCredito).length} item(s)</div>
          </div>
          <div style={{background:"var(--bg-info-soft)",border:"1px solid var(--border-info)",borderLeft:"4px solid #4a9eff",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:6}}>🏦 Débito / PIX</div>
            <div style={{fontSize:20,fontWeight:800,color:"#4a9eff"}}>{fmt(totalDivDebito)}</div>
            <div style={{fontSize:11,color:"var(--text-3)"}}>{dividas.filter(d=>!d.isCredito&&!d.isParc).length} item(s)</div>
          </div>
          <div style={{background:"var(--bg-purple-soft)",border:"1px solid var(--border-purple)",borderLeft:"4px solid #9b59b6",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:"var(--text-2)",marginBottom:6}}>📋 Parcelamento</div>
            <div style={{fontSize:20,fontWeight:800,color:"#9b59b6"}}>{fmt(totalDivParc)}</div>
            <div style={{fontSize:11,color:"var(--text-3)"}}>{dividas.filter(d=>d.isParc).length} item(s)</div>
          </div>
        </div>
      </div>

      {/* Contas + Cartões */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
        <div style={{display:"flex",flexDirection:"column" as const,gap:16}}>
          <div style={S}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text-1)"}}>🏦 Contas Correntes</div>
              <div style={{fontSize:14,fontWeight:700,color:totalSaldo>=0?"#065f46":"#991b1b"}}>{fmt(totalSaldo)}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
              {contas.filter(c=>c.tipo==="corrente").map(c=>{
                const saldo=saldosContas[c.id]??0; const logo=logoBanco(c.nome)
                return (
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-row)",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text-1)",wordBreak:"break-word"}}>{c.nome}</div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Conta corrente</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:saldo>=0?"#065f46":"#991b1b",whiteSpace:"nowrap"}}>{fmt(saldo)}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {contas.filter(c=>c.tipo==="investimento").length > 0 && (
            <div style={S}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:700,color:"var(--text-1)"}}>📈 Investimentos</div>
                <div style={{fontSize:14,fontWeight:700,color:"#065f46"}}>{fmt(totalSaldoInv)}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
                {contas.filter(c=>c.tipo==="investimento").map(c=>{
                  const saldo=saldosContas[c.id]??0; const logo=logoBanco(c.nome)
                  return (
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-success-soft)",borderRadius:10,padding:"10px 12px",border:"1px solid var(--border-success)"}}>
                      <div style={{width:36,height:36,borderRadius:8,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text-1)",wordBreak:"break-word"}}>{c.nome}</div>
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
            <div style={{fontSize:14,fontWeight:700,color:"var(--text-1)"}}>💳 Cartões de Crédito</div>
            <div style={{fontSize:12,color:"var(--text-2)"}}>{cartoes.length} cartão(ões)</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
            {cartoes.map(c=>{
              const usado=compCartoes[c.id]||0; const disp=c.limite_total-usado
              const pct=c.limite_total>0?(usado/c.limite_total)*100:0
              const cor=pct>80?"#ef4444":pct>50?"#f59e0b":"#10b981"
              const logo=logoBanco(c.nome)
              return (
                <div key={c.id} style={{background:"var(--bg-row)",borderRadius:10,padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:32,height:32,borderRadius:7,background:logo.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:logo.color,flexShrink:0}}>{logo.sigla}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:"var(--text-1)",wordBreak:"break-word"}}>{c.nome}</div>
                      <div style={{fontSize:10,color:"var(--text-2)"}}>Vence dia {c.data_vencimento}</div>
                    </div>
                    <div style={{textAlign:"right" as const}}>
                      <div style={{fontSize:12,fontWeight:700,color:disp>=0?"#065f46":"#991b1b"}}>{fmt(disp)}</div>
                      <div style={{fontSize:9,color:"var(--text-3)"}}>disponível</div>
                    </div>
                  </div>
                  <div style={{background:"var(--border)",borderRadius:99,height:5}}>
                    <div style={{background:cor,borderRadius:99,height:5,width:`${Math.min(pct,100)}%`}}/>
                  </div>
                  <div style={{fontSize:10,color:cor,fontWeight:700,marginTop:3}}>{pct.toFixed(0)}% usado · {fmt(usado)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:24}}>
        <div style={S}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-1)"}}>📈 Receitas {anoAtual}</div>
          <div style={{fontSize:11,color:"var(--text-3)",margin:"2px 0 6px"}}>Mês a mês — Pago</div>
          <MiniGrafico dados={dadosReceitas} cor="#16a34a"/>
        </div>
        <div style={S}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-1)"}}>📉 Despesas {anoAtual}</div>
          <div style={{fontSize:11,color:"var(--text-3)",margin:"2px 0 6px"}}>Mês a mês{metaDespesas>0?` · Meta ${fmt(metaDespesas)}`:""}</div>
          <MiniGrafico dados={dadosDespesas} cor="#ef4444" meta={metaDespesas||undefined}/>
        </div>
        <div style={S}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-1)"}}>💳 Cartão {anoAtual}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",margin:"4px 0"}}>
            {cartoes.map(c=>(
              <button key={c.id} onClick={()=>setCartaoGrafico(c.id)} style={{padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:600,cursor:"pointer",border:"none",background:cartaoGrafico===c.id?"#7c3aed":"var(--bg-row2)",color:cartaoGrafico===c.id?"#fff":"var(--text-4)"}}>
                {c.nome}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:"var(--text-3)",marginBottom:4}}>{cartaoNomeGraf}</div>
          <MiniGrafico dados={dadosCartao} cor="#7c3aed"/>
        </div>
      </div>

      {/* Alertas compactos */}
      <div style={{...S,marginBottom:24}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--text-1)",marginBottom:12}}>🔔 Alertas de Pagamentos</div>
        <Alertas compact />
      </div>

    </div>
  )
}
