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
  padding: '10px 20px', backgroundColor: '#8b5cf6', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  width: '100%', marginTop: 8, fontSize: 13,
}

type Props = { householdId: string; categorias: Categoria[]; contas: Conta[] }

export default function LancamentoTransferencia({ householdId, categorias, contas }: Props) {
  const [dataMov, setDataMov]         = useState(hoje())
  const [contaOrigemId, setContaOrigemId] = useState('')
  const [contaDestinoId, setContaDestinoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [descricao, setDescricao]     = useState('')
  const [valor, setValor]             = useState('')
  const [mensagem, setMensagem]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [descricoesCategoria, setDescricoesCategoria] = useState<string[]>([])

  function hoje() { return new Date().toISOString().split('T')[0] }

  // Sugestões de descrição baseadas na categoria
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

  async function salvarTransferencia() {
    if (!contaOrigemId || !contaDestinoId || !valor || !dataMov)
      return setMensagem('Preencha conta origem, destino, valor e data.')
    if (contaOrigemId === contaDestinoId)
      return setMensagem('Conta origem e destino devem ser diferentes.')

    setLoading(true); setMensagem('')

    const contaOrigem  = contas.find(c => c.id === Number(contaOrigemId))
    const contaDestino = contas.find(c => c.id === Number(contaDestinoId))
    const categoria    = categorias.find(c => c.id === Number(categoriaId))
    const grupoId      = crypto.randomUUID()
    const valorNum     = parseFloat(valor)
    const desc         = descricao || `Transferência ${contaOrigem?.nome} → ${contaDestino?.nome}`

    // Lança saída na conta origem (Despesa / Transferência)
    const saida = {
      household_id: householdId,
      data_movimentacao: dataMov,
      data_pagamento: dataMov,
      tipo: 'Transferência',
      categoria_id: categoriaId ? Number(categoriaId) : null,
      classificacao: categoria?.classificacao ?? null,
      descricao: desc,
      valor: valorNum,
      metodo_pagamento: 'Transferência entre Contas',
      conta_origem_destino: contaOrigem?.nome ?? '',
      forma_pagamento: 'A Vista',
      numero_parcela: 'Parcela 1/1',
      situacao: 'Pago',
      grupo_id: grupoId,
    }

    // Lança entrada na conta destino (Receita / Transferência)
    const entrada = {
      household_id: householdId,
      data_movimentacao: dataMov,
      data_pagamento: dataMov,
      tipo: 'Receita',
      categoria_id: categoriaId ? Number(categoriaId) : null,
      classificacao: categoria?.classificacao ?? null,
      descricao: desc,
      valor: valorNum,
      metodo_pagamento: 'Transferência entre Contas',
      conta_origem_destino: contaDestino?.nome ?? '',
      forma_pagamento: 'A Vista',
      numero_parcela: 'Parcela 1/1',
      situacao: 'Pago',
      grupo_id: grupoId,
    }

    const { error } = await supabase.from('movimentacoes').insert([saida, entrada])

    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      setMensagem(`Transferência de ${valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada com sucesso!`)
      setContaOrigemId(''); setContaDestinoId(''); setCategoriaId('')
      setDescricao(''); setValor(''); setDataMov(hoje())
    }
    setLoading(false)
  }

  // Categorias de metas/investimentos aparecem primeiro, depois todas
  const categoriasOrdenadas = [
    ...categorias.filter(c => c.classificacao === 'Metas / Investimentos'),
    ...categorias.filter(c => c.classificacao !== 'Metas / Investimentos'),
  ]

  const contaDestino = contas.find(c => c.id === Number(contaDestinoId))
  const contaOrigem  = contas.find(c => c.id === Number(contaOrigemId))

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

      {/* Preview da transferência */}
      {contaOrigem && contaDestino && valor && (
        <div style={{
          background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 8,
          padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#5b21b6',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontWeight: 700 }}>{contaOrigem.nome}</span>
          <span style={{ fontSize: 18 }}>→</span>
          <span style={{ fontWeight: 700 }}>{contaDestino.nome}</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 15 }}>
            {parseFloat(valor || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      )}

      <label style={labelStyle}>Data *</label>
      <input style={inputStyle} type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />

      <label style={labelStyle}>Conta Origem *</label>
      <select style={inputStyle} value={contaOrigemId} onChange={e => setContaOrigemId(e.target.value)}>
        <option value="">Selecione...</option>
        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <label style={labelStyle}>Conta Destino *</label>
      <select style={inputStyle} value={contaDestinoId} onChange={e => setContaDestinoId(e.target.value)}>
        <option value="">Selecione...</option>
        {contas.filter(c => c.id !== Number(contaOrigemId)).map(c => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </select>

      <label style={labelStyle}>Valor (R$) *</label>
      <input style={inputStyle} type="number" step="0.01" value={valor}
        onChange={e => setValor(e.target.value)} placeholder="0,00" />

      <label style={labelStyle}>Categoria <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
      <select style={inputStyle} value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setDescricao('') }}>
        <option value="">Sem categoria</option>
        {categoriasOrdenadas.map(c => (
          <option key={c.id} value={c.id}>
            {c.classificacao === 'Metas / Investimentos' ? '⭐ ' : ''}{c.nome}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Descrição <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
      <input style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder={`Ex: FGTS ${new Date().toLocaleString('pt-BR', { month: 'long' })}...`}
        list="sugestoes-transferencia" />
      <datalist id="sugestoes-transferencia">
        {descricoesCategoria.map((d, i) => <option key={i} value={d} />)}
      </datalist>

      <button style={btnPrimary} onClick={salvarTransferencia} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar Transferência'}
      </button>
    </div>
  )
}
