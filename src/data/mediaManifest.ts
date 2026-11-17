import rawManifest from '../../public/media/manifest.json';
import type { Locale } from './runStore';

export type MediaSlotId =
  | 'heroPortrait'
  | 'gate03SuperSeries'
  | 'gate05EquipeQuebec'
  | 'gate08MontGarceau';

export type MediaAspectRatio = '4:5' | '3:2' | '16:9' | '1:1';
export type MediaObjectPosition = 'top' | 'center';
export type MediaAssetType = 'image' | 'video';

export interface RawManifestSlot {
  id: string;
  category: string;
  gate: string;
  available: boolean;
  mediaType: string;
  src: string | null;
  avifSrc: string | null;
  webpSrc: string | null;
  posterSrc: string | null;
  width: number;
  height: number;
  aspectRatio: string;
  focalGravity: string;
  objectPosition: string;
  targetDir: string;
  expectedBasename: string;
}

export interface MotionClipEntry {
  id: string;
  src: string;
  posterSrc: string;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface MediaSlotEntry {
  id: MediaSlotId;
  gate: string;
  available: boolean;
  mediaType: MediaAssetType;
  src: string | null;
  avifSrc: string | null;
  webpSrc: string | null;
  posterSrc: string | null;
  width: number;
  height: number;
  aspectRatio: MediaAspectRatio;
  objectPosition: MediaObjectPosition;
  alt: Record<Locale, string>;
  caption: Record<Locale, string>;
}

const SLOT_TEXT: Record<
  MediaSlotId,
  {
    aspectRatio: MediaAspectRatio;
    objectPosition: MediaObjectPosition;
    alt: Record<Locale, string>;
    caption: Record<Locale, string>;
  }
> = {
  heroPortrait: {
    aspectRatio: '4:5',
    objectPosition: 'top',
    alt: {
      en: 'Julian Brunet portrait in alpine race gear at Mont Garceau',
      fr: 'Portrait de Julian Brunet en tenue de course alpine au Mont Garceau',
    },
    caption: {
      en: 'START GATE / PORTRAIT 4:5',
      fr: 'PORTILLON / PORTRAIT 4:5',
    },
  },
  gate03SuperSeries: {
    aspectRatio: '3:2',
    objectPosition: 'center',
    alt: {
      en: 'Giant slalom action from the 2021–22 Ski Quebec Alpin Super Series',
      fr: 'Passage en slalom géant lors de la Super Série Ski Québec Alpin 2021–22',
    },
    caption: {
      en: 'U18 SUPER SERIES · GEORGIAN PEAKS / 2022',
      fr: 'SUPER SÉRIE U18 · GEORGIAN PEAKS / 2022',
    },
  },
  gate05EquipeQuebec: {
    aspectRatio: '16:9',
    objectPosition: 'center',
    alt: {
      en: 'Equipe du Quebec giant slalom run during 2024–25 Nor-Am and FIS campaign',
      fr: 'Descente en slalom géant avec l’Équipe du Québec durant la saison Nor-Am et FIS 2024–25',
    },
    caption: {
      en: 'ÉQUIPE DU QUÉBEC · WHITEFACE / NOR-AM ACTION',
      fr: 'ÉQUIPE DU QUÉBEC · WHITEFACE / ACTION NOR-AM',
    },
  },
  gate08MontGarceau: {
    aspectRatio: '1:1',
    objectPosition: 'center',
    alt: {
      en: 'Coaching U18 FIS Men athletes on snow at Club de Ski Mont Garceau',
      fr: 'Entraînement des coureurs U18 FIS masculins sur neige au Club de Ski Mont Garceau',
    },
    caption: {
      en: 'MONT GARCEAU U18 · COACHING & TIMING TOOLS',
      fr: 'MONT GARCEAU U18 · COACHING & CHRONOMÉTRAGE',
    },
  },
};

function normalizeSlot(id: MediaSlotId): MediaSlotEntry {
  const rawSlots = rawManifest.slots as Record<string, RawManifestSlot>;
  const raw = rawSlots[id];
  const meta = SLOT_TEXT[id];

  return {
    id,
    gate: raw.gate,
    available: Boolean(raw.available && (raw.webpSrc || raw.src)),
    mediaType: raw.mediaType === 'video' ? 'video' : 'image',
    src: raw.src ?? null,
    avifSrc: raw.avifSrc ?? null,
    webpSrc: raw.webpSrc ?? null,
    posterSrc: raw.posterSrc ?? null,
    width: raw.width,
    height: raw.height,
    aspectRatio: meta.aspectRatio,
    objectPosition: raw.objectPosition === 'top' ? 'top' : meta.objectPosition,
    alt: meta.alt,
    caption: meta.caption,
  };
}

export const MEDIA_SLOTS: Record<MediaSlotId, MediaSlotEntry> = {
  heroPortrait: normalizeSlot('heroPortrait'),
  gate03SuperSeries: normalizeSlot('gate03SuperSeries'),
  gate05EquipeQuebec: normalizeSlot('gate05EquipeQuebec'),
  gate08MontGarceau: normalizeSlot('gate08MontGarceau'),
};

export const MOTION_CLIPS: MotionClipEntry[] = Array.isArray(rawManifest.motion)
  ? (rawManifest.motion as MotionClipEntry[])
  : [];

export function getMediaSlot(id: MediaSlotId): MediaSlotEntry {
  return MEDIA_SLOTS[id];
}
