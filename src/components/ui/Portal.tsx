/**
 * Portal Component
 *
 * Renders children into a DOM node outside the parent component hierarchy.
 * This is essential for modals/dialogs that need to escape CSS transforms
 * or overflow:hidden on parent elements.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
}

export function Portal({ children }: PortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
