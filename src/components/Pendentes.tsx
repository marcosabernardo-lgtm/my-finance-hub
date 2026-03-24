import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Check, AlertCircle, Clock, Calendar as CalendarIcon, Wallet, CreditCard } from 'lucide-react'

interface Movimentacao {
  id: number
  descricao: string
  valor: number
  data_movimentacao: string
  data_pagamento: string | null
  tipo: string
  situacao: string
  metodo_pagamento: string
  forma_pagamento: string | null
  categoria_id: number | null
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => d.split('-').reverse().join('/')

export default function Pendentes() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'atrasados' | 'hoje' | 'futuros'>('todos')

  const hoje = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchPendentes = async () => {
    if (!householdId) return
    setLoading(true)
    const { data } = await supabase
      .from('movimentacoes')
      .select('*')
      .eq('household_id', householdId)
      .in('situacao', ['Pendente', 'Previsto'])
      .order('data_pagamento', { ascending: true })
    
    setMovimentacoes(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchPendentes() }, [householdId])

  const confirmarPagamento = async (mov: Movimentacao) => {
    const acao = mov.situacao === 'Previsto' ? 'confirmar' : 'pagar'
    if (!confirm(`Deseja ${acao} "${mov.descricao}"?`)) return

    // REGRA DE NEGÓCIO: 
    // Se for Cartão e era Previsto -> Vira Pendente (vai pra fatura)
    // Se for Débito/PIX/Boleto -> Vira Pago
    const novaSituacao = mov.metodo_pagamento === 'Cartão de Crédito' ? 'Pendente' : 'Pago'
    
    // Se virou Pago, a data de pagamento é HOJE. Se for Cartão, mantém a data da fatura.
    const novaDataPagamento = novaSituacao === 'Pago' ? hoje : mov.data_pagamento

    const { error } = await supabase
      .from('movimentacoes')
      .update({ 
        situacao: novaSituacao,
        data_pagamento: novaDataPagamento,
        updated_at: new Date().toISOString()
      })
      .eq('id', mov.id)

    if (error) {
      alert('Erro: ' + error.message)
    } else {
      // Remove da lista local para dar feedback visual imediato
      setMovimentacoes(prev => prev.filter(m => m.id !== mov.id))
    }
  }

  const filtradas = useMemo(() => {
    return movimentacoes.filter(m => {
      const dataRef = m.data_pagamento || m.data_movimentacao
      if (filtro === 'atrasados') return dataRef < hoje
      if (filtro === 'hoje') return dataRef === hoje
      if (filtro === 'futuros') return dataRef > hoje
      return true
    })
  }, [movimentacoes, filtro, hoje])

  const total = filtradas.reduce((acc, m) => acc + Number(m.valor), 0)

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#111827' }}>Pendentes & Previstos</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>Gerencie compromissos financeiros em aberto</p>
        </div>
        
        <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
          {(['todos', 'atrasados', 'hoje', 'futuros'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                background: filtro === f ? '#fff' : 'transparent',
                boxShadow: filtro === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                color: filtro === f ? '#111827' : '#6b7280',
                textTransform: 'capitalize'
              }}
            >
              {f === 'todos' ? 'Tudo' : f}
            </button>
          ))}
        </div>
      </header>

      <div style={{ background: '#111827', color: '#fff', padding: '24px', borderRadius: '16px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Selecionado</span>
          <div style={{ fontSize: '32px', fontWeight: 700, marginTop: '4px' }}>{fmt(total)}</div>
        </div>
        <Clock size={40} color="#374151" />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Buscando lançamentos...</div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#f9fafb', borderRadius: '16px', border: '2px dashed #e5e7eb' }}>
          <Check size={48} color="#10b981" style={{ marginBottom: '16px' }} />
          <p style={{ fontWeight: 600, color: '#374151', fontSize: '18px', margin: 0 }}>Tudo em dia!</p>
          <p style={{ color: '#6b7280', marginTop: '8px' }}>Não existem pendências para este filtro.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {filtradas.map(m => {
            const dataRef = m.data_pagamento || m.data_movimentacao
            const atrasado = dataRef < hoje
            const isCartao = m.metodo_pagamento === 'Cartão de Crédito'
            
            return (
              <div key={m.id} style={{ 
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: atrasado ? '#fee2e2' : '#f3f4f6', color: atrasado ? '#ef4444' : '#6b7280'
                  }}>
                    {isCartao ? <CreditCard size={24} /> : <Wallet size={24} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: '16px' }}>{m.descricao}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: atrasado ? '#ef4444' : 'inherit', fontWeight: atrasado ? 600 : 400 }}>
                        {atrasado ? 'Vencido em: ' : 'Vence em: '} {fmtDate(dataRef)}
                      </span>
                      <span>•</span>
                      <span>{m.metodo_pagamento}</span>
                      {m.situacao === 'Previsto' && (
                        <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>PREVISTO</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '18px' }}>{fmt(Number(m.valor))}</div>
                  </div>
                  <button 
                    onClick={() => confirmarPagamento(m)}
                    style={{ 
                      background: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px',
                      fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
                  >
                    <Check size={18} /> {m.situacao === 'Previsto' ? 'Confirmar' : 'Baixar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}