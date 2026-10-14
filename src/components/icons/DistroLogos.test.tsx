import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { getDistroLogo } from './DistroLogos';
import { getDistroFamily } from '../../types/catalog';

function labelFor(distroId: string): string | null {
  const Logo = getDistroLogo(distroId);
  const { container } = render(<Logo />);
  return container.querySelector('svg')?.getAttribute('aria-label') ?? null;
}

describe('getDistroLogo RLC handling', () => {
  it.each(['RLC', 'RLC-8', 'rlc-9', 'RLC-10', 'ciq'])(
    'returns the RLC glyph for %s',
    (id) => {
      expect(labelFor(id)).toBe('Rocky Linux from CIQ');
    },
  );

  it('prefers the RLC glyph over the generic Rocky match for CIQ-qualified ids', () => {
    expect(labelFor('CIQ-RockyLinux')).toBe('Rocky Linux from CIQ');
  });

  it('still returns the Rocky glyph for plain Rocky ids', () => {
    expect(labelFor('Rocky')).toBe('Rocky Linux');
  });
});

describe('getDistroFamily RLC handling', () => {
  it.each(['RLC-9', 'ciq', 'CIQ-RockyLinux'])('classifies %s as redhat', (id) => {
    expect(getDistroFamily(id)).toBe('redhat');
  });
});
