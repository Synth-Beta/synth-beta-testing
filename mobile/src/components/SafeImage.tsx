import React, { useCallback, useMemo, useState } from 'react';
import { Image, type ImageProps, type ImageStyle } from 'expo-image';
import { resolveFeedImageUri } from '../utils/eventImages';

const DEFAULT_PLACEHOLDER = require('../../assets/Synth_Placeholder.png');

function isAllowedRemoteUri(uri: string): boolean {
  const u = uri.trim();
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('file://');
}

export type SafeImageProps = Omit<ImageProps, 'source'> & {
  uri?: string | null;
  style?: ImageStyle;
  placeholderSource?: number;
};

/**
 * Remote image with JamBase placeholder filtering and bundled fallback on load failure.
 */
export function SafeImage({
  uri,
  style,
  contentFit = 'cover',
  placeholderSource = DEFAULT_PLACEHOLDER,
  ...rest
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  const resolved = useMemo(() => {
    if (failed) return null;
    const cleaned = resolveFeedImageUri(uri);
    if (!cleaned || !isAllowedRemoteUri(cleaned)) return null;
    return cleaned;
  }, [uri, failed]);

  const onError = useCallback(() => {
    setFailed(true);
  }, []);

  const source = resolved ? { uri: resolved } : placeholderSource;

  return (
    <Image
      {...rest}
      source={source}
      style={style}
      contentFit={contentFit}
      onError={onError}
      recyclingKey={resolved ?? 'placeholder'}
    />
  );
}
