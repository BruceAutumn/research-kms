interface StatusMessageProps {
  error?: string;
  info?: string;
}

export default function StatusMessage({ error, info }: StatusMessageProps) {
  if (!error && !info) return null;
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
      {error || info}
    </div>
  );
}
