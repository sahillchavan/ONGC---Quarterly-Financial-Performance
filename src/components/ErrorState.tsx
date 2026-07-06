import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-panel border border-maroon/30 rounded-lg p-8 max-w-md w-full text-center"
      >
        <div className="w-14 h-14 rounded-full bg-maroon/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-maroon" />
        </div>
        <h2 className="font-display text-xl font-semibold text-paper mb-2">
          Could Not Load Data
        </h2>
        <p className="text-paper-dim font-mono text-sm mb-6">
          {message}
        </p>
        <div className="bg-panel-alt rounded p-4 mb-6 text-left">
          <p className="text-paper-faint font-mono text-xs leading-relaxed">
            <strong className="text-paper-dim">Troubleshooting:</strong>
            <br />
            • Make sure the app is served over HTTP (not file://)
            <br />
            • Check that data/quarterly.json exists
            <br />
            • Try running: <code className="text-brass">npm run dev</code>
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brass/10 border border-brass/30 rounded-md text-brass font-mono text-sm hover:bg-brass/20 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </motion.div>
    </div>
  );
}
