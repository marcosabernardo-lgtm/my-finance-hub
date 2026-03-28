import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Categoria = { id: number; nome: string; classificacao: string }
type Conta = { id: number; nome: string }

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  backgroundColor: '#fff', border: '1px solid #d1d5db',
  color: '#111827', boxSizing: 'border-box' as const, marginBottom: 10, fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 600, display: 'block',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em'
}
const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', backgroundColor: '#22c55e', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  width: '100%', marginTop: 8, fontSize: 13,
}

type Props = { householdId: string; categorias: Categoria[]; contas: Conta[] }

export default function LancamentoReceita({ householdId, categorias, contas }: Props) {
  const [dataMov, setDataMov] = useState(hoje())
  const [categoriaId, setCategoriaId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [contaId, setContaId] = useState('')
  const [isPrevisto, setIsPrevisto] = useState(false)
  const [dataInicio, setDataInicio] = useState('')
  const [numMeses, setNumMeses] = useState('2')
  const [descricoesCategoria, setDescricoesCategoria] = useState<string[]>([])
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  function hoje() { return new Date().toISOString().split('T')[0] }

  useEffect(() => {
    if (!categoriaId) { setDescricoesCategoria([]); return }
    supabase.from('movimentacoes').select('descricao').eq('categoria_id', Number(categoriaId))
      .then(({ data }) => {
        if (data) {
          const unicas = [...new Set(data.map((d: any) => d.descricao).filter(Boolean))]
          setDescricoesCategoria(unicas as string[])
        }
      })
  }, [categoriaId])

  function adicionarMeses(data: Date, meses: number): Date {
    return new Date(data.getFullYear(), data.getMonth() + meses, data.getDate())
  }
  function toISO(data: Date): string { return data.toISOString().split('T')[0] }

  async function salvarReceita() {
    if (!categoriaId || !descricao || !valor || !dataMov || !contaId)
      return setMensagem('Preencha todos os campos obrigatorios.')
    if (isPrevisto && !dataInicio)
      return setMensagem('Informe a data do 1o recebimento.')

    setLoading(true); setMensagem('')

    const valorTotal = parseFloat(valor)
    const meses = isPrevisto ? (parseInt(numMeses) || 2) : 1
    const conta = contas.find(c => c.id === Number(contaId))
    const categoria = categorias.find(c => c.id === Number(categoriaId))
    const classificacao = categoria?.classificacao ?? ''
    const grupoId = crypto.randomUUID()
    let registros: any[] = []

    if (!isPrevisto) {
      registros.push({
        household_id: householdId, data_movimentacao: dataMov, data_pagamento: dataMov,
        tipo: 'Receita', categoria_id: Number(categoriaId), classificacao, descricao,
        valor: valorTotal, metodo_pagamento: 'Transferencia',
        conta_origem_destino: conta?.nome ?? '',
        forma_pagamento: 'A Vista', numero_parcela: 'Parcela 1/1',
        situacao: 'Pago', grupo_id: grupoId,
      })
    } else {
      const dataBase = new Date(dataInicio + 'T12:00:00')
      for (let i = 0; i < meses; i++) {
        const dataFutura = adicionarMeses(dataBase, i)
        registros.push({
          household_id: householdId,
          data_movimentacao: toISO(dataFutura), data_pagamento: toISO(dataFutura),
          tipo: 'Receita', categoria_id: Number(categoriaId), classificacao, descricao,
          valor: valorTotal, metodo_pagamento: 'Transferencia',
          conta_origem_destino: conta?.nome ?? '',
          forma_pagamento: 'A Vista', numero_parcela: `Parcela ${i + 1}/${meses}`,
          situacao: 'Previsto', grupo_id: grupoId,
        })
      }
    }

    const { error } = await supabase.from('movimentacoes').insert(registros)
    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      setMensagem(meses > 1 ? `${meses} receitas lancadas com sucesso!` : 'Receita lancada com sucesso!')
      setDescricao(''); setValor(''); setCategoriaId(''); setContaId('')
      setDataInicio(''); setNumMeses('2'); setIsPrevisto(false)
    }
    setLoading(false)
  }

  const categoriasReceita = categorias.filter(c =>
    c.classificacao === 'Renda Ativa' || c.classificacao === 'Renda Passiva'
  )

  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e5e7eb' }}>
      {mensagem && (
        <div style={{
          color: mensagem.startsWith('Erro') ? '#991b1b' : '#166534',
          background: mensagem.startsWith('Erro') ? '#fee2e2' : '#dcfce7',
          border: `1px solid ${mensagem.startsWith('Erro') ? '#fca5a5' : '#86efac'}`,
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13
        }}>{mensagem}</div>
      )}

      {/* Toggle Previsto */}
      <div
        onClick={() => setIsPrevisto(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          cursor: 'pointer', userSelect: 'none',
          background: isPrevisto ? '#f0fdf4' : '#f9fafb',
          border: `1px solid ${isPrevisto ? '#86efac' : '#e5e7eb'}`,
          borderRadius: 8, padding: '10px 14px',
        }}
      >
        <div style={{
          width: 36, height: 20, borderRadius: 10,
          background: isPrevisto ? '#22c55e' : '#d1d5db',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2,
            left: isPrevisto ? 18 : 2, transition: 'left 0.2s',
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
            {isPrevisto ? 'Previsao Futura' : 'Lancamento Unico'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {isPrevisto ? 'Lancamentos futuros como Previsto' : 'Receita ja recebida hoje'}
          </div>
        </div>
      </div>

      <label style={labelStyle}>Data *</label>
      <input style={inputStyle} type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />

      <label style={labelStyle}>Categoria *</label>
      <select style={inputStyle} value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setDescricao('') }}>
        <option value="">Selecione...</option>
        {categoriasReceita.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <label style={labelStyle}>Descricao *</label>
      <input style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex: Salario Marco..." list="sugestoes-receita" />
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

      {isPrevisto && (
        <>
          <label style={labelStyle}>Data do 1o Recebimento *</label>
          <input style={inputStyle} type="date" value={dataInicio}
            onChange={e => setDataInicio(e.target.value)} />

          <label style={labelStyle}>Quantidade de Meses</label>
          <input style={inputStyle} type="number" min="2" max="60" value={numMeses}
            onChange={e => setNumMeses(e.target.value)} />

          {parseInt(numMeses) > 0 && dataInicio && valor && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: '#166534' }}>
              {parseInt(numMeses)} lancamentos de {parseFloat(valor || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} a partir de {new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} — todos como <strong>Previsto</strong>
            </div>
          )}
        </>
      )}

      <button style={btnPrimary} onClick={salvarReceita} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar Receita'}
      </button>
    </div>
  )
}
