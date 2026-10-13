import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InstallConfigDialog } from './InstallConfigDialog';
import { CloneDialog } from './CloneDialog';
import { RenameDialog } from './RenameDialog';
import { wslService } from '../services/wslService';

vi.mock('../store/distroStore', () => ({
  useDistroStore: () => ({ distributions: [], fetchDistros: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('../store/notificationStore', () => ({
  useNotificationStore: () => ({ addNotification: vi.fn() }),
}));
vi.mock('../services/wslService', () => ({
  wslService: {
    getDefaultDistroPath: vi.fn().mockResolvedValue('C:\\WSL\\Release-Test'),
    validateInstallPath: vi.fn().mockResolvedValue({ isValid: true }),
    cloneDistribution: vi.fn().mockResolvedValue(undefined),
    renameDistribution: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

describe.each(['install-config', 'clone', 'rename'] as const)('%s distro names', (dialog) => {
  const onInstall = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const shared = { isOpen: true, onClose: vi.fn() };
    if (dialog === 'install-config') {
      render(<InstallConfigDialog {...shared} mode="download" onInstall={onInstall}
        selectedItem={{ name: 'Ubuntu', suggestedName: 'Ubuntu' }} />);
    } else if (dialog === 'clone') {
      render(<CloneDialog {...shared} sourceName="Ubuntu" />);
    } else {
      render(<RenameDialog {...shared} distroId="ubuntu-id" currentName="Ubuntu" />);
    }
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('submits a valid hyphenated name unchanged', async () => {
    fireEvent.change(screen.getByTestId(`${dialog}-name-input`), { target: { value: 'Release-Test' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    const button = screen.getByTestId(`${dialog}-confirm-button`);
    expect(button).toBeEnabled();
    await act(async () => { fireEvent.click(button); });
    if (dialog === 'install-config') {
      expect(onInstall).toHaveBeenCalledWith({ distroName: 'Release-Test', installLocation: undefined, wslVersion: 2 });
    } else if (dialog === 'clone') {
      expect(wslService.cloneDistribution).toHaveBeenCalledWith('Ubuntu', 'Release-Test', undefined);
    } else {
      expect(wslService.renameDistribution).toHaveBeenCalledWith('ubuntu-id', 'Release-Test', true, true);
    }
  });

  it.each(['Rocky Test', 'Release Test!', 'Release/Test', 'Release\tTest'])('still rejects %j', async (name) => {
    fireEvent.change(screen.getByTestId(`${dialog}-name-input`), { target: { value: name } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(screen.getByTestId(`${dialog}-confirm-button`)).toBeDisabled();
  });
});
