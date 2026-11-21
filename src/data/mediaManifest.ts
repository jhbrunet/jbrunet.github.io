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
      en: 'Julian Brunet carrying Rossignol giant slalom race skis under an alpine sky',
      fr: 'Julian Brunet portant des skis de slalom géant Rossignol sous un ciel alpin',
    },
    caption: {
      en: 'JULIAN BRUNET · CAN · FIS 6100596',
      fr: 'JULIAN BRUNET · CAN · FIS 6100596',
    },
  },
  gate03SuperSeries: {
    aspectRatio: '3:2',
    objectPosition: 'center',
    alt: {
      en: 'Julian Brunet in speed suit carving around a blue EDLS giant slalom gate',
      fr: 'Julian Brunet en combinaison de course contournant une porte bleue de slalom géant EDLS',
    },
    caption: {
      en: 'EDLS · GIANT SLALOM',
      fr: 'EDLS · SLALOM GÉANT',
    },
  },
  gate05EquipeQuebec: {
    aspectRatio: '16:9',
    objectPosition: 'center',
    alt: {
      en: 'Julian Brunet carving a giant slalom turn through snow spray along alpine B-netting',
      fr: 'Julian Brunet en appui de slalom géant dans une gerbe de neige le long des filets B',
    },
    caption: {
      en: 'GS TRAINING · HIGH-PITCH CARVE',
      fr: 'GS · APPUI EN PENTE',
    },
  },
  gate08MontGarceau: {
    aspectRatio: '1:1',
    objectPosition: 'center',
    alt: {
      en: 'Julian Brunet tuning race skis at the wax bench with race quiver behind',
      fr: 'Julian Brunet préparant des skis de course à l’établi avec des skis alignés',
    },
    caption: {
      en: 'WAX ROOM · RACE PREP',
      fr: 'ATELIER · PRÉP. SKIS',
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
