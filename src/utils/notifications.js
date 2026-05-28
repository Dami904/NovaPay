function shortAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function buildRecipientList(recipients) {
  const lines = recipients.map((r, i) => {
    const hasRealName = r.name && !/^Recipient \d+$/.test(r.name)
    return `• ${hasRealName ? r.name : shortAddress(r.address)}`
  })
  const MAX = 1024
  const joined = lines.join('\n')
  if (joined.length <= MAX) return joined

  let result = ''
  let shown = 0
  for (const line of lines) {
    const next = result ? `${result}\n${line}` : line
    if (next.length > MAX - 30) break
    result = next
    shown++
  }
  return `${result}\n…and ${lines.length - shown} more`
}

function post(webhookUrl, payload) {
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(err => console.error('[discord] webhook error:', err.message))
}

export function notifyBatchSubmitted(webhookUrl, { label, totalAmount, token, triggerAddress, orgName = 'NovaPay' }) {
  if (!webhookUrl) return
  post(webhookUrl, {
    embeds: [{
      title: '⏳ Batch Payment Initiated',
      description: `**"${label}"** submitted for on-chain execution`,
      color: 0xF59E0B,
      fields: [
        { name: 'Total', value: `${Number(totalAmount).toLocaleString()} ${token}`, inline: true },
        { name: 'Triggered by', value: triggerAddress ? shortAddress(triggerAddress) : 'Unknown', inline: true },
      ],
      footer: { text: `${orgName} · On-chain payments` },
      timestamp: new Date().toISOString(),
    }],
  })
}

export function notifyBatchExecuted(webhookUrl, { label, totalAmount, token, txHash, explorerUrl, recipients, orgName = 'NovaPay' }) {
  if (!webhookUrl) return
  const shortTx = shortAddress(txHash)
  const fields = [
    { name: 'Total', value: `${Number(totalAmount).toLocaleString()} ${token}`, inline: true },
    { name: 'Recipients', value: String(recipients.length), inline: true },
    { name: 'Tx Hash', value: `[${shortTx}](${explorerUrl})` },
  ]
  if (recipients.length > 0) {
    fields.push({ name: `Paid to (${recipients.length})`, value: buildRecipientList(recipients) })
  }
  post(webhookUrl, {
    embeds: [{
      title: '🎉 Batch Payment Executed',
      description: `**"${label}"** disbursed on-chain`,
      color: 0x10B401,
      fields,
      footer: { text: `${orgName} · On-chain payments` },
      timestamp: new Date().toISOString(),
    }],
  })
}

export function notifyBatchFailed(webhookUrl, { label, txHash, explorerUrl, orgName = 'NovaPay' }) {
  if (!webhookUrl) return
  const fields = []
  if (txHash) {
    const shortTx = shortAddress(txHash)
    fields.push({ name: 'Tx Hash', value: explorerUrl ? `[${shortTx}](${explorerUrl})` : shortTx })
  }
  post(webhookUrl, {
    embeds: [{
      title: '❌ Batch Transaction Failed',
      description: `**"${label}"** failed on-chain — please investigate`,
      color: 0xDC2626,
      fields,
      footer: { text: `${orgName} · On-chain payments` },
      timestamp: new Date().toISOString(),
    }],
  })
}
