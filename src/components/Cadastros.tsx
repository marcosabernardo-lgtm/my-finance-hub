import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Categoria = { id: number; nome: string; classificacao: string; limite_gastos: number; exemplos: string }
type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number; limite_total: number; ativo: boolean }
type Conta = { id: number; nome: string; saldo_inicial: number; ativo: boolean }

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  backgroundColor: '#0f172a', border: '1px solid #334155',
  color: 'white', boxSizing: 'border-box' as const, marginBottom: 10
}
const labelStyle: React.CSSProperties = { color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 4 }
const btnStyle: React.CSSProperties = {
  padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', width: '100%'
}

type Aba = 'cat-despesa' | 'cat-receita' | 'cartoes' | 'contas'

export default function Cadastros() {
  const [aba, setAba] = useState<Aba>('cat-despesa')

  const [categoriasDespesa, setCategoriasDespesa] = useState<Categoria[]>([])
  const [categoriasReceita, setCategoriasReceita] = useState<Categoria[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])

  // Campos categoria despesa
  const [nomeCategoriaDespesa, setNomeCategoriaDespesa] = useState('')
  const [classificacaoDespesa, setClassificacaoDespesa] = useState('Despesas Essenciais')
  const [limiteGastosDespesa, setLimiteGastosDespesa] = useState('')
  const [exemplosDespesa, setExemplosDespesa] = useState('')
  const [editandoCategoriaDespesa, setEditandoCategoriaDespesa] = useState<number | null>(null)

  // Campos categoria receita
  const [nomeCategoriaReceita, setNomeCategoriaReceita] = useState('')
  const [classificacaoReceita, setClassificacaoReceita] = useState('Renda Ativa')
  const [limiteGastosReceita, setLimiteGastosReceita] = useState('')
  const [editandoCategoriaReceita, setEditandoCategoriaReceita] = useState<number | null>(null)

  // Campos cartão
  const [nomeCartao, setNomeCartao] = useState('')
  const [dataFechamento, setDataFechamento] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [limiteTotal, setLimiteTotal] = useState('')
  const [editandoCartao, setEditandoCartao] = useState<number | null>(null)

  // Campos conta
  const [nomeConta, setNomeConta] = useState('')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [editandoConta, setEditandoConta] = useState<number | null>(null)

  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { carregarTudo() }, [])

  const carregarTudo = () => {
    supabase.from('categorias').select('*').order('nome')
      .then(({ data }) => {
        if (data) {
          setCategoriasDespesa(data.filter(c => c.classificacao !== 'Renda Ativa' && c.classificacao !== 'Renda Passiva'))
          setCategoriasReceita(data.filter(c => c.classificacao === 'Renda Ativa' || c.classificacao === 'Renda Passiva'))
        }
      })
    supabase.from('cartoes').select('*').order('nome')
      .then(({ data }) => data && setCartoes(data))
    supabase.from('contas').select('*').order('nome')
      .then(({ data }) => data && setContas(data))
  }

  const excluir = async (tabela: string, id: number) => {
    if (!confirm('Confirma exclusão?')) return
    await supabase.from(tabela).delete().eq('id', id)
    carregarTudo()
  }

  // ==================== SALVAR / EDITAR ====================

  const salvarCategoriaDespesa = async () => {
    if (!nomeCategoriaDespesa) return setMensagem('Informe o nome da categoria')
    setLoading(true)

    if (editandoCategoriaDespesa) {
      const { error } = await supabase.from('categorias').update({
        nome: nomeCategoriaDespesa, classificacao: classificacaoDespesa,
        limite_gastos: limiteGastosDespesa ? Number(limiteGastosDespesa) : null,
        exemplos: exemplosDespesa || null,
      }).eq('id', editandoCategoriaDespesa)
      if (error) setMensagem('Erro: ' + error.message)
      else { setMensagem('Categoria atualizada!'); setEditandoCategoriaDespesa(null) }
    } else {
      const { error } = await supabase.from('categorias').insert({
        nome: nomeCategoriaDespesa, classificacao: classificacaoDespesa,
        limite_gastos: limiteGastosDespesa ? Number(limiteGastosDespesa) : null,
        exemplos: exemplosDespesa || null,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Categoria salva!')
    }

    setNomeCategoriaDespesa(''); setLimiteGastosDespesa(''); setExemplosDespesa('')
    setLoading(false)
    carregarTudo()
  }

  const editarCategoriaDespesa = (c: Categoria) => {
    setEditandoCategoriaDespesa(c.id)
    setNomeCategoriaDespesa(c.nome)
    setClassificacaoDespesa(c.classificacao)
    setLimiteGastosDespesa(c.limite_gastos ? String(c.limite_gastos) : '')
    setExemplosDespesa(c.exemplos ?? '')
    setMensagem('')
  }

  const salvarCategoriaReceita = async () => {
    if (!nomeCategoriaReceita) return setMensagem('Informe o nome da categoria')
    setLoading(true)

    if (editandoCategoriaReceita) {
      const { error } = await supabase.from('categorias').update({
        nome: nomeCategoriaReceita, classificacao: classificacaoReceita,
        limite_gastos: limiteGastosReceita ? Number(limiteGastosReceita) : 0,
      }).eq('id', editandoCategoriaReceita)
      if (error) setMensagem('Erro: ' + error.message)
      else { setMensagem('Categoria atualizada!'); setEditandoCategoriaReceita(null) }
    } else {
      const { error } = await supabase.from('categorias').insert({
        nome: nomeCategoriaReceita, classificacao: classificacaoReceita,
        limite_gastos: limiteGastosReceita ? Number(limiteGastosReceita) : 0,
        exemplos: null,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Categoria salva!')
    }

    setNomeCategoriaReceita(''); setLimiteGastosReceita('')
    setLoading(false)
    carregarTudo()
  }

  const editarCategoriaReceita = (c: Categoria) => {
    setEditandoCategoriaReceita(c.id)
    setNomeCategoriaReceita(c.nome)
    setClassificacaoReceita(c.classificacao)
    setLimiteGastosReceita(c.limite_gastos ? String(c.limite_gastos) : '')
    setMensagem('')
  }

  const salvarCartao = async () => {
    if (!nomeCartao || !dataFechamento || !dataVencimento)
      return setMensagem('Preencha nome, fechamento e vencimento')
    setLoading(true)

    if (editandoCartao) {
      const { error } = await supabase.from('cartoes').update({
        nome: nomeCartao, data_fechamento: Number(dataFechamento),
        data_vencimento: Number(dataVencimento),
        limite_total: limiteTotal ? Number(limiteTotal) : null,
      }).eq('id', editandoCartao)
      if (error) setMensagem('Erro: ' + error.message)
      else { setMensagem('Cartão atualizado!'); setEditandoCartao(null) }
    } else {
      const { error } = await supabase.from('cartoes').insert({
        nome: nomeCartao, data_fechamento: Number(dataFechamento),
        data_vencimento: Number(dataVencimento),
        limite_total: limiteTotal ? Number(limiteTotal) : null, ativo: true,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Cartão salvo!')
    }

    setNomeCartao(''); setDataFechamento(''); setDataVencimento(''); setLimiteTotal('')
    setLoading(false)
    carregarTudo()
  }

  const editarCartao = (c: Cartao) => {
    setEditandoCartao(c.id)
    setNomeCartao(c.nome)
    setDataFechamento(String(c.data_fechamento))
    setDataVencimento(String(c.data_vencimento))
    setLimiteTotal(c.limite_total ? String(c.limite_total) : '')
    setMensagem('')
  }

  const salvarConta = async () => {
    if (!nomeConta) return setMensagem('Informe o nome da conta')
    setLoading(true)

    if (editandoConta) {
      const { error } = await supabase.from('contas').update({
        nome: nomeConta, saldo_inicial: saldoInicial ? Number(saldoInicial) : 0,
      }).eq('id', editandoConta)
      if (error) setMensagem('Erro: ' + error.message)
      else { setMensagem('Conta atualizada!'); setEditandoConta(null) }
    } else {
      const { error } = await supabase.from('contas').insert({
        nome: nomeConta, saldo_inicial: saldoInicial ? Number(saldoInicial) : 0, ativo: true,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Conta salva!')
    }

    setNomeConta(''); setSaldoInicial('')
    setLoading(false)
    carregarTudo()
  }

  const editarConta = (c: Conta) => {
    setEditandoConta(c.id)
    setNomeConta(c.nome)
    setSaldoInicial(c.saldo_inicial ? String(c.saldo_inicial) : '')
    setMensagem('')
  }

  const cancelarEdicao = () => {
    setEditandoCategoriaDespesa(null); setNomeCategoriaDespesa(''); setLimiteGastosDespesa(''); setExemplosDespesa('')
    setEditandoCategoriaReceita(null); setNomeCategoriaReceita(''); setLimiteGastosReceita('')
    setEditandoCartao(null); setNomeCartao(''); setDataFechamento(''); setDataVencimento(''); setLimiteTotal('')
    setEditandoConta(null); setNomeConta(''); setSaldoInicial('')
    setMensagem('')
  }

  const abas = [
    { key: 'cat-despesa', label: '📂 Categorias Despesas' },
    { key: 'cat-receita', label: '💰 Categorias Receitas' },
    { key: 'cartoes', label: '💳 Cartões' },
    { key: 'contas', label: '🏦 Contas' },
  ] as const

  const itemRow = (nome: string, detalhe: string, id: number, tabela: string, onEdit: () => void) => (
    <div key={id} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: 6
    }}>
      <div style={{ flex: 1 }}>
        <span style={{ color: 'white', fontWeight: 'bold' }}>{nome}</span>
        {detalhe && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{detalhe}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onEdit} style={{
          backgroundColor: '#f59e0b', border: 'none', color: 'white',
          padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12
        }}>✏️</button>
        <button onClick={() => excluir(tabela, id)} style={{
          backgroundColor: '#ef4444', border: 'none', color: 'white',
          padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12
        }}>✕</button>
      </div>
    </div>
  )

  const isEditando = editandoCategoriaDespesa || editandoCategoriaReceita || editandoCartao || editandoConta

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ color: 'white', marginBottom: 24 }}>⚙️ Cadastros</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {abas.map(a => (
          <button key={a.key} onClick={() => { setAba(a.key); cancelarEdicao() }} style={{
            padding: '8px 16px',
            backgroundColor: aba === a.key ? '#3b82f6' : '#1e293b',
            color: 'white', border: '1px solid #334155',
            borderRadius: 6, cursor: 'pointer', fontWeight: aba === a.key ? 'bold' : 'normal'
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {mensagem && (
        <p style={{
          color: mensagem.startsWith('Erro') ? '#ef4444' : '#22c55e',
          marginBottom: 16, padding: 10, backgroundColor: '#1e293b', borderRadius: 6
        }}>{mensagem}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* FORMULÁRIO */}
        <div style={{ backgroundColor: '#1e293b', padding: 24, borderRadius: 12, border: `1px solid ${isEditando ? '#f59e0b' : '#334155'}` }}>

          {aba === 'cat-despesa' && (
            <>
              <h3 style={{ color: isEditando ? '#f59e0b' : 'white', marginBottom: 16 }}>
                {editandoCategoriaDespesa ? '✏️ Editando Categoria' : '📂 Nova Categoria de Despesa'}
              </h3>

              <label style={labelStyle}>Nome *</label>
              <input style={inputStyle} value={nomeCategoriaDespesa}
                onChange={e => setNomeCategoriaDespesa(e.target.value)} placeholder="Ex: Alimentação" />

              <label style={labelStyle}>Classificação</label>
              <select style={inputStyle} value={classificacaoDespesa} onChange={e => setClassificacaoDespesa(e.target.value)}>
                <option>Despesas Essenciais</option>
                <option>Despesas Não Essenciais</option>
                <option>Metas / Investimentos</option>
              </select>

              <label style={labelStyle}>Limite de Gastos (R$)</label>
              <input style={inputStyle} type="number" value={limiteGastosDespesa}
                onChange={e => setLimiteGastosDespesa(e.target.value)} placeholder="Ex: 800" />

              <label style={labelStyle}>Exemplos</label>
              <input style={inputStyle} value={exemplosDespesa}
                onChange={e => setExemplosDespesa(e.target.value)} placeholder="Ex: Mercado, Restaurante" />

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={salvarCategoriaDespesa} disabled={loading}>
                  {loading ? 'Salvando...' : editandoCategoriaDespesa ? '✏️ Atualizar' : '+ Salvar'}
                </button>
                {editandoCategoriaDespesa && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#64748b', width: 'auto', padding: '10px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}

          {aba === 'cat-receita' && (
            <>
              <h3 style={{ color: isEditando ? '#f59e0b' : 'white', marginBottom: 16 }}>
                {editandoCategoriaReceita ? '✏️ Editando Categoria' : '💰 Nova Categoria de Receita'}
              </h3>

              <label style={labelStyle}>Nome *</label>
              <input style={inputStyle} value={nomeCategoriaReceita}
                onChange={e => setNomeCategoriaReceita(e.target.value)} placeholder="Ex: Salário, Freelance" />

              <label style={labelStyle}>Classificação</label>
              <select style={inputStyle} value={classificacaoReceita} onChange={e => setClassificacaoReceita(e.target.value)}>
                <option>Renda Ativa</option>
                <option>Renda Passiva</option>
              </select>

              <label style={labelStyle}>Valor Previsto (R$)</label>
              <input style={inputStyle} type="number" value={limiteGastosReceita}
                onChange={e => setLimiteGastosReceita(e.target.value)} placeholder="Ex: 8000" />

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={salvarCategoriaReceita} disabled={loading}>
                  {loading ? 'Salvando...' : editandoCategoriaReceita ? '✏️ Atualizar' : '+ Salvar'}
                </button>
                {editandoCategoriaReceita && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#64748b', width: 'auto', padding: '10px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}

          {aba === 'cartoes' && (
            <>
              <h3 style={{ color: isEditando ? '#f59e0b' : 'white', marginBottom: 16 }}>
                {editandoCartao ? '✏️ Editando Cartão' : '💳 Novo Cartão'}
              </h3>

              <label style={labelStyle}>Nome do Cartão *</label>
              <input style={inputStyle} value={nomeCartao}
                onChange={e => setNomeCartao(e.target.value)} placeholder="Ex: Nubank" />

              <label style={labelStyle}>Dia de Fechamento *</label>
              <input style={inputStyle} type="number" min="1" max="31" value={dataFechamento}
                onChange={e => setDataFechamento(e.target.value)} placeholder="Ex: 23" />

              <label style={labelStyle}>Dia de Vencimento *</label>
              <input style={inputStyle} type="number" min="1" max="31" value={dataVencimento}
                onChange={e => setDataVencimento(e.target.value)} placeholder="Ex: 2" />

              <label style={labelStyle}>Limite Total (R$)</label>
              <input style={inputStyle} type="number" value={limiteTotal}
                onChange={e => setLimiteTotal(e.target.value)} placeholder="Ex: 5000" />

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={salvarCartao} disabled={loading}>
                  {loading ? 'Salvando...' : editandoCartao ? '✏️ Atualizar' : '+ Salvar'}
                </button>
                {editandoCartao && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#64748b', width: 'auto', padding: '10px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}

          {aba === 'contas' && (
            <>
              <h3 style={{ color: isEditando ? '#f59e0b' : 'white', marginBottom: 16 }}>
                {editandoConta ? '✏️ Editando Conta' : '🏦 Nova Conta'}
              </h3>

              <label style={labelStyle}>Nome da Conta *</label>
              <input style={inputStyle} value={nomeConta}
                onChange={e => setNomeConta(e.target.value)} placeholder="Ex: Nubank" />

              <label style={labelStyle}>Saldo Inicial (R$)</label>
              <input style={inputStyle} type="number" value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)} placeholder="Ex: 1500" />

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={salvarConta} disabled={loading}>
                  {loading ? 'Salvando...' : editandoConta ? '✏️ Atualizar' : '+ Salvar'}
                </button>
                {editandoConta && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#64748b', width: 'auto', padding: '10px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* LISTA */}
        <div style={{ backgroundColor: '#1e293b', padding: 24, borderRadius: 12, border: '1px solid #334155' }}>
          <h3 style={{ color: 'white', marginBottom: 16 }}>
            {aba === 'cat-despesa' && `Categorias Despesas (${categoriasDespesa.length})`}
            {aba === 'cat-receita' && `Categorias Receitas (${categoriasReceita.length})`}
            {aba === 'cartoes' && `Cartões (${cartoes.length})`}
            {aba === 'contas' && `Contas (${contas.length})`}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 450, overflowY: 'auto' }}>
            {aba === 'cat-despesa' && (
              categoriasDespesa.length === 0
                ? <p style={{ color: '#64748b' }}>Nenhuma categoria cadastrada.</p>
                : categoriasDespesa.map(c => itemRow(
                    c.nome,
                    `${c.classificacao}${c.limite_gastos > 0 ? ` · Limite: R$ ${c.limite_gastos}` : ''}`,
                    c.id, 'categorias', () => editarCategoriaDespesa(c)
                  ))
            )}
            {aba === 'cat-receita' && (
              categoriasReceita.length === 0
                ? <p style={{ color: '#64748b' }}>Nenhuma categoria cadastrada.</p>
                : categoriasReceita.map(c => itemRow(
                    c.nome,
                    `${c.classificacao}${c.limite_gastos > 0 ? ` · Previsto: R$ ${c.limite_gastos}` : ''}`,
                    c.id, 'categorias', () => editarCategoriaReceita(c)
                  ))
            )}
            {aba === 'cartoes' && (
              cartoes.length === 0
                ? <p style={{ color: '#64748b' }}>Nenhum cartão cadastrado.</p>
                : cartoes.map(c => itemRow(
                    c.nome,
                    `Fecha dia ${c.data_fechamento} · Vence dia ${c.data_vencimento}${c.limite_total ? ` · Limite: R$ ${c.limite_total}` : ''}`,
                    c.id, 'cartoes', () => editarCartao(c)
                  ))
            )}
            {aba === 'contas' && (
              contas.length === 0
                ? <p style={{ color: '#64748b' }}>Nenhuma conta cadastrada.</p>
                : contas.map(c => itemRow(
                    c.nome,
                    c.saldo_inicial > 0 ? `Saldo inicial: R$ ${c.saldo_inicial}` : '',
                    c.id, 'contas', () => editarConta(c)
                  ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}