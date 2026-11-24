// Round profile picture; shows the first letter of the name when there is no photo.
export default function StudentAvatar({ name, photoUrl, size = 40, className = '' }) {
  const initial = (name || '?')
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '')
    .trim()
    .charAt(0)
    .toUpperCase()

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Student'}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`rounded-full bg-purple-100 text-purple-700 font-display flex items-center justify-center shrink-0 ${className}`}
    >
      {initial}
    </div>
  )
}