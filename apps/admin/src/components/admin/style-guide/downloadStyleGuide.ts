import JSZip from 'jszip';
import {
  TEXT_BUNDLE_FILES,
  LOGO_PUBLIC_PATHS,
  buildLlmsFull,
  buildLlmsShort,
} from './bundleFiles';

export type StyleGuideDownloadKind = 'zip' | 'llms' | 'llms-full';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function buildZipBlob(): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder('synth-skills-bundle');
  if (!root) throw new Error('Failed to create zip root');

  for (const [path, content] of Object.entries(TEXT_BUNDLE_FILES)) {
    root.file(path, content);
  }

  root.file('llms.txt', buildLlmsShort());
  root.file('llms-full.txt', buildLlmsFull());

  for (const name of LOGO_PUBLIC_PATHS) {
    const url = `/${name.split('/').map(encodeURIComponent).join('/')}`;
    const logoRes = await fetch(url);
    if (!logoRes.ok) continue;
    const fileName = name.split('/').pop() || name;
    root.file(`synth-brand/reference/logo/${fileName}`, await logoRes.arrayBuffer());
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Build and download style guide artifacts.
 * Caller must already be on the admin portal (auth gated).
 */
export async function downloadStyleGuideArtifact(kind: StyleGuideDownloadKind): Promise<void> {
  if (kind === 'llms') {
    triggerBlobDownload(new Blob([buildLlmsShort()], { type: 'text/plain;charset=utf-8' }), 'llms.txt');
    return;
  }

  if (kind === 'llms-full') {
    triggerBlobDownload(
      new Blob([buildLlmsFull()], { type: 'text/plain;charset=utf-8' }),
      'llms-full.txt',
    );
    return;
  }

  triggerBlobDownload(await buildZipBlob(), 'synth-skills-bundle.zip');
}
