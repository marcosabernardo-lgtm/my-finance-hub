import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface Movimentacao {
  id: number
  tipo: string
  situacao: string
  descricao: string
  valor: number
  data_movimentacao: string
  metodo_pagamento: string | null
  cartao_id: number | null
  categoria_id: number | null
  numero_parcela: string | null
  categorias?: { nome: string } | null
}

// ─── Lógica de Negócio ────────────────────────────────────────────────────────

const getValorExibicao = (m: Movimentacao): number => {
  // Se for crédito e tiver parcelas (ex: "1/10")
  const isCredito = m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null
  if (isCredito && m.numero_parcela?.includes('/')) {
    const [atual, total] = m.numero_parcela.split('/').map(Number)
    if (atual === 1) return Number(m.valor) * total 
    return 0 
  }
  return Number(m.valor)
}

const filtrarMovimentacao = (m: Movimentacao): boolean => {
  if (['Previsto', 'Faturado'].includes(m.situacao)) return false
  if (m.tipo === 'Transferência') return false

  // Regra Débito / PIX / Dinheiro: Somente se Pago
  const isAvista = ['Débito', 'PIX', 'Pix', 'Dinheiro'].includes(m.metodo_pagamento || '')
  if (isAvista) return m.situacao === 'Pago'

  // Regra Crédito: Pendente ou Pago, mas apenas parcela 1 (ou não parcelado)
  const isCredito = m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null
  if (isCredito) {
    if (m.numero_parcela && m.numero_parcela.includes('/')) {
      return m.numero_parcela.startsWith('1/')
    }
    return true
  }

  // Receitas: Somente se Pago
  if (m.tipo === 'Receita') return m.situacao === 'Pago'

  return false
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function CardMov({ m }: { m: Movimentacao }) {
  const valorExibido = getValorExibicao(m)
  const isCredito = m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null
  
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#fff',
      borderRadius: 8, border: '1px solid #e2e8f0',
      borderLeft: `3px solid ${m.tipo === 'Receita' ? '#16a34a' : isCredito ? '#ea580c' : '#e05252'}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.descricao}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {isCredito && m.numero_parcela && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#ea580c', background: '#fff7ed', borderRadius: 4, padding: '1px 6px', border: '1px solid #ffedd5' }}>
              VALOR TOTAL ({m.numero_parcela.split('/')[1]}x)
            </span>
          )}
          <span style={{ 
            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
            background: m.situacao === 'Pago' ? '#dcfce7' : '#fef3c7',
            color: m.situacao === 'Pago' ? '#16a34a' : '#d97706'
          }}>
            {m.situacao}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: m.tipo === 'Receita' ? '#16a34a' : '#e05252' }}>
        {m.tipo === 'Despesa' ? '-' : '+'}{fmt(valorExibido)}
      </div>
    </div>
  )
}

interface CelulaProps {
  dia: number;
  movs: Movimentacao[];
  isHoje: boolean;
  isMesAtual: boolean;
  semana: number;
}

function CelulaDia({ dia, movs, isHoje, isMesAtual, semana }: CelulaProps) {
  const [aberto, setAberto] = useState(false)
  const movsFiltrados = useMemo(() => movs.filter(filtrarMovimentacao), [movs])

  const receitas = movsFiltrados.filter(m => m.tipo === 'Receita').reduce((s: number, m: Movimentacao) => s + Number(m.valor), 0)
  const despesas = movsFiltrados.filter(m => m.tipo === 'Despesa').reduce((s: number, m: Movimentacao) => s + getValorExibicao(m), 0)

  if (!isMesAtual) return <div style={{ minHeight: 95, background: '#f8f9fa', opacity: 0.4, border: '1px solid #e2e8f0', borderRadius: 10 }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={() => movsFiltrados.length > 0 && setAberto(!aberto)}
        style={{
          minHeight: 95, padding: '8px 10px', position: 'relative',
          background: isHoje ? '#0d7280' : aberto ? '#f0f9ff' : '#fff',
          border: isHoje ? '2px solid #0d7280' : aberto ? '2px solid #0d7280' : '1px solid #e2e8f0',
          borderRadius: aberto ? '10px 10px 0 0' : 10,
          cursor: movsFiltrados.length > 0 ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isHoje ? '#fff' : '#1a2332' }}>{dia}</span>
          <span style={{ fontSize: 9, color: isHoje ? '#fff' : '#9ca3af' }}>S{semana}</span>
        </div>

        {movsFiltrados.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {receitas > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#a7f3d0' : '#16a34a' }}>+{fmt(receitas)}</div>}
            {despesas > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fca5a5' : '#e05252' }}>-{fmt(despesas)}</div>}
          </div>
        )}
      </div>

      {aberto && (
        <div style={{
          background: '#f8fafc', border: '2px solid #0d7280', borderTop: 'none',
          borderRadius: '0 0 10px 10px', padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
          zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          {movsFiltrados.map(m => <CardMov key={m.id} m={m} />)}
        </div>
      )}
    </div>
  )
}

// ─── Principal ───────────────────────────────────────────────────────────────

export default function Calendario() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  useEffect(() => {
    if (user) supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => data && setHouseholdId(data.id))
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const ultimoDia = new Date(ano, mes + 1, 0).getDate()
    const { data } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,metodo_pagamento,cartao_id,numero_parcela,categoria_id')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-01`)
      .lte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`)
    
    setMovs((data as Movimentacao[]) || [])
    setLoading(false)
  }, [householdId, mes, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  const movsPorDia = useMemo(() => {
    const map: Record<number, Movimentacao[]> = {}
    movs.forEach(m => {
      const d = parseInt(m.data_movimentacao.substring(8, 10))
      if (!map[d]) map[d] = []
      map[d].push(m)
    })
    return map
  }, [movs])

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const celulas = []
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push({ dia: 0, atual: false })
  for (let i = 1; i <= diasNoMes; i++) celulas.push({ dia: i, atual: true })

  return (
    <div style={{ padding: 30, background: '#f5f0e8', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
        <h1 style={{ margin: 0 }}>📅 {MESES[mes]} {ano}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btnStyle} onClick={() => { setMes(m => m === 0 ? 11 : m - 1); if(mes===0) setAno(a=>a-1) }}>◀</button>
          <button style={btnStyle} onClick={() => { setMes(m => m === 11 ? 0 : m + 1); if(mes===11) setAno(a=>a+1) }}>▶</button>
        </div>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#666' }}>Carregando dados...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {DIAS_SEMANA.map(d => <div key={d} style={{ textAlign: 'center', fontWeight: 800, color: '#64748b', paddingBottom: 10 }}>{d}</div>)}
          {celulas.map((c, i) => (
            <CelulaDia 
              key={i} 
              dia={c.dia} 
              isMesAtual={c.atual} 
              movs={c.atual ? (movsPorDia[c.dia] || []) : []}
              isHoje={c.atual && c.dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()}
              semana={Math.ceil((i + 1) / 7)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const btnStyle = { padding: '8px 15px', cursor: 'pointer', borderRadius: 8, border: '1px solid #ccc', background: '#fff' }