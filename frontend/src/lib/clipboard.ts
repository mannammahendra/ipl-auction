/**
 * Cross-platform clipboard helper that works seamlessly in:
 * - Secure contexts (HTTPS, localhost)
 * - Insecure / Local LAN contexts (HTTP, 192.168.x.x)
 * - Mobile Android WebViews and mobile browsers
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Try modern clipboard API if supported and in secure context
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  // 2. Robust execCommand fallback for HTTP LAN & WebViews
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export function shareOrCopyInvite(options: {
  title: string;
  roomName: string;
  roomCode: string;
  url: string;
}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const shareText = `🏏 Join my IPL Mega Auction Room: ${options.roomName}!\nRoom Code: ${options.roomCode}\nDirect link: ${options.url}`;

  // Try native share sheet on mobile if available
  if (navigator?.share) {
    return navigator
      .share({
        title: options.title,
        text: shareText,
        url: options.url,
      })
      .then(() => true)
      .catch(() => copyToClipboard(options.url));
  }

  // Otherwise copy to clipboard
  return copyToClipboard(options.url);
}

