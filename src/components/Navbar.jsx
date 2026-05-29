import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useWeb3 } from '../context/Web3Context'

function shortAddress(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function SettingsModal({ settings, onSave, onClose }) {
  const [orgName, setOrgName] = useState(settings.orgName || 'NovaPay')
  const [webhookUrl, setWebhookUrl] = useState(settings.discordWebhookUrl || '')
  const [gmailUser, setGmailUser] = useState(settings.gmailUser || '')
  const [gmailAppPassword, setGmailAppPassword] = useState(settings.gmailAppPassword || '')
  const [showPassword, setShowPassword] = useState(false)

  function handleSave() {
    onSave({
      orgName: orgName.trim() || 'NovaPay',
      discordWebhookUrl: webhookUrl.trim(),
      gmailUser: gmailUser.trim(),
      gmailAppPassword: gmailAppPassword.trim(),
    })
    onClose()
  }

  const label = (text) => (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{text}</label>
  )
  const hint = (text) => (
    <div className="label-hint" style={{ marginTop: 4 }}>{text}</div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 520, margin: 'auto', padding: '28px 32px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Settings</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} style={{ lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          {label('Organization Name')}
          <input className="label-input" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="NovaPay" maxLength={80} />
          {hint('Shown in payment emails and Discord notifications as the sender name.')}
        </div>

        <div style={{ marginBottom: 20 }}>
          {label('Discord Webhook URL')}
          <input className="label-input" type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
          {hint('In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy URL. Leave blank to disable.')}
        </div>

        <div style={{ borderTop: '1px solid var(--border, #334155)', margin: '20px 0' }} />
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Email Sender (optional)</div>

        <div style={{ marginBottom: 16 }}>
          {label('Gmail Address')}
          <input className="label-input" type="email" value={gmailUser} onChange={(e) => setGmailUser(e.target.value)} placeholder="youraddress@gmail.com" />
          {hint('The Gmail account payment emails will be sent from. Leave blank to use the default configured on the server.')}
        </div>

        <div style={{ marginBottom: 8 }}>
          {label('Gmail App Password')}
          <div style={{ position: 'relative' }}>
            <input
              className="label-input"
              type={showPassword ? 'text' : 'password'}
              value={gmailAppPassword}
              onChange={(e) => setGmailAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              style={{ paddingRight: 60 }}
            />
            <button
              onClick={() => setShowPassword((p) => !p)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div className="label-hint" style={{ marginBottom: 20 }}>
          16-character Google App Password. Requires Gmail 2-Step Verification to be enabled.{' '}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #818cf8)', textDecoration: 'underline' }}>
            How to generate one →
          </a>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  )
}

export default function Navbar({ theme, toggleTheme }) {
  const { account, tokenBalance, selectedToken, isCorrectNetwork, networkError, disconnect, switchToMorph, settings, updateSettings } = useWeb3()
  const location = useLocation()
  const [switching, setSwitching] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  async function handleSwitchNetwork() {
    if (switching) return
    setSwitching(true)
    try {
      await switchToMorph()
    } catch {
      // user rejected or error — silently reset
    } finally {
      setSwitching(false)
    }
  }

  if (!account) return null

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/payroll/new', label: 'New Payroll' },
    { to: '/history', label: 'Ledger' },
  ]

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/dashboard" className="navbar-logo">
            <span className="logo-icon">✦</span>
            <span className="logo-text">NovaPay</span>
          </Link>

          <div className="navbar-links">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="navbar-right">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              className="theme-toggle"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              ⚙
            </button>
            {isCorrectNetwork ? (
              <div className="network-badge ok">
                <span className="network-dot" />
                Morph Testnet
              </div>
            ) : (
              <button
                className="network-badge warn network-badge-btn"
                onClick={handleSwitchNetwork}
                disabled={switching}
                title="Click to switch to Morph Hoodi"
              >
                <span className="network-dot" />
                {switching ? 'Switching…' : 'Wrong Network'}
              </button>
            )}
            <div className="usdc-balance">
              <span className="balance-label">{selectedToken}</span>
              <span className="balance-value">{parseFloat(tokenBalance).toLocaleString()}</span>
            </div>
            <div className="wallet-chip">
              <span className="wallet-dot" />
              <span>{shortAddress(account)}</span>
              <button className="disconnect-btn" onClick={disconnect} title="Disconnect">✕</button>
            </div>
          </div>
        </div>
        {networkError && (
          <button className="network-warning-bar" onClick={handleSwitchNetwork} disabled={switching}>
            ⚠ {networkError}
            <span className="switch-cta">{switching ? 'Switching…' : '→ Click to switch'}</span>
          </button>
        )}
      </nav>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
