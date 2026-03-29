import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LancamentoDespesa from './LancamentoDespesa'
import LancamentoReceita from './LancamentoReceita'
import LancamentoFatura from './LancamentoFatura'
import LancamentoTransferencia from './LancamentoTransferencia'

type Categoria = { id: number; nome: string; classificacao: string }
type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number }
type Conta = { id: number; nome: string }

export default function Lancamento() {
  const [aba, setAba] = useState<'despesa' | 'receita' | 'transferencia' | 'fatura'>('despesa')
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
    { key: 'despesa',      label: 'Despesa',       color: '#ef4444' },
    { key: 'receita',      label: 'Receita',        color: '#22c55e' },
    { key: 'transferencia',label: 'Transferência',  color: '#8b5cf6' },
    { key: 'fatura',       label: 'Pag. Fatura',    color: '#f59e0b' },
  ] as const

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', margin: 0 }}>Lançamentos</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Registre despesas, receitas e transferências</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {abas.map(a => {
          const ativa = aba === a.key
          return (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: '8px 18px',
              backgroundColor: ativa ? a.color : '#f9fafb',
              color: ativa ? 'white' : '#374151',
              border: `1px solid ${ativa ? a.color : '#e5e7eb'}`,
              borderRadius: 6, cursor: 'pointer',
              fontWeight: ativa ? 600 : 400,
              fontSize: 13, transition: 'all 0.15s'
            }}>
              {a.label}
            </button>
          )
        })}
      </div>

      {!householdId ? (
        <p style={{ color: '#ef4444' }}>Carregando dados...</p>
      ) : (
        <>
          {aba === 'despesa'       && <LancamentoDespesa      householdId={householdId} categorias={categorias} cartoes={cartoes} contas={contas} />}
          {aba === 'receita'       && <LancamentoReceita      householdId={householdId} categorias={categorias} contas={contas} />}
          {aba === 'transferencia' && <LancamentoTransferencia householdId={householdId} categorias={categorias} contas={contas} />}
          {aba === 'fatura'        && <LancamentoFatura       householdId={householdId} cartoes={cartoes} contas={contas} />}
        </>
      )}
    </div>
  )
}
