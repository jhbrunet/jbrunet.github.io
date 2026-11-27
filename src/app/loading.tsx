import { BrandLogoMark } from '@/components/BrandLogoMark';

export default function Loading() {
  return (
    <div
      className="route-loader"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="route-loader-inner">
        <BrandLogoMark
          variant="route"
          loop
          showWordmark
          ariaLabel="J. Brunet logo loading"
        />
        <span className="route-loader-tag">START GATE / LOADING</span>
      </div>
    </div>
  );
}
