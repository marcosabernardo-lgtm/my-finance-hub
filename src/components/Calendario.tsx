import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Helpers de Formatação ────────────────────────────────────────────────────
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

// ─── Regras de Negócio Estritas ───────────────────────────────────────────────

const isReceita = (m: Movimentacao) =>
  m.tipo === 'Receita' && 
  m.situacao !== 'Previsto' && 
  m.metodo_pagamento !== 'Transferência'

const isDebitoPix = (m: Movimentacao) =>
  m.tipo === 'Despesa' &&
  m.situacao !== 'Faturado' &&
  m.situacao !== 'Previsto' &&
  (m.metodo_pagamento === 'Débito' || m.metodo_pagamento === 'PIX' || m.metodo_pagamento === 'Pix' || m.metodo_pagamento === 'Dinheiro')

const isCredito = (m: Movimentacao) =>
  m.tipo === 'Despesa' &&
  m.situacao !== 'Faturado' &&
  m.situacao !== 'Previsto' &&
  (m.metodo_pagamento === 'Cartão de Crédito' || m.metodo_pagamento === 'Crédito' || m.cartao_id !== null)

function corSituacao(sit: string): { bg: string; color: string } {
  if (sit === 'Pago')     return { bg: '#dcfce7', color: '#16a34a' }
  if (sit === 'Pendente') return { bg: '#fef3c7', color: '#d97706' }
  return { bg: '#f3f4f6', color: '#6b7280' }
}

function semanaDomes(data: Date): number {
  const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1)
  return Math.ceil((data.getDate() + primeiroDia.getDay()) / 7)
}

// ─── Card de movimentação ─────────────────────────────────────────────────────
function CardMov({ m }: { m: Movimentacao }) {
  const sit = corSituacao(m.situacao)
  const corBorda = m.tipo === 'Receita' ? '#16a34a' : isCredito(m) ? '#ea580c' : '#e05252'
  
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', background: '#fff', borderRadius: 8,
      border: '1px solid #e2e8f0',
      borderLeft: `3px solid ${corBorda}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.descricao}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {m.numero_parcela && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#ea580c', background: '#fff7ed', borderRadius: 4, padding: '1px 6px', border: '1px solid #ffedd5' }}>
              {m.numero_parcela}
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
        color: m.tipo === 'Receita' ? '#16a34a' : '#e05252'
      }}>
        {m.tipo === 'Despesa' ? '-' : '+'}{fmt(Number(m.valor))}
      </div>
    </div>
  )
}

// ─── Célula do dia ────────────────────────────────────────────────────────────
function CelulaDia({ dia, movs, isHoje, isMesAtual, semana }: any) {
  const [aberto, setAberto] = useState(false)

  // Filtro rigoroso para exibição no calendário
  const movsValidos = movs.filter((m: Movimentacao) => isReceita(m) || isDebitoPix(m) || isCredito(m))
  
  const receitas      = movsValidos.filter(isReceita).reduce((s, m) => s + Number(m.valor), 0)
  const despDebitoPix = movsValidos.filter(isDebitoPix).reduce((s, m) => s + Number(m.valor), 0)
  const despCredito   = movsValidos.filter(isCredito).reduce((s, m) => s + Number(m.valor), 0)

  if (!isMesAtual) {
    return <div style={{ minHeight: 90, background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: 10, opacity: 0.4 }} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        onClick={() => movsValidos.length > 0 && setAberto(!aberto)}
        style={{
          minHeight: 90, padding: '8px 10px',
          background: isHoje ? '#0d7280' : aberto ? '#f0f9ff' : '#fff',
          border: isHoje ? '2px solid #0d7280' : aberto ? '2px solid #0d7280' : '1px solid #e2e8f0',
          borderRadius: aberto ? '10px 10px 0 0' : 10,
          cursor: movsValidos.length > 0 ? 'pointer' : 'default',
          position: 'relative', transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ 
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', fontSize: 13, fontWeight: 700, 
            background: isHoje ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: isHoje ? '#fff' : '#1a2332' 
          }}>{dia}</div>
          <span style={{ fontSize: 9, fontWeight: 700, color: isHoje ? '#fff' : '#9ca3af' }}>S{semana}</span>
        </div>

        {movsValidos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {receitas > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#a7f3d0' : '#16a34a' }}>+{fmt(receitas)}</div>}
            {despDebitoPix > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fca5a5' : '#e05252' }}>-{fmt(despDebitoPix)}</div>}
            {despCredito > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fed7aa' : '#ea580c' }}>-{fmt(despCredito)} <small style={{fontWeight:400, opacity: 0.8}}>créd</small></div>}
          </div>
        )}
      </div>

      {aberto && (
        <div style={{
          background: '#f8fafc', border: '2px solid #0d7280', borderTop: 'none',
          borderRadius: '0 0 10px 10px', padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
          zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }}>
          {movsValidos.map((m: Movimentacao) => <CardMov key={m.id} m={m} />)}
        </div>
      )}
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Calendario() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [movs, setMovs] = useState<Movimentacao[]>([])
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
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,metodo_pagamento,cartao_id,numero_parcela,categorias(nome)')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-01`)
      .lte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`)

    const normalizado: Movimentacao[] = (data || []).map((m: any) => ({
      ...m,
      categorias: Array.isArray(m.categorias) ? (m.categorias[0] ?? null) : (m.categorias ?? null),
    }))

    setMovs(normalizado)
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

  // Totais do Topo baseados nas mesmas regras estritas
  const totalReceitas  = movs.filter(isReceita).reduce((s, m) => s + Number(m.valor), 0)
  const totalDebPix    = movs.filter(isDebitoPix).reduce((s, m) => s + Number(m.valor), 0)
  const totalCredito   = movs.filter(isCredito).reduce((s, m) => s + Number(m.valor), 0)

  // Grade do Calendário
  const primeiroDiaNum = new Date(ano, mes, 1).getDay()
  const ultimoDiaNum   = new Date(ano, mes + 1, 0).getDate()
  const diasMesAnt     = new Date(ano, mes, 0).getDate()

  const celulas: { dia: number; mes: 'atual' | 'ant' | 'prox' }[] = []
  for (let i = primeiroDiaNum - 1; i >= 0; i--) celulas.push({ dia: diasMesAnt - i, mes: 'ant' })
  for (let d = 1; d <= ultimoDiaNum; d++) celulas.push({ dia: d, mes: 'atual' })
  const restante = 7 - (celulas.length % 7)
  if (restante < 7) for (let d = 1; d <= restante; d++) celulas.push({ dia: d, mes: 'prox' })

  const semanas: typeof celulas[] = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))

  function navMes(dir: number) {
    let nMes = mes + dir
    let nAno = ano
    if (nMes < 0) { nMes = 11; nAno-- }
    else if (nMes > 11) { nMes = 0; nAno++ }
    setMes(nMes); setAno(nAno)
  }

  return (
    <div style={{ background: '#f5f0e8', minHeight: '100vh', padding: '28px 32px', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>📅 Calendário de Movimentações</h1>
        <button onClick={fetchDados} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: '#fff', border: '1px solid #d1d5db' }}>↻ Atualizar</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <button onClick={() => navMes(-1)} style={{ width: 35, height: 35, borderRadius: '50%', border: '1px solid #d1d5db', cursor: 'pointer' }}>‹</button>
          <span style={{ fontSize: 20, fontWeight: 800, minWidth: 180, textAlign: 'center' }}>{MESES[mes]} {ano}</span>
          <button onClick={() => navMes(1)} style={{ width: 35, height: 35, borderRadius: '50%', border: '1px solid #d1d5db', cursor: 'pointer' }}>›</button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <CardTopo label="Receitas" valor={totalReceitas} cor="#16a34a" />
          <CardTopo label="Débito/Pix" valor={totalDebPix} cor="#e05252" />
          <CardTopo label="Crédito" valor={totalCredito} cor="#ea580c" />
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
          {DIAS_SEMANA.map(d => <div key={d} style={{ padding: 12, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b' }}>{d}</div>)}
        </div>

        {loading ? (
          <div style={{ padding: 100, textAlign: 'center' }}>Carregando...</div>
        ) : (
          semanas.map((semana, si) => (
            <div key={si} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e2e8f0' }}>
              {semana.map((cel, di) => (
                <div key={di} style={{ borderRight: di < 6 ? '1px solid #e2e8f0' : 'none', padding: 4 }}>
                  <CelulaDia
                    dia={cel.dia}
                    isMesAtual={cel.mes === 'atual'}
                    isHoje={cel.mes === 'atual' && cel.dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()}
                    movs={cel.mes === 'atual' ? (movsPorDia[cel.dia] || []) : []}
                    semana={semanaDomes(new Date(ano, mes, cel.dia))}
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

function CardTopo({ label, valor, cor }: any) {
  return (
    <div style={{ background: '#fff', padding: '10px 20px', borderRadius: 12, border: '1px solid #e2e8f0', borderLeft: `4px solid ${cor}`, textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: cor }}>{fmt(valor)}</div>
    </div>
  )
}