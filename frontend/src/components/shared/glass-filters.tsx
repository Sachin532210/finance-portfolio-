import * as React from "react";

/**
 * The refraction filter the glass surfaces borrow.
 *
 * `backdrop-filter: blur()` scatters light. Apple's material *bends* it -
 * the documented difference between Liquid Glass and every frosted-panel
 * effect before it is that background content is warped at the rim rather
 * than diffused evenly. Blur alone can never read as glass for that reason:
 * a blurred pane looks like frosted plastic, because plastic scatters and
 * glass refracts.
 *
 * So this builds a displacement map and hands it to feDisplacementMap. The
 * map encodes an x-shift in red and a y-shift in green, with 128 meaning "no
 * shift". It stays neutral through the middle and ramps only across the outer
 * band, which is what a convex pane does: flat in the centre, bending hardest
 * where it curves away at the edge.
 *
 * Both edges sample *inward*. Pushing outward would read from beyond the
 * filter region and leave a transparent fringe around every pane.
 */
function buildDisplacementMap(size = 128, edge = 0.18): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const image = ctx.createImageData(size, size);
  // Squared falloff, so the bend accelerates toward the rim instead of
  // ramping linearly - a linear ramp reads as a skew, not as curvature.
  const ramp = (t: number) => {
    if (t < edge) {
      const k = 1 - t / edge;
      return 128 + 127 * k * k;
    }
    if (t > 1 - edge) {
      const k = (t - (1 - edge)) / edge;
      return 128 - 127 * k * k;
    }
    return 128;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      image.data[i] = ramp(x / (size - 1));
      image.data[i + 1] = ramp(y / (size - 1));
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function GlassFilters() {
  // ~1.4kB, and the result never changes, so it is built once per session
  // rather than shipped as an asset.
  const map = React.useMemo(() => buildDisplacementMap(), []);
  if (!map) return null;

  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0" focusable="false">
      <filter
        id="liquid-lens"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        // Displacement is a geometric operation; doing it in linear light
        // shifts the colours as well as the pixels.
        colorInterpolationFilters="sRGB"
      >
        <feImage href={map} preserveAspectRatio="none" result="map" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="12"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      {/* Stronger, for the small surfaces where the rim is most of the pane. */}
      <filter
        id="liquid-lens-tight"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={map} preserveAspectRatio="none" result="map" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="18"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
