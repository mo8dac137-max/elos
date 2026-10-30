export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallPromptListener = (canInstall: boolean) => void;

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<InstallPromptListener>();

function notifyInstallListeners() {
  const canInstall = deferredInstallPrompt !== null;
  for (const listener of installListeners) {
    listener(canInstall);
  }
}

export function subscribeInstallPrompt(listener: InstallPromptListener): () => void {
  installListeners.add(listener);
  listener(deferredInstallPrompt !== null);
  return () => {
    installListeners.delete(listener);
  };
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;
  const promptEvent = deferredInstallPrompt;
  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  if (outcome === 'accepted') {
    deferredInstallPrompt = null;
    notifyInstallListeners();
    return true;
  }
  return false;
}

function showUpdateBanner(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('update-ready-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'update-ready-banner';
  banner.style.position = 'fixed';
  banner.style.top = '0';
  banner.style.left = '0';
  banner.style.right = '0';
  banner.style.zIndex = '99999';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'space-between';
  banner.style.padding = '12px 16px';
  banner.style.background = '#0d0d0d';
  banner.style.border = '1px solid #222';
  banner.style.borderTop = 'none';
  banner.style.color = '#d8d8d8';
  banner.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  banner.style.fontSize = '14px';

  const label = document.createElement('span');
  label.textContent = 'Update ready';
  label.style.fontWeight = '500';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  reloadBtn.style.background = '#141414';
  reloadBtn.style.color = '#d8d8d8';
  reloadBtn.style.border = '1px solid #2a2a2a';
  reloadBtn.style.padding = '6px 14px';
  reloadBtn.style.cursor = 'pointer';
  reloadBtn.style.fontSize = '14px';
  reloadBtn.style.borderRadius = '0';
  reloadBtn.onclick = () => {
    window.location.reload();
  };

  banner.appendChild(label);
  banner.appendChild(reloadBtn);
  document.body.prepend(banner);
}

export function initPWA(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    notifyInstallListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notifyInstallListeners();
  });

  if ('serviceWorker' in navigator) {
    let hadControllerOnLoad = Boolean(navigator.serviceWorker.controller);

    window.addEventListener('load', () => {
      hadControllerOnLoad = Boolean(navigator.serviceWorker.controller);

      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.update().catch(() => {});

          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              registration.update().catch(() => {});
            }
          });

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (
                installing.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                showUpdateBanner();
              }
            });
          });
        })
        .catch(() => {
          // SW registration failed, gracefully ignored
        });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadControllerOnLoad) {
        showUpdateBanner();
      } else {
        hadControllerOnLoad = true;
      }
    });
  }
}
