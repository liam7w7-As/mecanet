import { motion } from 'motion/react';

import type { ReactNode } from 'react';

/**
 * Transición de página: cada ruta entra con fade + subida sutil.
 * Se usa con key={pathname} para re-animar al navegar.
 */
export const PageTransition = ({ children, routeKey }: { children: ReactNode; routeKey: string }) => (
  <motion.div
    key={routeKey}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

export default PageTransition;
