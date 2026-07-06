import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="w-12 h-12 rounded-md bg-gradient-to-br from-maroon to-[#7a2e2b] flex items-center justify-center border border-brass/30">
            <span className="font-display font-semibold text-lg text-brass">ON</span>
          </div>
          <motion.div
            className="absolute -inset-1 rounded-lg border border-brass/20"
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <div className="flex items-center gap-2 text-paper-dim font-mono text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading financial data...</span>
        </div>
      </motion.div>
    </div>
  );
}
