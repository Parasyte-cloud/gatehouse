import logoUrl from '../assets/parasyte-logo.png'

// The real PArAsYtE logo, provided by the user (src/assets/parasyte-logo.png,
// downscaled to 256x256 from the original upload to keep the bundle light).
// Rendered through this one component so every place the brand mark shows up
// (auth screen, browser chrome, home hero) stays in sync if the asset is
// ever swapped for a refreshed export.
export default function ParasyteMark({ size = 20 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      alt="PArAsYtE"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}
