import { motion } from 'motion/react';

interface Props {
  message: string;
  onRetry: () => void;
}

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        margin: '16px 32px 0',
        padding: '14px 18px',
        background: 'var(--error-tint)',
        border:
          '1px solid color-mix(in oklch, var(--error-color) 35%, transparent)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span>
        <strong style={{ color: 'var(--error-color)' }}>Fehler:</strong> {message}
      </span>
      <button className="btn-date" onClick={onRetry}>
        ↻ Erneut versuchen
      </button>
    </motion.div>
  );
}
