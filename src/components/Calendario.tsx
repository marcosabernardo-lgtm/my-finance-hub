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
  numero_parcela: string | null // Adicionado para mostrar parcelas
  categorias?: { nome: string } | null
}

// ─── Regras de Negócio Estritas ───────────────────────────────────────────────

// 1. Somente Receitas Reais (ignora previsões e transferências)
const isReceita = (m: Movimentacao) =>
  m.tipo === 'Receita' && 
  m.situacao !== 'Previsto' && 
  m.metodo_pagamento !== 'Transferência'

// 2. Somente Débito/Pix/Dinheiro (ignora faturados, previstos e transferências)
const isDebitoPix = (m: Movimentacao) =>
  m.tipo === 'Despesa' &&
  m.situacao !== 'Faturado' &&
  m.situacao !== 'Previsto' &&
  (m.metodo_pagamento === 'Débito' || m.metodo_pagamento === 'PIX' || m.metodo_pagamento === 'Pix' || m.metodo_pagamento === 'Dinheiro')

// 3. Somente Crédito (ignora faturados e previstos)
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

// ─── Card de movimentação ─────────────────────────────────────────────────────
function CardMov({ m }: { m: Movimentacao }) {
  const sit = corSituacao(m.situacao)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px', background: '#fff', borderRadius: 8,
      border: '1px solid #e2e8f0',
      borderLeft: `3px solid ${m.tipo === 'Receita' ? '#16a34a' : isCredito(m) ? '#ea580c' : '#e05252'}`,
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

  // Filtramos os movimentos que NÃO atendem aos critérios (como transferências e faturados)
  const movsValidos = movs.filter((m: Movimentacao) => isReceita(m) || isDebitoPix(m) || isCredito(m))
  
  const receitas      = movsValidos.filter(isReceita).reduce((s: any, m: any) => s + Number(m.valor), 0)
  const despDebitoPix = movsValidos.filter(isDebitoPix).reduce((s: any, m: any) => s + Number(m.valor), 0)
  const despCredito   = movsValidos.filter(isCredito).reduce((s: any, m: any) => s + Number(m.valor), 0)

  if (!isMesAtual) return <div style={{ minHeight: 90, background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: 10, opacity: 0.4 }} />

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
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isHoje ? '#fff' : '#1a2332' }}>{dia}</div>
          <span style={{ fontSize: 9, color: isHoje ? '#fff' : '#9ca3af' }}>S{semana}</span>
        </div>

        {movsValidos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {receitas > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#a7f3d0' : '#16a34a' }}>+{fmt(receitas)}</div>}
            {despDebitoPix > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fca5a5' : '#e05252' }}>-{fmt(despDebitoPix)}</div>}
            {despCredito > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fed7aa' : '#ea580c' }}>-{fmt(despCredito)} <small style={{fontWeight:400}}>créd</small></div>}
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
    const { data } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,metodo_pagamento,cartao_id,numero_parcela,categorias(nome)')
      .eq('household_id', householdId)
      // Buscamos o mês, mas as regras de filtro (isReceita, etc) farão a limpeza
      .gte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-01`)
      .lte('data_movimentacao', `${ano}-${String(mes + 1).padStart(2, '0')}-31`)
      .not('tipo', 'eq', 'Transferência') // Já mata transferências no banco

    setMovs(data || [])
    setLoading(false)
  }, [householdId, mes, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  // Lógica de construção da grade (omitida aqui por brevidade, mas mantida igual ao seu original)
  // ... (mesmo código de construção de 'semanas' e 'celulas' do seu primeiro arquivo) ...
  
  // Apenas garanta que no return do Calendário, você use os helpers isReceita, isDebitoPix e isCredito
  // para calcular os "Totais do Mês" no topo da tela, para que o Saldo também bata com o Calendário.

  return (
    // ... Estrutura visual do Calendário ...
    // Utilize o componente CelulaDia que definimos acima
  )
}