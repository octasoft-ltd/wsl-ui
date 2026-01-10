import { describe, it, expect } from 'vitest';
import {
  APP_CONFIG,
  DISTRO_ICONS,
  ANIMATION_DELAYS,
  DEFAULT_SETTINGS,
  getDistroIcon,
} from './index';

describe('constants', () => {
  describe('APP_CONFIG', () => {
    it('has app name', () => {
      expect(APP_CONFIG.APP_NAME).toBe('WSL UI');
    });

    it('has refresh interval', () => {
      expect(APP_CONFIG.REFRESH_INTERVAL_MS).toBeGreaterThan(0);
    });
  });

  describe('DISTRO_ICONS', () => {
    it('has common distro icons', () => {
      expect(DISTRO_ICONS.Ubuntu).toBeDefined();
      expect(DISTRO_ICONS.Debian).toBeDefined();
      expect(DISTRO_ICONS.Alpine).toBeDefined();
    });

    it('has default icon', () => {
      expect(DISTRO_ICONS.default).toBeDefined();
    });
  });

  describe('getDistroIcon', () => {
    it('returns correct icon for known distro', () => {
      expect(getDistroIcon('Ubuntu')).toBe(DISTRO_ICONS.Ubuntu);
    });

    it('returns correct icon for distro variant', () => {
      expect(getDistroIcon('Ubuntu-22.04')).toBe(DISTRO_ICONS.Ubuntu);
    });

    it('returns default icon for unknown distro', () => {
      expect(getDistroIcon('SomeUnknownDistro')).toBe(DISTRO_ICONS.default);
    });
  });

  describe('ANIMATION_DELAYS', () => {
    it('has stagger delay', () => {
      expect(ANIMATION_DELAYS.STAGGER_MS).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('has WSL version default', () => {
      expect(DEFAULT_SETTINGS.WSL_VERSION).toBe(2);
    });

    it('has memory default', () => {
      expect(DEFAULT_SETTINGS.MEMORY).toBe('4GB');
    });
  });
});





