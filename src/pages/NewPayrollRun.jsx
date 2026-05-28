import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ethers } from 'ethers'
import { useWeb3 } from '../context/Web3Context'
import { parsePayrollCSV } from '../utils/csvParser'
import { getFriendlyErrorMessage } from '../utils/userMessages'

const SAMPLE_ROWS = [
  { wallet_address: '0x1234567890123456789012345678901234567890', name: 'Alice Chen', email: 'alice@example.com', amount: 3000 },
  { wallet_address: '0x2345678901234567890123456789012345678901', name: 'Bob Smith', email: 'bob@example.com', amount: 2500 },
  { wallet_address: '0x3456789012345678901234567890123456789012', name: 'Carol Diaz', email: '', amount: 2500 },
]

const SAMPLE_CSV = `wallet_address,name,email,amount
0x1234567890123456789012345678901234567890,Alice Chen,alice@example.com,3000
0x2345678901234567890123456789012345678901,Bob Smith,bob@example.com,2500
0x3456789012345678901234567890123456789012,Carol Diaz,,2500`

const EMPTY_FORM = { address: '', name: '', email: '', amount: '' }

export default function NewPayrollRun() {
  const { sendPayroll, tokenBalance, selectedToken, setSelectedToken } = useWeb3()
  const navigate = useNavigate()

  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [label, setLabel] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newRow, setNewRow] = useState(EMPTY_FORM)
  const [addError, setAddError] = useState('')
  const fileInputRef = useRef()

  const processFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setSendError('Please upload a CSV or Excel file.')
      return
    }
    setSendError('')
    setFileName(file.name)
    try {
      const { rows: parsed, errors: errs } = await parsePayrollCSV(file)
      setRows(parsed)
      setErrors(errs)
    } catch (err) {
      setRows([])
      setErrors([])
      setSendError(getFriendlyErrorMessage(err, 'We could not read that file. Please try another one.'))
    }
  }, [])

  function onFileChange(e) { processFile(e.target.files[0]) }
  function onDrop(e) { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]) }
  function onDragOver(e) { e.preventDefault(); setIsDragging(true) }

  function deleteRow(index) {
    const lineToRemove = rows[index]?.line
    setRows((prev) => prev.filter((_, i) => i !== index))
    if (lineToRemove) setErrors((prev) => prev.filter((e) => e.line !== lineToRemove))
  }

  function addManualRow() {
    const address = newRow.address.trim()
    const amount = parseFloat(newRow.amount)
    const name = newRow.name.trim()
    const email = newRow.email.trim()

    if (!address) { setAddError('Wallet address is required.'); return }
    if (!ethers.isAddress(address)) { setAddError('Enter a valid wallet address (0x…).'); return }
    if (!newRow.amount) { setAddError('Amount is required.'); return }
    if (isNaN(amount) || amount <= 0) { setAddError('Amount must be greater than 0.'); return }

    setRows((prev) => [
      ...prev,
      {
        line: null,
        address,
        name: name || `Recipient ${prev.length + 1}`,
        email,
        amount,
        amountRaw: newRow.amount,
        hasError: false,
        manual: true,
      },
    ])
    setNewRow(EMPTY_FORM)
    setAddError('')
    setShowAddForm(false)
  }

  function downloadSampleCSV() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'novapay-sample.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadSampleXLSX() {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'novapay-sample.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const validRows = rows.filter((r) => !r.hasError)
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0)
  const hasBalance = parseFloat(tokenBalance) >= totalAmount
  const canSend = validRows.length > 0 && label.trim() && errors.length === 0 && !sending
  const hasEmails = rows.some((r) => r.email)

  async function handleSend() {
    if (!canSend) return
    setSendError('')
    setSending(true)
    try {
      const result = await sendPayroll({
        recipients: validRows.map((r) => r.address),
        amounts: validRows.map((r) => r.amount),
        label: label.trim(),
        rows: validRows,
      })
      navigate('/payroll/confirm', {
        state: {
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
          label: label.trim(),
          recipientCount: validRows.length,
          totalAmount,
          token: selectedToken,
        },
      })
    } catch (err) {
      setSendError(getFriendlyErrorMessage(err, 'We could not send the payout right now. Please try again.'))
      setSending(false)
    }
  }

  const AddRecipientForm = (
    <div style={{ marginTop: 16, padding: '16px', background: 'var(--bg-card, #1e293b)', borderRadius: 8, border: '1px solid var(--border, #334155)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1fr', gap: 8, marginBottom: addError ? 8 : 12 }}>
        <input
          className="label-input"
          placeholder="Wallet address (0x…)"
          value={newRow.address}
          onChange={(e) => setNewRow((p) => ({ ...p, address: e.target.value }))}
          style={{ fontSize: 13 }}
        />
        <input
          className="label-input"
          placeholder="Name (optional)"
          value={newRow.name}
          onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))}
          style={{ fontSize: 13 }}
        />
        <input
          className="label-input"
          placeholder="Email (optional)"
          type="email"
          value={newRow.email}
          onChange={(e) => setNewRow((p) => ({ ...p, email: e.target.value }))}
          style={{ fontSize: 13 }}
        />
        <input
          className="label-input"
          placeholder="Amount"
          type="number"
          min="0"
          value={newRow.amount}
          onChange={(e) => setNewRow((p) => ({ ...p, amount: e.target.value }))}
          style={{ fontSize: 13 }}
        />
      </div>
      {addError && <div className="error-box" style={{ marginBottom: 10, padding: '8px 12px', fontSize: 13 }}>⚠ {addError}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-ghost btn-sm" onClick={() => { setShowAddForm(false); setNewRow(EMPTY_FORM); setAddError('') }}>Cancel</button>
        <button className="btn-primary btn-sm" onClick={addManualRow}>Add Recipient</button>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Payroll Run</h1>
          <p className="page-sub">Upload your CSV or Excel file, choose a token, set a label, and send in one transaction</p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')}>← Back</button>
      </div>

      <div className="payroll-layout">
        <div className="payroll-main">

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Step 1 — Upload File</h2>
              <div className="card-header-right">
                <div className="token-toggle">
                  <button className={`token-toggle-btn${selectedToken === 'USDC' ? ' active' : ''}`} onClick={() => setSelectedToken('USDC')}>USDC</button>
                  <button className={`token-toggle-btn${selectedToken === 'USDT' ? ' active' : ''}`} onClick={() => setSelectedToken('USDT')}>USDT</button>
                </div>
                <div className="sample-btns">
                  <button className="btn-ghost btn-sm" onClick={downloadSampleCSV}>↓ Sample CSV</button>
                  <button className="btn-ghost btn-sm" onClick={downloadSampleXLSX}>↓ Sample Excel</button>
                </div>
              </div>
            </div>

            <div
              className={`dropzone ${isDragging ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} style={{ display: 'none' }} />
              {fileName ? (
                <div className="dropzone-loaded">
                  <span className="dropzone-file-icon">📄</span>
                  <div>
                    <div className="dropzone-filename">{fileName}</div>
                    <div className="dropzone-change">Click to replace</div>
                  </div>
                </div>
              ) : (
                <div className="dropzone-empty">
                  <span className="dropzone-icon">⬆</span>
                  <div className="dropzone-text">Drop your CSV or Excel file here or click to browse</div>
                  <div className="dropzone-hint">
                    Your file should include a wallet address and an amount for each person. You can also add names and emails (optional — used for payment notifications).
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border, #334155)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', whiteSpace: 'nowrap' }}>or add manually</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border, #334155)' }} />
            </div>

            <div style={{ marginTop: 12 }}>
              {!showAddForm ? (
                <button className="btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => setShowAddForm(true)}>
                  + Add recipient manually
                </button>
              ) : AddRecipientForm}
            </div>
          </div>

          {rows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Step 2 — Review Recipients</h2>
                <span className="badge-count">{validRows.length} valid · {errors.length} errors</span>
              </div>

              {errors.length > 0 && (
                <div className="error-banner">
                  <strong>⚠ Some rows need attention before you can send this payout</strong>
                  <ul className="error-list">
                    {errors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
                  </ul>
                </div>
              )}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Wallet Address</th>
                      {hasEmails && <th>Email</th>}
                      <th>Amount ({selectedToken})</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.hasError ? 'row-error' : ''}>
                        <td className="td-num">{i + 1}</td>
                        <td>{row.name}</td>
                        <td className="td-addr"><span className="addr-text">{row.address || '—'}</span></td>
                        {hasEmails && (
                          <td style={{ fontSize: 13, color: row.email ? undefined : 'var(--text-muted, #9ca3af)' }}>
                            {row.email || '—'}
                          </td>
                        )}
                        <td className="td-amount">
                          {row.amount > 0 ? `$${row.amount.toLocaleString()}` : <span className="text-error">{row.amountRaw || '—'}</span>}
                        </td>
                        <td>
                          {row.hasError
                            ? <span className="status-error">✕ Needs attention</span>
                            : <span className="status-ok">✓ Ready</span>}
                        </td>
                        <td>
                          <button
                            onClick={() => deleteRow(i)}
                            title="Remove recipient"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #9ca3af)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted, #9ca3af)'}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12 }}>
                {!showAddForm ? (
                  <button className="btn-ghost btn-sm" onClick={() => setShowAddForm(true)}>+ Add recipient</button>
                ) : AddRecipientForm}
              </div>

              <div className="total-row">
                <span className="total-label">Total Payout</span>
                <span className="total-amount">${totalAmount.toLocaleString()} {selectedToken}</span>
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Step 3 — Label This Payroll</h2>
              </div>
              <div className="label-input-group">
                <input
                  type="text"
                  className="label-input"
                  placeholder='e.g. "Payroll - May 2026" or "Contractor Payments Q2"'
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                />
                <div className="label-hint">This label will stay with the payout as a permanent record.</div>
              </div>
            </div>
          )}
        </div>

        <div className="payroll-sidebar">
          <div className="card sidebar-card">
            <h3 className="sidebar-title">Payroll Summary</h3>
            <div className="summary-rows">
              <div className="summary-row">
                <span>Recipients</span>
                <span>{validRows.length}</span>
              </div>
              <div className="summary-row">
                <span>Total Amount</span>
                <span className="summary-amount">${totalAmount.toLocaleString()} {selectedToken}</span>
              </div>
              <div className="summary-row">
                <span>Your Balance</span>
                <span className={hasBalance || totalAmount === 0 ? '' : 'text-error'}>
                  ${parseFloat(tokenBalance).toLocaleString()} {selectedToken}
                </span>
              </div>
              <div className="summary-row">
                <span>Label</span>
                <span className="summary-label-val">{label || '—'}</span>
              </div>
            </div>

            {!hasBalance && totalAmount > 0 && (
              <div className="warning-box">⚠ You don't have enough {selectedToken} to send this payout</div>
            )}
            {sendError && <div className="error-box">⚠ {sendError}</div>}

            <button
              className="btn-primary btn-full"
              onClick={handleSend}
              disabled={!canSend || !hasBalance}
            >
              {sending ? (
                <><span className="spinner-sm" />Sending Payroll…</>
              ) : (
                `Send Payroll → ${validRows.length > 0 ? `$${totalAmount.toLocaleString()} ${selectedToken}` : ''}`
              )}
            </button>

            <div className="sidebar-checks">
              <div className={`check-item ${validRows.length > 0 ? 'check-ok' : ''}`}>
                {validRows.length > 0 ? '✓' : '○'} Recipients added
              </div>
              <div className={`check-item ${errors.length === 0 && rows.length > 0 ? 'check-ok' : ''}`}>
                {errors.length === 0 && rows.length > 0 ? '✓' : '○'} All rows are ready
              </div>
              <div className={`check-item ${label.trim() ? 'check-ok' : ''}`}>
                {label.trim() ? '✓' : '○'} Payroll label set
              </div>
              <div className={`check-item ${hasBalance && totalAmount > 0 ? 'check-ok' : ''}`}>
                {hasBalance && totalAmount > 0 ? '✓' : '○'} Sufficient balance
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
