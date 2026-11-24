import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  X,
} from 'lucide-react'
import { getGallery, seedDemoGallery } from '../api.js'

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'event', label: 'College Events' },
  { key: 'workshop', label: 'Workshops' },
  { key: 'sports', label: 'Sports' },
  { key: 'cultural', label: 'Cultural Activities' },
  { key: 'achievement', label: 'Achievement Gallery' },
]

const CHIP = {
  event: { label: 'College Event', cls: 'bg-purple-100 text-purple-700' },
  workshop: { label: 'Workshop', cls: 'bg-blue-100 text-blue-700' },
  sports: { label: 'Sports', cls: 'bg-green-100 text-green-700' },
  cultural: { label: 'Cultural', cls: 'bg-orange-100 text-orange-700' },
  achievement: { label: 'Achievement', cls: 'bg-amber-100 text-amber-700' },
}

const EXT_BY_TYPE = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function photoUrl(id) {
  return `/api/student/gallery/photos/${id}/image`
}

function safeFileName(value) {
  return String(value || 'Gallery')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function downloadPhoto(photo, album, index, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  const response = await fetch(photoUrl(photo.id), { headers })

  if (!response.ok) {
    throw new Error('Could not download the picture.')
  }

  const blob = await response.blob()
  const ext = EXT_BY_TYPE[blob.type] || 'jpg'
  const fileName = `${safeFileName(album.title)}_${index + 1}.${ext}`

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName

  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fmtDate(value) {
  if (!value) return ''

  const [year, month, day] = String(value).split('-').map(Number)

  if (!year || !month || !day) return ''

  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 ${className}`}>
      {children}
    </div>
  )
}

/* Image component with fallback */
function Pic({ id, alt, className = '', token }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [id])

  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-slate-200 text-xs text-slate-500`}
      >
        Image not available
      </div>
    )
  }

  return (
    <img
      src={photoUrl(id)}
      alt={alt || 'Gallery photo'}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

/* Full screen photo viewer */
function Lightbox({
  album,
  index,
  onClose,
  onChange,
  onDownload,
}) {
  const photos = album?.photos || []
  const photo = photos[index]
  const count = photos.length

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()

      if (event.key === 'ArrowRight' && count > 1) {
        onChange((index + 1) % count)
      }

      if (event.key === 'ArrowLeft' && count > 1) {
        onChange((index - 1 + count) % count)
      }
    }

    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [index, count, onClose, onChange])

  if (!photo) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm">
          {album.title} · {index + 1} / {count}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDownload(index)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-white/10"
          >
            <Download size={16} />
            Download
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main image */}
      <div className="flex min-h-0 flex-1 items-center gap-2 px-3">
        {count > 1 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onChange((index - 1 + count) % count)
            }}
            aria-label="Previous photo"
            className="shrink-0 rounded-full p-2 text-white hover:bg-white/10"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          <img
            src={photoUrl(photo.id)}
            alt={photo.caption || album.title}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>

        {count > 1 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onChange((index + 1) % count)
            }}
            aria-label="Next photo"
            className="shrink-0 rounded-full p-2 text-white hover:bg-white/10"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Caption */}
      <p
        className="min-h-[3.5rem] px-5 py-4 text-center text-sm text-white/90"
        onClick={(event) => event.stopPropagation()}
      >
        {photo.caption || ''}
      </p>
    </div>
  )
}

export default function StudentGalleryPage({ session, onBack }) {
  const token = session?.access_token

  const [data, setData] = useState(null)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [albumId, setAlbumId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')

  /* Load gallery data */
  async function load() {
    if (!token) {
      throw new Error('Please log in again.')
    }

    const result = await getGallery(token)
    setData(result || { albums: [] })
  }

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')

    load()
      .catch((err) => {
        if (active) {
          setError(err?.message || 'Unable to load gallery.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [token])

  /* Download photo */
  async function handleDownload(photo, album, index) {
    setError('')

    try {
      await downloadPhoto(photo, album, index, token)
    } catch (err) {
      setError(err?.message || 'Unable to download photo.')
    }
  }

  /* Load demo gallery */
  async function handleSeed() {
    setSeeding(true)
    setError('')

    try {
      await seedDemoGallery(token)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to load sample gallery.')
    } finally {
      setSeeding(false)
    }
  }

  const albums = Array.isArray(data?.albums) ? data.albums : []
  const hasData = albums.length > 0

  const countFor = (key) =>
    key === 'all'
      ? albums.length
      : albums.filter((album) => album.category === key).length

  const q = search.trim().toLowerCase()

  const visible = albums.filter((album) => {
    const title = String(album.title || '').toLowerCase()
    const description = String(album.description || '').toLowerCase()

    return (
      (tab === 'all' || album.category === tab) &&
      (!q || title.includes(q) || description.includes(q))
    )
  })

  const openAlbum = albumId
    ? albums.find((album) => album.id === albumId)
    : null

  const handleLightboxChange = (nextIndex) => {
    setLightbox(nextIndex)
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="ml-2 text-lg font-semibold text-slate-900">
          Gallery
        </h1>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">

        {loading && (
          <p className="text-slate-400">
            Loading gallery…
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Empty Gallery */}
        {!loading && data && !hasData && (
          <Card className="p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              The gallery is empty
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Photos of college events, workshops, sports,
              cultural activities and achievements will appear
              here once they are uploaded. Until then you can
              load sample albums to try this screen.
            </p>

            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-md bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {seeding ? 'Loading…' : 'Load sample data'}
            </button>
          </Card>
        )}

        {/* Selected Album */}
        {hasData && openAlbum && (
          <>
            <button
              type="button"
              onClick={() => {
                setAlbumId(null)
                setLightbox(null)
              }}
              className="flex items-center gap-1.5 text-sm text-purple-700 hover:text-purple-900"
            >
              <ArrowLeft size={14} />
              All albums
            </button>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-900">
                  {openAlbum.title}
                </h2>

                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    CHIP[openAlbum.category]?.cls || ''
                  }`}
                >
                  {CHIP[openAlbum.category]?.label ||
                    openAlbum.category}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                {fmtDate(openAlbum.event_date)}
                {openAlbum.event_date ? ' · ' : ''}
                {openAlbum.photos?.length || 0}{' '}
                {(openAlbum.photos?.length || 0) === 1
                  ? 'photo'
                  : 'photos'}
              </p>

              {openAlbum.description && (
                <p className="mt-2 max-w-2xl text-sm text-slate-700">
                  {openAlbum.description}
                </p>
              )}
            </div>

            {(!openAlbum.photos || openAlbum.photos.length === 0) && (
              <Card className="text-center">
                <p className="text-sm text-slate-500">
                  There are no photos in this album yet.
                </p>
              </Card>
            )}

            {/* Album Photos */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(openAlbum.photos || []).map((photo, index) => (
                <div
                  key={photo.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                >
                  <button
                    type="button"
                    onClick={() => setLightbox(index)}
                    aria-label={`Open photo ${index + 1}`}
                    className="absolute inset-0 h-full w-full"
                  >
                    <Pic
                      id={photo.id}
                      alt={photo.caption || openAlbum.title}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDownload(photo, openAlbum, index)
                    }
                    aria-label="Download this photo"
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-slate-700 shadow transition-opacity hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  >
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Lightbox */}
            {lightbox !== null && (
              <Lightbox
                album={openAlbum}
                index={lightbox}
                onClose={() => setLightbox(null)}
                onChange={handleLightboxChange}
                onDownload={(index) =>
                  handleDownload(
                    openAlbum.photos[index],
                    openAlbum,
                    index
                  )
                }
              />
            )}
          </>
        )}

        {/* All Albums */}
        {hasData && !openAlbum && (
          <>
            {/* Categories */}
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setTab(category.key)}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm ${
                    tab === category.key
                      ? 'border-purple-600 font-medium text-purple-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {category.label}

                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">
                    {countFor(category.key)}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search albums"
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* No Search Results */}
            {visible.length === 0 && (
              <Card className="text-center">
                <p className="text-sm text-slate-500">
                  {q
                    ? 'No albums match your search.'
                    : 'There are no albums in this section yet.'}
                </p>
              </Card>
            )}

            {/* Album Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((album) => {
                const chip = CHIP[album.category]
                const photos = Array.isArray(album.photos)
                  ? album.photos
                  : []

                return (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => setAlbumId(album.id)}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                      {photos.length > 0 ? (
                        <Pic
                          id={photos[0].id}
                          alt={album.title}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                          No photos yet
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                          chip?.cls || ''
                        }`}
                      >
                        {chip?.label || album.category}
                      </span>

                      <p className="mt-2 text-base font-semibold leading-snug text-slate-900">
                        {album.title}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {fmtDate(album.event_date)}
                        {album.event_date ? ' · ' : ''}
                        {photos.length}{' '}
                        {photos.length === 1 ? 'photo' : 'photos'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}