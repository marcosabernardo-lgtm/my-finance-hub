import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Categoria = { id: number; nome: string; classificacao: string }
type Conta = { id: number; nome: string }

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  backgroundColor: '#0f172a', border: '1px solid #334155',
  color: 'white', boxSizing: 'border-box' as const, marginBottom: 10
}
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 4 }
const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', backgroundColor: '#22c55e', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', width: '100%', marginTop: 8
}

type Props = { householdId: string; categorias: Categoria[]; contas: Conta[] }

export default function LancamentoReceita({ householdId, categorias, contas }: Props) {
  const [dataMov, setDataMov] = useState(hoje())
  const [categoriaId, setCategoriaId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [contaId, setContaId] = useState('')
  const [numMeses, setNumMeses] = useState('1')
  const [descricoesCategoria, setDescricoesCategoria] = useState<string[]>([])
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  function hoje() { return new Date().toISOString().split('T')[0] }

  useEffect(() => {
    if (!categoriaId) { setDescricoesCategoria([]); return }
    supabase.from('movimentacoes').select('descricao').eq('categoria_id', Number(categoriaId))
      .then(({ data }) => {
        if (data) {
          const unicas = [...new Set(data.map(d => d.descricao).filter(Boolean))]
          setDescricoesCategoria(unicas)
        }
      })
  }, [categoriaId])

  function adicionarMeses(data: Date, meses: number): Date {
    return new Date(data.getFullYear(), data.getMonth() + meses, data.getDate())
  }

  function toISO(data: Date): string { return data.toISOString().split('T')[0] }

  async function salvarReceita() {
    if (!categoriaId || !descricao || !valor || !dataMov || !contaId)
      return setMensagem('Preencha todos os campos obrigatórios.')

    setLoading(true)
    setMensagem('')

    const valorTotal = parseFloat(valor)
    const meses = parseInt(numMeses) || 1
    const conta = contas.find(c => c.id === Number(contaId))
    const categoria = categorias.find(c => c.id === Number(categoriaId))
    const classificacao = categoria?.classificacao ?? ''
    const dataBase = new Date(dataMov + 'T12:00:00')
    let registros: any[] = []

    if (meses <= 1) {
      registros.push({
        household_id: householdId, data_movimentacao: dataMov, data_pagamento: dataMov,
        tipo: 'Receita', categoria_id: Number(categoriaId), classificacao, descricao,
        valor: valorTotal, metodo_pagamento: 'Transferência',
        conta_origem_destino: conta?.nome ?? '',
        forma_pagamento: 'À Vista', numero_parcela: 'Parcela 1/1', situacao: 'Pago',
      })
    } else {
      for (let i = 0; i < meses; i++) {
        const dataFutura = adicionarMeses(dataBase, i)
        registros.push({
          household_id: householdId,
          data_movimentacao: toISO(dataFutura), data_pagamento: toISO(dataFutura),
          tipo: 'Receita', categoria_id: Number(categoriaId), classificacao,
          descricao: `${descricao} (${i + 1}/${meses})`,
          valor: valorTotal, metodo_pagamento: 'Transferência',
          conta_origem_destino: conta?.nome ?? '',
          forma_pagamento: 'À Vista', numero_parcela: 'Parcela 1/1',
          situacao: i === 0 ? 'Pago' : 'Pendente',
        })
      }
    }

    const { error } = await supabase.from('movimentacoes').insert(registros)
    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      setMensagem(meses > 1 ? `${meses} receitas lançadas com sucesso!` : 'Receita lançada com sucesso!')
      setDescricao(''); setValor(''); setCategoriaId(''); setContaId(''); setNumMeses('1')
    }
    setLoading(false)
  }

  const categoriasReceita = categorias.filter(c =>
    c.classificacao === 'Renda Ativa' || c.classificacao === 'Renda Passiva'
  )

  return (
    <div style={{ backgroundColor: '#1e293b', padding: 24, borderRadius: 12, border: '1px solid #334155' }}>
      {mensagem && (
        <p style={{ color: mensagem.startsWith('Erro') ? '#ef4444' : '#22c55e', marginBottom: 16, padding: 10, backgroundColor: '#0f172a', borderRadius: 6 }}>
          {mensagem}
        </p>
      )}

      <label style={labelStyle}>Data *</label>
      <input style={inputStyle} type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />

      <label style={labelStyle}>Categoria *</label>
      <select style={inputStyle} value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setDescricao('') }}>
        <option value="">Selecione...</option>
        {categoriasReceita.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.classificacao}</option>)}
      </select>

      <label style={labelStyle}>Descrição *</label>
      <input style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex: Salário Março..." list="sugestoes-receita" />
      <datalist id="sugestoes-receita">
        {descricoesCategoria.map((d, i) => <option key={i} value={d} />)}
      </datalist>

      <label style={labelStyle}>Valor (R$) *</label>
      <input style={inputStyle} type="number" step="0.01" value={valor}
        onChange={e => setValor(e.target.value)} placeholder="0,00" />

      <label style={labelStyle}>Conta de Destino *</label>
      <select style={inputStyle} value={contaId} onChange={e => setContaId(e.target.value)}>
        <option value="">Selecione...</option>
        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <label style={labelStyle}>Recorrência (quantos meses)</label>
      <input style={inputStyle} type="number" min="1" max="60" value={numMeses}
        onChange={e => setNumMeses(e.target.value)} placeholder="1 = lançamento único" />
      {parseInt(numMeses) > 1 && (
        <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>
          Mês 1 será <strong style={{ color: '#22c55e' }}>Pago</strong>, os demais <strong style={{ color: '#f59e0b' }}>Pendente</strong>
        </p>
      )}

      <button style={btnPrimary} onClick={salvarReceita} disabled={loading}>
        {loading ? 'Salvando...' : '💾 Salvar Receita'}
      </button>
    </div>
  )
}