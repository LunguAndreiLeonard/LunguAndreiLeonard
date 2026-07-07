import type { VideoProvider } from './types';
import { muApiProvider } from './muapi';
import { falProvider } from './fal';
import { mockProvider } from './mock';

export * from './types';

export const PROVIDERS: VideoProvider[] = [muApiProvider, falProvider, mockProvider];

export function getProvider(id: string): VideoProvider {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown provider "${id}"`);
  return provider;
}
