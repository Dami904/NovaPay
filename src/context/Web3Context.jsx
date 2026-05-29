import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import {
  NOVAPAY_CONTRACT_ADDRESS,
  TOKENS,
  NOVAPAY_ABI,
  ERC20_ABI,
  MORPH_TESTNET,
} from '../utils/contractABI'
import {
  notifyBatchSubmitted,
  notifyBatchExecuted,
  notifyBatchFailed,
} from '../utils/notifications'

const Web3Context = createContext(null)

const STORAGE_KEY = 'novapay_history'
const SETTINGS_KEY = 'novapay_settings'
const IS_ZERO_CONTRACT = NOVAPAY_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000'

const EMAIL_API_URL = import.meta.env.VITE_API_URL ?? ''

const DEFAULT_SETTINGS = { discordWebhookUrl: '', orgName: 'NovaPay' }

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false)
  const [selectedToken, setSelectedToken] = useState('USDC')
  const [tokenBalance, setTokenBalance] = useState('0')
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [networkError, setNetworkError] = useState(null)
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const checkNetwork = useCallback(async (prov) => {
    const network = await prov.getNetwork()
    const correct = network.chainId === BigInt(2910)
    setIsCorrectNetwork(correct)
    if (!correct) setNetworkError('Please switch to the Morph Hoodi network.')
    else setNetworkError(null)
    return correct
  }, [])

  const fetchTokenBalance = useCallback(async (addr, prov, tokenKey) => {
    try {
      const cfg = TOKENS[tokenKey] || TOKENS.USDC
      const token = new ethers.Contract(cfg.address, ERC20_ABI, prov)
      const bal = await token.balanceOf(addr)
      setTokenBalance(ethers.formatUnits(bal, cfg.decimals))
    } catch {
      setTokenBalance('0')
    }
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error('Please install a wallet app to continue.')

    const prov = new ethers.BrowserProvider(window.ethereum)
    const accounts = await prov.send('eth_requestAccounts', [])
    const sign = await prov.getSigner()

    setProvider(prov)
    setSigner(sign)
    setAccount(accounts[0])

    const correct = await checkNetwork(prov)
    if (correct) await fetchTokenBalance(accounts[0], prov, selectedToken)
  }, [checkNetwork, fetchTokenBalance, selectedToken])

  useEffect(() => {
    if (account && provider && isCorrectNetwork) {
      fetchTokenBalance(account, provider, selectedToken)
    }
  }, [selectedToken, account, isCorrectNetwork]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchToMorph = useCallback(async () => {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [MORPH_TESTNET],
    })
  }, [])

  const sendPayroll = useCallback(
    async ({ recipients, amounts, label, rows }) => {
      if (IS_ZERO_CONTRACT) {
        throw new Error('Contract not deployed yet.')
      }

      const { discordWebhookUrl, orgName } = settingsRef.current
      const totalAmount = amounts.reduce((s, a) => s + a, 0)
      const explorerBase = MORPH_TESTNET.blockExplorerUrls[0]

      const buildRecipients = (addrs) =>
        addrs.map((addr, i) => ({
          address: addr,
          name: rows?.[i]?.name || `Recipient ${i + 1}`,
          amount: amounts[i],
          email: rows?.[i]?.email || '',
        }))

      const tokenCfg = TOKENS[selectedToken]
      const contract = new ethers.Contract(NOVAPAY_CONTRACT_ADDRESS, NOVAPAY_ABI, signer)
      const tokenContract = new ethers.Contract(tokenCfg.address, ERC20_ABI, signer)

      try {
        const totalWei = amounts.reduce((s, a) => s + ethers.parseUnits(a.toString(), tokenCfg.decimals), BigInt(0))
        const approveTx = await tokenContract.approve(NOVAPAY_CONTRACT_ADDRESS, totalWei)
        await approveTx.wait()

        notifyBatchSubmitted(discordWebhookUrl, {
          label, totalAmount, token: selectedToken, triggerAddress: account, orgName,
        })

        const amountsWei = amounts.map((a) => ethers.parseUnits(a.toString(), tokenCfg.decimals))
        const tx = await contract.batchPayout(tokenCfg.address, recipients, amountsWei, label)
        const receipt = await tx.wait()

        const batch = {
          id: receipt.hash,
          label,
          token: selectedToken,
          timestamp: Date.now(),
          recipientCount: recipients.length,
          totalAmount,
          txHash: receipt.hash,
          explorerUrl: `${explorerBase}/tx/${receipt.hash}`,
          recipients: buildRecipients(recipients),
        }

        setHistory((prev) => {
          const updated = [batch, ...prev]
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
          return updated
        })

        notifyBatchExecuted(discordWebhookUrl, {
          label, totalAmount, token: selectedToken,
          txHash: receipt.hash, explorerUrl: batch.explorerUrl,
          recipients: batch.recipients, orgName,
        })

        const emailRecipients = batch.recipients.filter((r) => r.email)
        if (emailRecipients.length > 0) {
          fetch(`${EMAIL_API_URL}/api/send-payment-emails`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: emailRecipients.map((r) => ({
                email: r.email, name: r.name, address: r.address,
                amount: r.amount, token: selectedToken,
              })),
              explorerBaseUrl: explorerBase,
              date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
              senderName: orgName,
            }),
          }).catch((err) => console.error('[email] notification failed:', err.message))
        }

        await fetchTokenBalance(account, provider, selectedToken)
        return { txHash: receipt.hash, explorerUrl: batch.explorerUrl }
      } catch (err) {
        notifyBatchFailed(discordWebhookUrl, { label, orgName })
        throw err
      }
    },
    [signer, account, provider, fetchTokenBalance, selectedToken]
  )

  const disconnect = useCallback(() => {
    setAccount(null)
    setProvider(null)
    setSigner(null)
    setIsCorrectNetwork(false)
    setTokenBalance('0')
  }, [])

  useEffect(() => {
    if (!window.ethereum) return
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnect()
      else setAccount(accounts[0])
    }
    const onChainChanged = () => window.location.reload()
    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener('chainChanged', onChainChanged)
    }
  }, [disconnect])

  const stats = {
    totalPaid: history.reduce((s, b) => s + (b.totalAmount || 0), 0),
    totalRuns: history.length,
    lastRun: history[0] || null,
  }

  return (
    <Web3Context.Provider
      value={{
        account, provider, signer, isCorrectNetwork, tokenBalance,
        selectedToken, setSelectedToken,
        history, networkError, stats,
        settings, updateSettings,
        connect, disconnect, switchToMorph, sendPayroll,
      }}
    >
      {children}
    </Web3Context.Provider>
  )
}

export function useWeb3() {
  const ctx = useContext(Web3Context)
  if (!ctx) throw new Error('useWeb3 must be used inside Web3Provider')
  return ctx
}
