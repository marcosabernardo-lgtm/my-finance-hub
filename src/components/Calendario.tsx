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
  data_pagamento: string | null
  metodo_pagamento: string | null
  cartao_id: number | null
  categoria_id: number | null
  numero_parcela: string | null
  categorias?: { nome: string } | null
}

function semanaDomes(data: Date): number {
  const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1)
  return Math.ceil((data.getDate() + primeiroDia.getDay()) / 7)
}

function corTipo(m: Movimentacao): string {
  if (m.tipo === 'Receita') return '#16a34a'
  if (m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null) return '#ea580c'
  return '#e05252'
}

function corSituacao(sit: string): { bg: string; color: string } {
  if (sit === 'Pago')     return { bg: '#dcfce7', color: '#16a34a' }
  if (sit === 'Pendente') return { bg: '#fef3c7', color: '#d97706' }
  return { bg: '#f3f4f6', color: '#6b7280' }
}

// ─── Lógica de Filtro e Valor ─────────────────────────────────────────────────

const getValorReal = (m: Movimentacao): number => {
  const isCredito = m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null
  if (isCredito && m.numero_parcela?.includes('/')) {
    const [atual, total] = m.numero_parcela.split('/').map(Number)
    if (atual === 1) return Number(m.valor) * (total || 1)
    return 0
  }
  return Number(m.valor)
}

const validarMov = (m: Movimentacao): boolean => {
  if (['Previsto', 'Faturado'].includes(m.situacao)) return false
  if (m.tipo === 'Transferência') return false

  const isCredito = m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null
  
  if (isCredito) {
    // Regra do Azul: Ignora se datas forem iguais
    if (m.data_movimentacao === m.data_pagamento) return false
    // Só mostra Parcela 1
    if (m.numero_parcela && m.numero_parcela.includes('/')) {
      return m.numero_parcela.startsWith('1/')
    }
    return true
  }

  // Débito/PIX/Receita: Somente se Pago
  return m.situacao === 'Pago'
}

// ─── Card de movimentação ─────────────────────────────────────────────────────
function CardMov({ m }: { m: Movimentacao }) {
  const sit = corSituacao(m.situacao)
  const valor = getValorReal(m)
  
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px',
      background: '#fff',
      borderRadius: 8,
      border: '1px solid #e2e8f0',
      borderLeft: `3px solid ${corTipo(m)}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.descricao}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {m.numero_parcela && m.numero_parcela.includes('/') && (
             <span style={{ fontSize: 10, color: '#ea580c', background: '#fff7ed', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
                TOTAL {m.numero_parcela.split('/')[1]}x
             </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, background: sit.bg, color: sit.color, borderRadius: 4, padding: '1px 6px' }}>
            {m.situacao}
          </span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.metodo_pagamento}</span>
        </div>
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
        color: m.tipo === 'Receita' ? '#16a34a' : (m.metodo_pagamento?.includes('Crédito') || m.cartao_id) ? '#ea580c' : '#e05252'
      }}>
        {m.tipo === 'Despesa' ? '-' : '+'}{fmt(valor)}
      </div>
    </div>
  )
}

// ─── Célula do dia ────────────────────────────────────────────────────────────
function CelulaDia({ dia, movs, semana, isHoje, isMesAtual }: { dia: number; movs: Movimentacao[]; semana: number; isHoje: boolean; isMesAtual: boolean }) {
  const [aberto, setAberto] = useState(false)
  
  const movsValidos = useMemo(() => movs.filter((m: Movimentacao) => validarMov(m)), [movs])

  const receitas      = movsValidos.filter((m: Movimentacao) => m.tipo === 'Receita').reduce((s: number, m: Movimentacao) => s + Number(m.valor), 0)
  const despDebitoPix = movsValidos.filter((m: Movimentacao) => !m.metodo_pagamento?.includes('Crédito') && m.cartao_id === null && m.tipo === 'Despesa').reduce((s: number, m: Movimentacao) => s + Number(m.valor), 0)
  const despCredito   = movsValidos.filter((m: Movimentacao) => (m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null) && m.tipo === 'Despesa').reduce((s: number, m: Movimentacao) => s + getValorReal(m), 0)
  
  const temMovs = movsValidos.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={() => temMovs && setAberto(a => !a)}
        style={{
          minHeight: 90,
          padding: '8px 10px',
          background: isHoje ? '#0d7280' : aberto ? '#f0f9ff' : isMesAtual ? '#fff' : '#f8f9fa',
          border: isHoje ? '2px solid #0d7280' : aberto ? '2px solid #0d7280' : '1px solid #e2e8f0',
          borderRadius: aberto ? '10px 10px 0 0' : 10,
          cursor: temMovs ? 'pointer' : 'default',
          position: 'relative' as const,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
            background: isHoje ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: isHoje ? '#fff' : isMesAtual ? '#1a2332' : '#c0c4cc',
          }}>
            {dia}
          </div>
          {isMesAtual && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: isHoje ? 'rgba(255,255,255,0.7)' : '#9ca3af',
              background: isHoje ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
              borderRadius: 4, padding: '1px 5px',
            }}>
              S{semana}
            </span>
          )}
        </div>

        {temMovs && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {receitas > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#a7f3d0' : '#16a34a' }}>+{fmt(receitas)}</div>}
            {despDebitoPix > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fca5a5' : '#e05252' }}>-{fmt(despDebitoPix)}</div>}
            {despCredito > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fed7aa' : '#ea580c' }}>-{fmt(despCredito)} <small style={{fontWeight:400, opacity:0.8}}>créd</small></div>}
          </div>
        )}
      </div>

      {aberto && (
        <div style={{
          background: '#f8fafc',
          border: '2px solid #0d7280',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '10px 10px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {movsValidos.map((m: Movimentacao) => <CardMov key={m.id} m={m} />)}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Calendario() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [movs, setMovs]               = useState<Movimentacao[]>([])

  const hoje  = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const ultimoDia = new Date(ano, mes + 1, 0).getDate()
    const { data } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,data_pagamento,metodo_pagamento,cartao_id,categoria_id,numero_parcela,categorias(nome)')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-01`)
      .lte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`)

    // Tratamento para evitar erro de Array/Object no TypeScript
    const normalizado: Movimentacao[] = (data || []).map((item: any) => ({
      ...item,
      categorias: Array.isArray(item.categorias) ? item.categorias[0] : item.categorias
    }))

    setMovs(normalizado)
    setLoading(false)
  }, [householdId, mes, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  const movsPorDia = useMemo(() => {
    const map: Record<number, Movimentacao[]> = {}
    movs.forEach((m: Movimentacao) => {
      const dia = parseInt(m.data_movimentacao.substring(8, 10))
      if (!map[dia]) map[dia] = []
      map[dia].push(m)
    })
    return map
  }, [movs])

  const movsValidasMes = movs.filter((m: Movimentacao) => validarMov(m))
  const totalReceitas  = movsValidasMes.filter((m: Movimentacao) => m.tipo === 'Receita').reduce((s, m) => s + Number(m.valor), 0)
  const totalDebitoPix = movsValidasMes.filter((m: Movimentacao) => !m.metodo_pagamento?.includes('Crédito') && m.cartao_id === null && m.tipo === 'Despesa').reduce((s, m) => s + Number(m.valor), 0)
  const totalCredito   = movsValidasMes.filter((m: Movimentacao) => (m.metodo_pagamento?.includes('Crédito') || m.cartao_id !== null) && m.tipo === 'Despesa').reduce((s, m) => s + getValorReal(m), 0)

  const primeiroDia     = new Date(ano, mes, 1).getDay()
  const ultimoDiaNum    = new Date(ano, mes + 1, 0).getDate()
  const diasMesAnterior = new Date(ano, mes, 0).getDate()
  const celulas: { dia: number; mes: 'atual' | 'ant' | 'prox' }[] = []
  for (let i = primeiroDia - 1; i >= 0; i--) celulas.push({ dia: diasMesAnterior - i, mes: 'ant' })
  for (let d = 1; d <= ultimoDiaNum; d++) celulas.push({ dia: d, mes: 'atual' })
  const restante = 7 - (celulas.length % 7)
  if (restante < 7) for (let d = 1; d <= restante; d++) celulas.push({ dia: d, mes: 'prox' })
  const semanas: typeof celulas[] = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))

  function navMes(dir: number) {
    const novoMes = mes + dir
    if (novoMes < 0)       { setMes(11); setAno(a => a - 1) }
    else if (novoMes > 11) { setMes(0);  setAno(a => a + 1) }
    else setMes(novoMes)
  }

  return (
    <div style={{ background: '#f5f0e8', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", padding: '28px 32px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a2332', margin: 0 }}>📅 Calendário</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>Movimentações por dia — clique para expandir</p>
        </div>
        <button onClick={fetchDados} style={{ fontSize: 13, color: '#0d7280', background: 'none', border: '1px solid #0d7280', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>
          ↻ Atualizar
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navMes(-1)} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 18 }}>‹</button>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1a2332', minWidth: 200, textAlign: 'center' }}>
            {MESES[mes]} {ano}
          </div>
          <button onClick={() => navMes(1)} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 18 }}>›</button>
          <button onClick={() => { setMes(hoje.getMonth()); setAno(hoje.getFullYear()) }} style={{ fontSize: 12, color: '#0d7280', background: 'none', border: '1px solid #0d7280', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Hoje</button>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid #16a34a', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Receitas</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>+{fmt(totalReceitas)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid #e05252', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Déb / Pix</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e05252' }}>-{fmt(totalDebitoPix)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid #ea580c', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Crédito</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c' }}>-{fmt(totalCredito)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Movimentações</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a2332' }}>{movsValidasMes.length}</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid #e2e8f0' }}>
          {DIAS_SEMANA.map((d, i) => (
            <div key={d} style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: i === 0 || i === 6 ? '#e05252' : '#6b7a8d', background: '#f8fafc' }}>
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Carregando movimentações...</div>
        ) : (
          semanas.map((semana, si) => (
            <div key={si} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: si < semanas.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
              {semana.map((cel, di) => (
                <div key={di} style={{ borderRight: di < 6 ? '1px solid #e2e8f0' : 'none', padding: 6, background: (di === 0 || di === 6) && cel.mes === 'atual' ? '#fafafa' : 'transparent' }}>
                  <CelulaDia
                    dia={cel.dia}
                    movs={cel.mes === 'atual' ? (movsPorDia[cel.dia] || []) : []}
                    semana={cel.mes === 'atual' ? semanaDomes(new Date(ano, mes, cel.dia)) : 0}
                    isHoje={cel.mes === 'atual' && cel.dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()}
                    isMesAtual={cel.mes === 'atual'}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}