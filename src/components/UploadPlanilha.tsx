import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface ImportResult {
  categorias: number
  cartoes: number
  contas: number
  movimentacoes: number
  erros: string[]
}

export default function UploadPlanilha() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<ImportResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<string>('')
  const [progresso, setProgresso] = useState(0)
  const [hovered, setHovered] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function excelDateToISO(value: unknown): string | null {
    if (!value) return null
    if (value instanceof Date) return value.toISOString().split('T')[0]
    if (typeof value === 'number') {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000))
      return date.toISOString().split('T')[0]
    }
    if (typeof value === 'string') {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }
    return null
  }

  function parseValor(value: unknown): number {
    if (typeof value === 'number') return Math.abs(value)
    if (typeof value === 'string') {
      const n = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'))
      return isNaN(n) ? 0 : Math.abs(n)
    }
    return 0
  }

  async function processarPlanilha(file: File) {
    setLoading(true)
    setResultado(null)
    setErro(null)
    setProgresso(0)

    const erros: string[] = []
    const result: ImportResult = { categorias: 0, cartoes: 0, contas: 0, movimentacoes: 0, erros: [] }

    try {
      const { data: memberData, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user!.id)
        .single()

      if (memberError || !memberData) throw new Error('Nao foi possivel encontrar o household do usuario.')
      const household_id = memberData.household_id

      setEtapa('Lendo arquivo...')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })

      // 1. CATEGORIAS
      setEtapa('Importando categorias...')
      setProgresso(10)
      const wsCateg = workbook.Sheets['📂 Categorias']
      if (wsCateg) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsCateg, { range: 2 })
        for (const row of rows) {
          const nome = String(row['Nome da Categoria *'] ?? '').trim()
          const classificacao = String(row['Classificacao *'] ?? row['Classificação *'] ?? '').trim()
          if (!nome || !classificacao) continue
          const tipo = ['Renda Ativa', 'Renda Passiva'].includes(classificacao) ? 'Receita' : 'Despesa'
          const limite = parseValor(row['Limite Mensal (R$)']) || null
          const { error } = await supabase.from('categorias').upsert(
            { household_id, nome, classificacao, tipo, limite_mensal: limite },
            { onConflict: 'household_id,nome' }
          )
          if (error) erros.push(`Categoria "${nome}": ${error.message}`)
          else result.categorias++
        }
      }

      // 2. CARTOES
      setEtapa('Importando cartoes...')
      setProgresso(30)
      const wsCart = workbook.Sheets['💳 Cartões']
      if (wsCart) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsCart, { range: 2 })
        for (const row of rows) {
          const nome = String(row['Nome do Cartao *'] ?? row['Nome do Cartão *'] ?? '').trim()
          if (!nome) continue
          const data_fechamento = Number(row['Dia Fechamento *']) || null
          const data_vencimento = Number(row['Dia Vencimento *']) || null
          const limite = parseValor(row['Limite Total (R$)']) || null
          const { error } = await supabase.from('cartoes').upsert(
            { household_id, nome, data_fechamento, data_vencimento, limite_total: limite },
            { onConflict: 'household_id,nome' }
          )
          if (error) erros.push(`Cartao "${nome}": ${error.message}`)
          else result.cartoes++
        }
      }

      // 3. CONTAS
      setEtapa('Importando contas...')
      setProgresso(50)
      const wsContas = workbook.Sheets['🏦 Contas']
      if (wsContas) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsContas, { range: 2 })
        for (const row of rows) {
          const nome = String(row['Nome da Conta *'] ?? '').trim()
          if (!nome) continue
          const saldo_inicial = parseValor(row['Saldo Inicial (R$)'])
          const data_inicial = excelDateToISO(row['Data Inicial *'])
          const { error } = await supabase.from('contas').upsert(
            { household_id, nome, saldo_inicial, data_inicial },
            { onConflict: 'household_id,nome' }
          )
          if (error) erros.push(`Conta "${nome}": ${error.message}`)
          else result.contas++
        }
      }

      // Mapas de ids
      const { data: categsDB } = await supabase.from('categorias').select('id, nome').eq('household_id', household_id)
      const { data: cartoesDB } = await supabase.from('cartoes').select('id, nome').eq('household_id', household_id)
      const { data: contasDB } = await supabase.from('contas').select('id, nome').eq('household_id', household_id)
      const categMap = Object.fromEntries((categsDB ?? []).map(c => [c.nome.trim().toLowerCase(), c.id]))
      const cartaoMap = Object.fromEntries((cartoesDB ?? []).map(c => [c.nome.trim().toLowerCase(), c.id]))
      const contaMap = Object.fromEntries((contasDB ?? []).map(c => [c.nome.trim().toLowerCase(), c.id]))

      // 4. MOVIMENTACOES
      setEtapa('Importando movimentacoes...')
      setProgresso(65)
      const wsMov = workbook.Sheets['💰 Movimentacoes']
      if (wsMov) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsMov, { range: 2 })
        const lote: Record<string, unknown>[] = []
        let linha = 4

        for (const row of rows) {
          linha++
          const data_movimentacao = excelDateToISO(row['Data Movimentacao *'] ?? row['Data Movimentação *'])
          const tipo = String(row['Tipo *'] ?? '').trim()
          const descricao = String(row['Descricao *'] ?? row['Descrição *'] ?? '').trim()
          const valor = parseValor(row['Valor (R$) *'])
          const metodo = String(row['Metodo de Pagamento *'] ?? row['Método de Pagamento *'] ?? '').trim()
          const situacao = String(row['Situacao *'] ?? row['Situação *'] ?? '').trim()

          if (!data_movimentacao || !tipo || !descricao || !valor || !situacao) {
            erros.push(`Linha ${linha}: campos obrigatorios faltando`)
            continue
          }

          const categNome = String(row['Categoria *'] ?? '').trim()
          const categId = categMap[categNome.toLowerCase()] ?? null
          if (!categId && categNome && tipo !== 'Transferência' && tipo !== 'Transferencia') {
            erros.push(`Linha ${linha}: categoria "${categNome}" nao encontrada`)
            continue
          }

          const data_pagamento = excelDateToISO(row['Data Pagamento']) || null
          const contaNome = String(row['Conta Origem/Destino'] ?? '').trim()
          const conta_id = contaNome ? (contaMap[contaNome.toLowerCase()] ?? null) : null
          const forma_pagamento = String(row['Forma de Pagamento'] ?? '').trim() || null
          const parcela = String(row['No da Parcela'] ?? row['Nº da Parcela'] ?? '').trim() || null
          const cartao_id = cartaoMap[metodo.toLowerCase()] ?? null

          lote.push({
            household_id, data_movimentacao, data_pagamento, tipo,
            categoria_id: categId, descricao, valor, metodo_pagamento: metodo,
            cartao_id: cartao_id || null, conta_id: conta_id || null,
            forma_pagamento, numero_parcela: parcela, situacao,
          })

          if (lote.length >= 50) {
            const { error, data } = await supabase.from('movimentacoes').insert(lote).select('id')
            if (error) erros.push(`Lote movimentacoes: ${error.message}`)
            else result.movimentacoes += data?.length ?? 0
            lote.length = 0
            setProgresso(65 + Math.min(30, result.movimentacoes / 10))
          }
        }

        if (lote.length > 0) {
          const { error, data } = await supabase.from('movimentacoes').insert(lote).select('id')
          if (error) erros.push(`Lote final: ${error.message}`)
          else result.movimentacoes += data?.length ?? 0
        }
      }

      result.erros = erros
      setResultado(result)
      setProgresso(100)
      setEtapa('Concluido!')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado durante a importacao.')
    } finally {
      setLoading(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx')) {
      setErro('Por favor, envie um arquivo .xlsx')
      return
    }
    processarPlanilha(file)
  }

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
        Importar Planilha
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 28 }}>
        Faca upload da planilha padrao Finance Hub (.xlsx) para importar categorias, cartoes, contas e movimentacoes.
      </p>

      {/* Drop zone */}
      <div
        onClick={() => !loading && fileRef.current?.click()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          border: `2px dashed ${hovered ? '#2563eb' : '#93c5fd'}`,
          borderRadius: 16,
          padding: '48px 32px',
          textAlign: 'center',
          cursor: loading ? 'default' : 'pointer',
          background: hovered ? '#eff6ff' : '#f8fafc',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <p style={{ fontWeight: 600, fontSize: 16, color: '#374151', marginBottom: 6 }}>
          {loading ? etapa : 'Clique para selecionar a planilha'}
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Formato aceito: .xlsx</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleFile}
          disabled={loading}
        />
      </div>

      {/* Barra de progresso */}
      {loading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            <span>{etapa}</span>
            <span>{progresso}%</span>
          </div>
          <div style={{ width: '100%', background: '#e5e7eb', borderRadius: 99, height: 8 }}>
            <div style={{
              width: `${progresso}%`, background: '#2563eb',
              borderRadius: 99, height: 8, transition: 'width 0.5s',
            }} />
          </div>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div style={{
          marginTop: 16, background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 12, padding: '12px 16px', color: '#b91c1c', fontSize: 13,
        }}>
          ❌ {erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 12, padding: 20, marginBottom: 16,
          }}>
            <p style={{ fontWeight: 700, color: '#15803d', fontSize: 16, marginBottom: 16 }}>
              Importacao concluida!
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Categorias', valor: resultado.categorias, icon: '📂' },
                { label: 'Cartoes', valor: resultado.cartoes, icon: '💳' },
                { label: 'Contas', valor: resultado.contas, icon: '🏦' },
                { label: 'Movimentacoes', valor: resultado.movimentacoes, icon: '💰' },
              ].map(item => (
                <div key={item.label} style={{
                  background: '#fff', borderRadius: 10, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                  <span style={{ fontSize: 24 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{item.label}</p>
                    <p style={{ fontWeight: 700, fontSize: 20, color: '#111827' }}>{item.valor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {resultado.erros.length > 0 && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <p style={{ fontWeight: 600, color: '#92400e', marginBottom: 8, fontSize: 13 }}>
                {resultado.erros.length} avisos durante a importacao:
              </p>
              <ul style={{ fontSize: 12, color: '#b45309', maxHeight: 160, overflowY: 'auto' }}>
                {resultado.erros.map((e, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>- {e}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => { setResultado(null); if (fileRef.current) fileRef.current.value = '' }}
            style={{
              width: '100%', background: '#f3f4f6', border: '1px solid #e5e7eb',
              borderRadius: 10, padding: '12px 0', fontSize: 13, color: '#374151',
              cursor: 'pointer', fontWeight: 500,
            }}
          >
            Importar outra planilha
          </button>
        </div>
      )}
    </div>
  )
}
