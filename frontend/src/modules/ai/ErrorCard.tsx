export default function ErrorCard({ error, onRetry }: { error: Record<string, unknown>; onRetry?: () => void }) {
  return (
    <div className="ai2-error-card">
      <b>{String(error.code || 'ERROR')} . {String(error.httpStatus || '')}</b>
      <p>{String(error.message || 'Request failed')}</p>
      {error.requestId ? <small>requestId: {String(error.requestId)}</small> : null}
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}
