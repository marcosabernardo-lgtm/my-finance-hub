import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Previsto = {
  id: number
  data_movimentacao: string
  data_pagamento: string
  descricao: string
  valor: number
  metodo_pagamento: string
  numero_parcela: string
  forma_pagamento: string
  situacao: string
  conta_origem_destino: string
  categoria_id: number
  categoria_nome?: string
  cartao_nome?: string
}

const formatarValor = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatarData = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

export default function ConfirmarDebito() {
  const [previstos, setPrevistos] = useState<Previsto[]>([])
  const [loading, setLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [filtroMes, setFiltroMes] = useState(mesAtual())

  function mesAtual() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  useEffect(() => {
    carregarPrevistos()
  }, [filtroMes])

  const carregarPrevistos = async () => {
  const [ano, mes] = filtroMes.split('-')
  const dataInicio = `${ano}-${mes}-01`
  // Calcula o último dia do mês corretamente
  const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate()
  const dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`

  const { data } = await supabase
    .from('movimentacoes')
    .select('*, categorias(nome), cartoes(nome)')
    .eq('situacao', 'Previsto')
    .gte('data_pagamento', dataInicio)
    .lte('data_pagamento', dataFim)
    .order('data_pagamento')

  if (data) {
    setPrevistos(data.map((m: any) => ({
      ...m,
      categoria_nome: m.categorias?.nome ?? '',
      cartao_nome: m.cartoes?.nome ?? '',
    })))
  }
}

  const confirmarDebito = async (p: Previsto) => {
    setLoading(true)
    setMensagem('')

    const isCartao = !['Débito', 'PIX', 'Dinheiro'].includes(p.metodo_pagamento)
    const novaSituacao = isCartao ? 'Pendente' : 'Pago'

    const { error } = await supabase
      .from('movimentacoes')
      .update({ situacao: novaSituacao })
      .eq('id', p.id)

    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      setMensagem(`✅ "${p.descricao}" confirmado como ${novaSituacao}!`)
      carregarPrevistos()
    }
    setLoading(false)
  }

  const confirmarTodos = async () => {
    if (!confirm(`Confirmar todos os ${previstos.length} lançamentos previstos?`)) return
    setLoading(true)
    setMensagem('')

    for (const p of previstos) {
      const isCartao = !['Débito', 'PIX', 'Dinheiro'].includes(p.metodo_pagamento)
      const novaSituacao = isCartao ? 'Pendente' : 'Pago'
      await supabase.from('movimentacoes').update({ situacao: novaSituacao }).eq('id', p.id)
    }

    setMensagem(`✅ ${previstos.length} lançamentos confirmados!`)
    carregarPrevistos()
    setLoading(false)
  }

  const nomesMeses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  const totalPrevistos = previstos.reduce((acc, p) => acc + p.valor, 0)

  const getMetodoInfo = (p: Previsto) => {
    if (p.cartao_nome) return { label: p.cartao_nome, cor: '#3b82f6', icone: '💳' }
    if (p.metodo_pagamento === 'Débito') return { label: `Débito — ${p.conta_origem_destino || p.metodo_pagamento}`, cor: '#f59e0b', icone: '🏦' }
    if (p.metodo_pagamento === 'PIX') return { label: `PIX — ${p.conta_origem_destino || p.metodo_pagamento}`, cor: '#22c55e', icone: '⚡' }
    return { label: p.metodo_pagamento, cor: '#94a3b8', icone: '💰' }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ color: 'white', marginBottom: 8 }}>🔮 Confirmar Débitos Previstos</h2>
      <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
        Quando um lançamento Previsto for debitado, confirme aqui para ele entrar no controle financeiro.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={filtroMes.split('-')[1]}
            onChange={e => setFiltroMes(`${filtroMes.split('-')[0]}-${e.target.value}`)}
            style={{ padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: 6 }}>
            {nomesMeses.map((m, i) => (
              <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
          <input
            type="number" value={filtroMes.split('-')[0]}
            onChange={e => setFiltroMes(`${e.target.value}-${filtroMes.split('-')[1]}`)}
            style={{ width: 80, padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: 6 }}
          />
        </div>

        {previstos.length > 0 && (
          <button onClick={confirmarTodos} disabled={loading} style={{
            padding: '8px 16px', backgroundColor: '#8b5cf6', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold'
          }}>
            ✅ Confirmar Todos ({previstos.length})
          </button>
        )}
      </div>

      {mensagem && (
        <p style={{
          color: mensagem.startsWith('Erro') ? '#ef4444' : '#22c55e',
          marginBottom: 16, padding: 10, backgroundColor: '#1e293b', borderRadius: 6
        }}>{mensagem}</p>
      )}

      {previstos.length === 0 ? (
        <div style={{ backgroundColor: '#1e293b', padding: 40, borderRadius: 12, textAlign: 'center', border: '1px solid #334155' }}>
          <p style={{ color: '#64748b', fontSize: 16 }}>Nenhum lançamento previsto para este mês.</p>
        </div>
      ) : (
        <>
          <div style={{ backgroundColor: '#1e1040', padding: '12px 16px', borderRadius: 8, marginBottom: 16, border: '1px solid #8b5cf6' }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>Total previsto: </span>
            <span style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: 16 }}>{formatarValor(totalPrevistos)}</span>
            <span style={{ color: '#64748b', fontSize: 13, marginLeft: 12 }}>{previstos.length} lançamento(s)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previstos.map(p => {
              const metodo = getMetodoInfo(p)
              return (
                <div key={p.id} style={{
                  backgroundColor: '#1e293b', padding: '14px 16px', borderRadius: 8,
                  border: '1px solid #334155', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12
                }}>
                  <div style={{ flex: 1 }}>
                    {/* Linha 1: descrição + categoria + parcela */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>{p.descricao}</span>
                      {p.categoria_nome && (
                        <span style={{ color: '#64748b', fontSize: 12, backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: 4 }}>
                          {p.categoria_nome}
                        </span>
                      )}
                      <span style={{ color: '#8b5cf6', fontSize: 12, backgroundColor: '#1e1040', padding: '2px 6px', borderRadius: 4 }}>
                        {p.numero_parcela}
                      </span>
                      <span style={{ color: '#64748b', fontSize: 12 }}>
                        {p.forma_pagamento}
                      </span>
                    </div>

                    {/* Linha 2: data + método + valor */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>
                        📅 Vence: <strong>{formatarData(p.data_pagamento)}</strong>
                      </span>
                      <span style={{ fontSize: 12, color: metodo.cor, backgroundColor: '#0f172a', padding: '2px 8px', borderRadius: 4 }}>
                        {metodo.icone} {metodo.label}
                      </span>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 15 }}>
                        {formatarValor(p.valor)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => confirmarDebito(p)}
                    disabled={loading}
                    style={{
                      padding: '8px 14px', backgroundColor: '#22c55e', color: 'white',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
                      whiteSpace: 'nowrap', fontSize: 13, flexShrink: 0
                    }}>
                    ✅ Confirmar
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}