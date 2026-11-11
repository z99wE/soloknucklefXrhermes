import React from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'soloknuckle'

export default {
  id: ID,
  name: 'Soloknuckle',
  defaultEnabled: false,
  register(ctx) {
    ctx.i18n.register({
      en: {
        title: 'Soloknuckle',
        secrets: 'Secrets',
        intercept: 'Intercept',
        health: 'Health',
        clean: 'Clean',
        violations: 'Violations',
        blocked: 'Blocked',
        allowed: 'Allowed',
        score: 'Score',
        issues: 'Issues',
        noIssues: 'No issues found',
      }
    })

    ctx.register({
      id: 'soloknuckle-pane',
      area: 'panes',
      title: 'Soloknuckle',
      data: { placement: 'right', width: '320px' },
      render: () => jsx(Pane, { ctx })
    })
  }
}

function Pane({ ctx }) {
  const [result, setResult] = React.useState(null)
  const [loading, setLoading] = React.useState(false)

  async function runHealth() {
    setLoading(true)
    try {
      const res = await ctx.rest('/health', { method: 'GET' })
      setResult(res.data)
    } catch (e) {
      setResult({ error: e.message })
    }
    setLoading(false)
  }

  return jsxs('div', {
    className: 'flex flex-col gap-3 p-3',
    children: [
      jsx('div', {
        className: 'text-sm font-semibold text-[#161616]',
        children: 'Soloknuckle'
      }),
      jsx('div', {
        className: 'text-xs text-[#525252]',
        children: 'Production hygiene for solo developers'
      }),
      jsx('button', {
        type: 'button',
        className: 'px-3 py-1.5 text-xs font-medium bg-[#0f62fe] text-white rounded border border-[#0f62fe] hover:bg-[#0353e9]',
        onClick: runHealth,
        children: loading ? 'Checking...' : 'Run Health Check'
      }),
      result && jsxs('div', {
        className: 'flex flex-col gap-2 mt-2',
        children: [
          result.score !== undefined && jsxs('div', {
            className: 'flex items-center justify-between p-2 rounded border border-[#d0d0d0] bg-[#f4f4f4]',
            children: [
              jsx('span', { className: 'text-xs text-[#525252]', children: 'Score' }),
              jsx('span', { className: 'text-sm font-bold text-[#161616]', children: result.score + '/100' })
            ]
          }),
          result.grade && jsxs('div', {
            className: 'flex items-center justify-between p-2 rounded border border-[#d0d0d0] bg-[#f4f4f4]',
            children: [
              jsx('span', { className: 'text-xs text-[#525252]', children: 'Grade' }),
              jsx('span', { className: 'text-sm font-bold text-[#161616]', children: result.grade })
            ]
          }),
          result.issues && result.issues.length > 0 && jsxs('div', {
            className: 'flex flex-col gap-1',
            children: [
              jsx('span', { className: 'text-xs font-medium text-[#525252]', children: 'Issues' }),
              ...result.issues.map((issue, i) => jsx('div', {
                key: i,
                className: 'text-xs text-[#da1e28] p-1.5 rounded bg-[#fff1f1] border border-[#ffd7d9]',
                children: issue
              }))
            ]
          }),
          result.issues && result.issues.length === 0 && jsx('div', {
            className: 'text-xs text-[#24a148] p-1.5 rounded bg-[#defbe6] border border-[#a7f0ba]',
            children: 'No issues found'
          })
        ]
      })
    ]
  })
}