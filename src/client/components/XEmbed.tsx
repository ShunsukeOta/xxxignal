import { ExternalLink } from 'lucide-react'
import { useEffect, useRef } from 'react'

declare global {
  interface Window { twttr?: { widgets?: { load: (element?: HTMLElement) => void } } }
}

let scriptPromise: Promise<void> | null = null
function ensureWidgetScript() {
  if (window.twttr?.widgets) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-xxxignal-x-widget]')
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('X widget failed')), { once: true }); return }
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    script.dataset.xxxignalXWidget = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('X widget failed'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function XProfileViewer({ handle }: { handle: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    void ensureWidgetScript().then(() => window.twttr?.widgets?.load(element)).catch(() => undefined)
  }, [handle])
  const clean = handle.replace(/^@/, '')
  const url = `https://x.com/${encodeURIComponent(clean)}`
  return (
    <div className="x-viewer" ref={ref}>
      <a className="twitter-timeline" data-height="520" data-chrome="noheader nofooter transparent" href={url}>@{clean} の公開ポストを表示</a>
      <a className="x-viewer__fallback" href={url} target="_blank" rel="noopener noreferrer">Xでプロフィールを開く <ExternalLink size={13} /></a>
    </div>
  )
}

export function XPostViewer({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    void ensureWidgetScript().then(() => window.twttr?.widgets?.load(element)).catch(() => undefined)
  }, [url])
  return <div className="x-viewer" ref={ref}><blockquote className="twitter-tweet"><a href={url}>Xの公開ポストを表示</a></blockquote></div>
}
