import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LancamentoDespesa from './LancamentoDespesa'
import LancamentoReceita from './LancamentoReceita'
import LancamentoPrevisto from './LancamentoPrevisto'
import LancamentoFatura from './LancamentoFatura'

type Categoria = { id: number; nome: string; classificacao: string }
type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number }
type Conta = { id: number; nome: string }

export default function Lancamento() {
  const [aba, setAba] = useState<'despesa' | 'receita' | 'previsto' | 'fatura'>('despesa')
  const [householdId, setHouseholdId] = useState<string>('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])

  useEffect(() => {
    supabase.from('household_members').select('household_id').single()
      .then(({ data }) => { if (data) setHouseholdId(data.household_id) })

    supabase.from('categorias').select('id, nome, classificacao').order('nome')
      .then(({ data }) => data && setCategorias(data))

    supabase.from('cartoes').select('id, nome, data_fechamento, data_vencimento').order('nome')
      .then(({ data }) => data && setCartoes(data))

    supabase.from('contas').select('id, nome').order('nome')
      .then(({ data }) => data && setContas(data))
  }, [])

  const abas = [
    { key: 'despesa', label: '💸 Despesa' },
    { key: 'receita', label: '💰 Receita' },
    { key: 'previsto', label: '🔮 Previsto' },
    { key: 'fatura', label: '💳 Pag. Fatura' },
  ] as const

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ color: 'white', marginBottom: 24 }}>💸 Lançamentos</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)} style={{
            padding: '8px 16px',
            backgroundColor: aba === a.key ? '#3b82f6' : '#1e293b',
            color: 'white', border: '1px solid #334155',
            borderRadius: 6, cursor: 'pointer', fontWeight: aba === a.key ? 'bold' : 'normal'
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {!householdId ? (
        <p style={{ color: '#ef4444' }}>Carregando dados...</p>
      ) : (
        <>
          {aba === 'despesa' && <LancamentoDespesa householdId={householdId} categorias={categorias} cartoes={cartoes} contas={contas} />}
          {aba === 'receita' && <LancamentoReceita householdId={householdId} categorias={categorias} contas={contas} />}
          {aba === 'previsto' && <LancamentoPrevisto householdId={householdId} categorias={categorias} cartoes={cartoes} contas={contas} />}
          {aba === 'fatura' && <LancamentoFatura householdId={householdId} cartoes={cartoes} contas={contas} />}
        </>
      )}
    </div>
  )
}