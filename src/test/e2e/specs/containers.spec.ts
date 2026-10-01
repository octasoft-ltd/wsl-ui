import * as path from 'node:path';
import { standardSetup } from '../base';
import { safeRefresh } from '../utils';
import type { ContainerConnection, ContainerCreateSpec, ContainerInspect, ContainerMutationResult, ContainerSummary } from '../../../types/containers';

// IPC fixture setup uses the same Rust command paths as the UI. Never run this
// suite against a real runtime, even if the test runner is misconfigured.
async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await browser.executeAsync((cmd: string, params: Record<string, unknown>, done: (result: { value?: unknown; failure?: unknown }) => void) => {
    // @ts-expect-error Tauri exposes this API in the desktop webview.
    window.__TAURI__.core.invoke(cmd, params).then((value: unknown) => done({ value }), (error: unknown) => done({ failure: error }));
  }, command, args);
  if (result.failure) throw new Error(JSON.stringify(result.failure));
  return result.value as T;
}

const workspace = () => $('[data-testid="workspace-containers"]');
const cards = () => $$('[data-testid^="container-card-"]');
async function cardTexts(): Promise<string[]> {
  // Read one DOM snapshot: removal may invalidate a WebDriver element between
  // fetching the card list and reading each individual card's text.
  return browser.execute(() => Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid^="container-card-"]'),
    card => card.innerText,
  ));
}
async function cardNamed(name: string) {
  await browser.waitUntil(async () => {
    for (const card of await cards()) if ((await card.getText()).split('\n').includes(name)) return true;
    return false;
  }, { timeout: 10000, timeoutMsg: `Container ${name} did not appear` });
  for (const card of await cards()) if ((await card.getText()).split('\n').includes(name)) return card;
  throw new Error(`Container ${name} disappeared`);
}
async function connect() {
  await workspace().click();
  const connectButton = await $('[data-testid="container-connect"]');
  await connectButton.waitForClickable();
  await connectButton.click();
  await browser.waitUntil(async () => (await cards().length) > 0, { timeout: 10000 });
}
function spec(name: string): ContainerCreateSpec {
  return { name, image: 'alpine:latest', start: false, ports: [], mounts: [], environment: [], command: ['/bin/sh'], entrypoint: null, workingDirectory: null, user: null, cpus: null, memoryMb: null };
}

describe('WSL container workspace', () => {
  beforeEach(async () => {
    expect(await invoke<boolean>('is_mock_mode_cmd')).toBe(true);
    await standardSetup();
  });

  it('requires an explicit connection and includes externally created containers', async () => {
    await workspace().click();
    await $('[data-testid="container-connect"]').waitForDisplayed();
    expect((await cards().length)).toBe(0);
    await $('[data-testid="container-connect"]').click();
    await browser.waitUntil(async () => (await cards().length) >= 2);
    const inventory = (await cardTexts()).join('\n');
    expect(inventory).toMatch(/Created elsewhere|Created outside|External/i);
  });

  it('creates a container through the form and starts and stops it', async () => {
    await connect();
    await $('[data-testid="container-create"]').click();
    await $('[data-testid="container-create-name"]').setValue('e2e-service');
    await $('[data-testid="container-create-image"]').setValue('alpine:latest');
    await $('summary=Advanced').click();
    await $('[data-testid="container-create-form"] textarea').setValue('/bin/sh\n-c\necho literal-argument');
    await $('[data-testid="container-create-submit"]').click();
    let card = await cardNamed('e2e-service');
    await card.$('[data-testid="container-stop"]').waitForClickable();
    const connection = await invoke<ContainerConnection>('container_connect');
    const created = (await invoke<ContainerSummary[]>('container_list', { connection })).find(row => row.name === 'e2e-service')!;
    const inspected = await invoke<ContainerInspect>('container_inspect', { connection, id: created.id });
    expect(inspected.configuration?.command).toEqual(['/bin/sh', '-c', 'echo literal-argument']);
    await card.$('[data-testid="container-stop"]').click();
    card = await cardNamed('e2e-service');
    await card.$('[data-testid="container-start"]').waitForClickable();
    await card.$('[data-testid="container-start"]').click();
    card = await cardNamed('e2e-service');
    await card.$('[data-testid="container-stop"]').waitForClickable();
  });

  it('preserves search across views and reconnects explicitly after reload', async () => {
    await connect();
    await $('[data-testid="container-search"]').setValue('no-matching-container');
    await $('[data-testid="workspace-distributions"]').click();
    await workspace().click();
    expect(await $('[data-testid="container-search"]').getValue()).toBe('no-matching-container');
    await safeRefresh();
    await $('[data-testid="container-connect"]').waitForDisplayed();
    expect(await workspace().getAttribute('aria-pressed')).toBe('true');
    await $('[data-testid="container-connect"]').waitForDisplayed();
    expect((await cards().length)).toBe(0);
  });

  it('shows bounded logs and lets the user pause following', async () => {
    await connect();
    const card = await cardNamed('web');
    await card.$('[data-testid="container-logs"]').click();
    const output = await $('[data-testid="container-log-output"]');
    await output.waitForDisplayed();
    await browser.waitUntil(async () => (await output.getText()).length > 0);
    expect(await output.getText()).not.toMatch(/No logs|No recent logs/i);
    const follow = await $('[data-testid="container-logs-follow"]');
    await follow.click();
    expect(await follow.getAttribute('aria-pressed')).toBe('true');
    await follow.click();
    expect(await follow.getAttribute('aria-pressed')).toBe('false');
  });

  it('requires removal confirmation and leaves the container on cancel', async () => {
    await connect();
    const card = await cardNamed('database');
    await card.$('[data-testid="container-remove"]').click();
    const dialog = await $('[role="alertdialog"]');
    await dialog.waitForDisplayed();
    await browser.waitUntil(async () => (await dialog.getText()).includes('database'));
    expect(await dialog.getText()).toContain('database');
    expect(await dialog.getText()).toMatch(/volumes.*retain|retain.*volumes/i);
    await dialog.$('button=Cancel').click();
    await dialog.waitForDisplayed({ reverse: true });
    await cardNamed('database');
    await card.$('[data-testid="container-remove"]').click();
    await dialog.$('button=Confirm remove').click();
    await browser.waitUntil(async () => {
      const text = await cardTexts();
      return !text.some(value => value.split('\n').includes('database'));
    });
  });

  it('keeps details inside the app at the minimum window width', async () => {
    await connect();
    const prior = await browser.getWindowSize();
    try {
      await browser.setWindowSize(800, 720);
      const card = await cardNamed('web');
      await card.$('[data-testid^="container-details-"]').click();
      await $('[data-testid="container-detail"]').waitForDisplayed();
      const bounds = await browser.execute(() => {
        const element = document.querySelector('[data-testid="container-detail"]')!;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
      expect(bounds.overflow).toBe(false);
      await browser.saveScreenshot(path.join(process.cwd(), '.cache', 'container-detail-800.png'));
    } finally { await browser.setWindowSize(prior.width, prior.height); }
  });

  it('explains unsupported volume backup and disables saving', async () => {
    await connect();
    const card = await cardNamed('database');
    await card.$('[data-testid^="container-details-"]').click();
    await $('[data-testid="container-tab-backups"]').click();
    const panel = await $('[data-testid="container-backup-panel"]');
    await browser.waitUntil(async () => (await panel.getText()).includes('database-data'));
    expect(await panel.getText()).toMatch(/helper|unavailable|not.*supported|not.*verified/i);
    expect(await $('[data-testid="container-backup-save"]').isEnabled()).toBe(false);
  });

  it('round-trips a supported backup through Rust and shows the restored stopped container', async () => {
    await connect();
    const connection = await invoke<ContainerConnection>('container_connect');
    const created = await invoke<ContainerMutationResult>('container_create', { connection, spec: spec('e2e-backup-source') });
    expect(created.container?.id).toBeTruthy();
    const bundle = path.join(process.cwd(), '.cache', `container-e2e-${Date.now()}.wslcbackup`);
    const coverage = await invoke<{ supported: boolean }>('container_backup_preflight', { connection, id: created.container!.id });
    expect(coverage.supported).toBe(true);
    await invoke('container_backup', { connection, id: created.container!.id, path: bundle });
    await invoke('container_action', { connection, id: created.container!.id, action: 'remove' });
    await invoke('container_restore', { connection, path: bundle, name: 'e2e-restored' });
    const restored = (await invoke<ContainerSummary[]>('container_list', { connection })).find(c => c.name === 'e2e-restored');
    expect(restored?.state).not.toBe('running');
    await $('[data-testid="container-refresh"]').click();
    await cardNamed('e2e-restored');
  });
});
