import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type Categoria = { id: number; nome: string; classificacao: string; limite_gastos: number; exemplos: string }
type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number; limite_total: number; ativo: boolean }
type Conta = { id: number; nome: string; saldo_inicial: number; data_inicial: string | null; ativo: boolean; tipo: string }

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  background: '#fff', border: '1px solid #d1d5db',
  color: '#111827', boxSizing: 'border-box' as const, marginBottom: 10,
  fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 600,
  display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em'
}
const btnStyle: React.CSSProperties = {
  padding: '9px 20px', backgroundColor: '#2563eb', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  width: '100%', fontSize: 13,
}

type Aba = 'cat-despesa' | 'cat-receita' | 'cartoes' | 'contas'

export default function Cadastros() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('cat-despesa')
  const [categoriasDespesa, setCategoriasDespesa] = useState<Categoria[]>([])
  const [categoriasReceita, setCategoriasReceita] = useState<Categoria[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])

  const [nomeCategoriaDespesa, setNomeCategoriaDespesa] = useState('')
  const [classificacaoDespesa, setClassificacaoDespesa] = useState('Despesas Essenciais')
  const [limiteGastosDespesa, setLimiteGastosDespesa] = useState('')
  const [exemplosDespesa, setExemplosDespesa] = useState('')
  const [editandoCategoriaDespesa, setEditandoCategoriaDespesa] = useState<number | null>(null)

  const [nomeCategoriaReceita, setNomeCategoriaReceita] = useState('')
  const [classificacaoReceita, setClassificacaoReceita] = useState('Renda Ativa')
  const [limiteGastosReceita, setLimiteGastosReceita] = useState('')
  const [editandoCategoriaReceita, setEditandoCategoriaReceita] = useState<number | null>(null)

  const [nomeCartao, setNomeCartao] = useState('')
  const [dataFechamento, setDataFechamento] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [limiteTotal, setLimiteTotal] = useState('')
  const [editandoCartao, setEditandoCartao] = useState<number | null>(null)

  const [nomeConta, setNomeConta] = useState('')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [dataInicial, setDataInicial] = useState('')
  const [tipoConta, setTipoConta] = useState('corrente')
  const [editandoConta, setEditandoConta] = useState<number | null>(null)

  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Busca householdId do usuário logado ──────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  useEffect(() => {
    if (householdId) carregarTudo()
  }, [householdId])

  const carregarTudo = () => {
    if (!householdId) return
    supabase.from('categorias').select('*').eq('household_id', householdId).order('nome')
      .then(({ data }) => {
        if (data) {
          setCategoriasDespesa(data.filter(c => c.classificacao !== 'Renda Ativa' && c.classificacao !== 'Renda Passiva'))
          setCategoriasReceita(data.filter(c => c.classificacao === 'Renda Ativa' || c.classificacao === 'Renda Passiva'))
        }
      })
    supabase.from('cartoes').select('*').eq('household_id', householdId).order('nome')
      .then(({ data }) => data && setCartoes(data))
    supabase.from('contas').select('*').eq('household_id', householdId).order('nome')
      .then(({ data }) => data && setContas(data))
  }

  const excluir = async (tabela: string, id: number) => {
    if (!confirm('Confirma exclusão?')) return
    await supabase.from(tabela).delete().eq('id', id)
    carregarTudo()
  }

  // ── Categorias Despesa ───────────────────────────────────────────────────────
  const salvarCategoriaDespesa = async () => {
    if (!nomeCategoriaDespesa) return setMensagem('Informe o nome da categoria')
    if (!householdId) return setMensagem('Erro: household não encontrado')
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
        household_id: householdId,
        nome: nomeCategoriaDespesa, classificacao: classificacaoDespesa,
        limite_gastos: limiteGastosDespesa ? Number(limiteGastosDespesa) : null,
        exemplos: exemplosDespesa || null,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Categoria salva!')
    }
    setNomeCategoriaDespesa(''); setLimiteGastosDespesa(''); setExemplosDespesa('')
    setLoading(false); carregarTudo()
  }

  const editarCategoriaDespesa = (c: Categoria) => {
    setEditandoCategoriaDespesa(c.id); setNomeCategoriaDespesa(c.nome)
    setClassificacaoDespesa(c.classificacao)
    setLimiteGastosDespesa(c.limite_gastos ? String(c.limite_gastos) : '')
    setExemplosDespesa(c.exemplos ?? ''); setMensagem('')
  }

  // ── Categorias Receita ───────────────────────────────────────────────────────
  const salvarCategoriaReceita = async () => {
    if (!nomeCategoriaReceita) return setMensagem('Informe o nome da categoria')
    if (!householdId) return setMensagem('Erro: household não encontrado')
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
        household_id: householdId,
        nome: nomeCategoriaReceita, classificacao: classificacaoReceita,
        limite_gastos: limiteGastosReceita ? Number(limiteGastosReceita) : 0,
        exemplos: null,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Categoria salva!')
    }
    setNomeCategoriaReceita(''); setLimiteGastosReceita('')
    setLoading(false); carregarTudo()
  }

  const editarCategoriaReceita = (c: Categoria) => {
    setEditandoCategoriaReceita(c.id); setNomeCategoriaReceita(c.nome)
    setClassificacaoReceita(c.classificacao)
    setLimiteGastosReceita(c.limite_gastos ? String(c.limite_gastos) : ''); setMensagem('')
  }

  // ── Cartões ──────────────────────────────────────────────────────────────────
  const salvarCartao = async () => {
    if (!nomeCartao || !dataFechamento || !dataVencimento)
      return setMensagem('Preencha nome, fechamento e vencimento')
    if (!householdId) return setMensagem('Erro: household não encontrado')
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
        household_id: householdId,
        nome: nomeCartao, data_fechamento: Number(dataFechamento),
        data_vencimento: Number(dataVencimento),
        limite_total: limiteTotal ? Number(limiteTotal) : null,
        ativo: true,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Cartão salvo!')
    }
    setNomeCartao(''); setDataFechamento(''); setDataVencimento(''); setLimiteTotal('')
    setLoading(false); carregarTudo()
  }

  const editarCartao = (c: Cartao) => {
    setEditandoCartao(c.id); setNomeCartao(c.nome)
    setDataFechamento(String(c.data_fechamento))
    setDataVencimento(String(c.data_vencimento))
    setLimiteTotal(c.limite_total ? String(c.limite_total) : ''); setMensagem('')
  }

  // ── Contas ───────────────────────────────────────────────────────────────────
  const salvarConta = async () => {
    if (!nomeConta) return setMensagem('Informe o nome da conta')
    if (!householdId) return setMensagem('Erro: household não encontrado')
    setLoading(true)
    if (editandoConta) {
      const { error } = await supabase.from('contas').update({
        nome: nomeConta,
        saldo_inicial: saldoInicial ? Number(saldoInicial) : 0,
        data_inicial: dataInicial || null,
        tipo: tipoConta,
      }).eq('id', editandoConta)
      if (error) setMensagem('Erro: ' + error.message)
      else { setMensagem('Conta atualizada!'); setEditandoConta(null) }
    } else {
      const { error } = await supabase.from('contas').insert({
        household_id: householdId,
        nome: nomeConta,
        saldo_inicial: saldoInicial ? Number(saldoInicial) : 0,
        data_inicial: dataInicial || null,
        tipo: tipoConta,
        ativo: true,
      })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Conta salva!')
    }
    setNomeConta(''); setSaldoInicial(''); setDataInicial(''); setTipoConta('corrente')
    setLoading(false); carregarTudo()
  }

  const editarConta = (c: Conta) => {
    setEditandoConta(c.id); setNomeConta(c.nome)
    setSaldoInicial(c.saldo_inicial ? String(c.saldo_inicial) : '')
    setDataInicial(c.data_inicial ?? '')
    setTipoConta(c.tipo || 'corrente'); setMensagem('')
  }

  const cancelarEdicao = () => {
    setEditandoCategoriaDespesa(null); setNomeCategoriaDespesa(''); setLimiteGastosDespesa(''); setExemplosDespesa('')
    setEditandoCategoriaReceita(null); setNomeCategoriaReceita(''); setLimiteGastosReceita('')
    setEditandoCartao(null); setNomeCartao(''); setDataFechamento(''); setDataVencimento(''); setLimiteTotal('')
    setEditandoConta(null); setNomeConta(''); setSaldoInicial(''); setDataInicial(''); setTipoConta('corrente'); setMensagem('')
  }

  // ── Componente ItemRow (corrigido: componente em vez de função) ──────────────
  const ItemRow = ({ nome, detalhe, id, tabela, onEdit }: {
    nome: string; detalhe: string; id: number; tabela: string; onEdit: () => void
  }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: '#ede8df', padding: '8px 12px', borderRadius: 6,
      border: '1px solid #f3f4f6',
    }}>
      <div style={{ flex: 1 }}>
        <span style={{ color: '#111827', fontWeight: 600, fontSize: 13 }}>{nome}</span>
        {detalhe && <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 8 }}>{detalhe}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onEdit} style={{
          backgroundColor: '#fef3c7', border: '1px solid #fde68a', color: '#92400e',
          padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
        }}>Editar</button>
        <button onClick={() => excluir(tabela, id)} style={{
          backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b',
          padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
        }}>Excluir</button>
      </div>
    </div>
  )

  const abas = [
    { key: 'cat-despesa', label: 'Categorias Despesas' },
    { key: 'cat-receita', label: 'Categorias Receitas' },
    { key: 'cartoes',     label: 'Cartões' },
    { key: 'contas',      label: 'Contas' },
  ] as const

  const isEditando = editandoCategoriaDespesa || editandoCategoriaReceita || editandoCartao || editandoConta

  const titulosForm: Record<Aba, string> = {
    'cat-despesa': isEditando ? 'Editando Categoria' : 'Nova Categoria de Despesa',
    'cat-receita': isEditando ? 'Editando Categoria' : 'Nova Categoria de Receita',
    'cartoes':     isEditando ? 'Editando Cartão'    : 'Novo Cartão',
    'contas':      isEditando ? 'Editando Conta'     : 'Nova Conta',
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', margin: 0 }}>Cadastros</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Gerencie categorias, cartões e contas</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {abas.map(a => {
          const ativa = aba === a.key
          return (
            <button key={a.key} onClick={() => { setAba(a.key); cancelarEdicao() }} style={{
              padding: '8px 16px',
              backgroundColor: ativa ? '#2563eb' : '#f9fafb',
              color: ativa ? 'white' : '#374151',
              border: `1px solid ${ativa ? '#2563eb' : '#e5e7eb'}`,
              borderRadius: 6, cursor: 'pointer',
              fontWeight: ativa ? 600 : 400, fontSize: 13,
            }}>
              {a.label}
            </button>
          )
        })}
      </div>

      {mensagem && (
        <div style={{
          color: mensagem.startsWith('Erro') ? '#991b1b' : '#166534',
          background: mensagem.startsWith('Erro') ? '#fee2e2' : '#dcfce7',
          border: `1px solid ${mensagem.startsWith('Erro') ? '#fca5a5' : '#86efac'}`,
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13
        }}>{mensagem}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* FORMULÁRIO */}
        <div style={{
          background: '#fff', padding: 24, borderRadius: 12,
          border: `1px solid ${isEditando ? '#fde68a' : '#e5e7eb'}`,
          boxShadow: isEditando ? '0 0 0 2px #fef3c7' : 'none'
        }}>
          <h3 style={{ color: isEditando ? '#92400e' : '#111827', marginBottom: 20, fontSize: 15, fontWeight: 600 }}>
            {titulosForm[aba]}
          </h3>

          {aba === 'cat-despesa' && (
            <>
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
                  {loading ? 'Salvando...' : editandoCategoriaDespesa ? 'Atualizar' : '+ Salvar'}
                </button>
                {editandoCategoriaDespesa && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#6b7280', width: 'auto', padding: '9px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}

          {aba === 'cat-receita' && (
            <>
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
                  {loading ? 'Salvando...' : editandoCategoriaReceita ? 'Atualizar' : '+ Salvar'}
                </button>
                {editandoCategoriaReceita && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#6b7280', width: 'auto', padding: '9px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}

          {aba === 'cartoes' && (
            <>
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
                  {loading ? 'Salvando...' : editandoCartao ? 'Atualizar' : '+ Salvar'}
                </button>
                {editandoCartao && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#6b7280', width: 'auto', padding: '9px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}

          {aba === 'contas' && (
            <>
              <label style={labelStyle}>Tipo da Conta</label>
              <select style={inputStyle} value={tipoConta} onChange={e => setTipoConta(e.target.value)}>
                <option value="corrente">Conta Corrente</option>
                <option value="investimento">Investimento</option>
              </select>
              <label style={labelStyle}>Nome da Conta *</label>
              <input style={inputStyle} value={nomeConta}
                onChange={e => setNomeConta(e.target.value)} placeholder="Ex: Nubank" />
              <label style={labelStyle}>Saldo Inicial (R$)</label>
              <input style={inputStyle} type="number" value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)} placeholder="Ex: 1500" />
              <label style={labelStyle}>Data Inicial</label>
              <input style={inputStyle} type="date" value={dataInicial}
                onChange={e => setDataInicial(e.target.value)} />
              <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 10, marginTop: -6 }}>
                Data a partir da qual os cálculos de saldo serão feitos
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={salvarConta} disabled={loading}>
                  {loading ? 'Salvando...' : editandoConta ? 'Atualizar' : '+ Salvar'}
                </button>
                {editandoConta && (
                  <button onClick={cancelarEdicao} style={{ ...btnStyle, backgroundColor: '#6b7280', width: 'auto', padding: '9px 16px' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* LISTA */}
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <h3 style={{ color: '#111827', marginBottom: 16, fontSize: 15, fontWeight: 600 }}>
            {aba === 'cat-despesa' && `Categorias Despesas (${categoriasDespesa.length})`}
            {aba === 'cat-receita' && `Categorias Receitas (${categoriasReceita.length})`}
            {aba === 'cartoes'     && `Cartões (${cartoes.length})`}
            {aba === 'contas'      && `Contas (${contas.length})`}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 450, overflowY: 'auto' }}>

            {aba === 'cat-despesa' && (categoriasDespesa.length === 0
              ? <p style={{ color: '#9ca3af' }}>Nenhuma categoria cadastrada.</p>
              : categoriasDespesa.map(c => (
                <ItemRow
                  key={c.id}
                  nome={c.nome}
                  detalhe={`${c.classificacao}${c.limite_gastos > 0 ? ` · Limite: R$ ${c.limite_gastos}` : ''}`}
                  id={c.id}
                  tabela="categorias"
                  onEdit={() => editarCategoriaDespesa(c)}
                />
              ))
            )}

            {aba === 'cat-receita' && (categoriasReceita.length === 0
              ? <p style={{ color: '#9ca3af' }}>Nenhuma categoria cadastrada.</p>
              : categoriasReceita.map(c => (
                <ItemRow
                  key={c.id}
                  nome={c.nome}
                  detalhe={`${c.classificacao}${c.limite_gastos > 0 ? ` · Previsto: R$ ${c.limite_gastos}` : ''}`}
                  id={c.id}
                  tabela="categorias"
                  onEdit={() => editarCategoriaReceita(c)}
                />
              ))
            )}

            {aba === 'cartoes' && (cartoes.length === 0
              ? <p style={{ color: '#9ca3af' }}>Nenhum cartão cadastrado.</p>
              : cartoes.map(c => (
                <ItemRow
                  key={c.id}
                  nome={c.nome}
                  detalhe={`Fecha dia ${c.data_fechamento} · Vence dia ${c.data_vencimento}${c.limite_total ? ` · Limite: R$ ${c.limite_total}` : ''}`}
                  id={c.id}
                  tabela="cartoes"
                  onEdit={() => editarCartao(c)}
                />
              ))
            )}

            {aba === 'contas' && (contas.length === 0
              ? <p style={{ color: '#9ca3af' }}>Nenhuma conta cadastrada.</p>
              : contas.map(c => (
                <ItemRow
                  key={c.id}
                  nome={c.nome}
                  detalhe={[
                    c.tipo === 'investimento' ? '📈 Investimento' : '🏦 Corrente',
                    c.saldo_inicial > 0 ? `Saldo: R$ ${c.saldo_inicial}` : '',
                    c.data_inicial ? `Início: ${new Date(c.data_inicial + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''
                  ].filter(Boolean).join(' · ')}
                  id={c.id}
                  tabela="contas"
                  onEdit={() => editarConta(c)}
                />
              ))
            )}

          </div>
        </div>

      </div>
    </div>
  )
}
