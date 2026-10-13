// Registry querying is supplied by the Windows E2E runner.
export function getWebViewRuntimeVersion(query: (key: string) => string | null): string | null {
  // The standalone Edge browser can update independently of WebView2.
  // https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
  const runtimeId = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
  const keys = [
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${runtimeId}`,
    `HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${runtimeId}`,
    `HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\${runtimeId}`,
  ];
  for (const key of keys) {
    const version = query(key)?.match(/pv\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)(?=\s|$)/)?.[1];
    if (version && version !== "0.0.0.0") return version;
  }
  return null;
}
