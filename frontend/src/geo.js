export function getPosition({ timeout = 20000, maximumAge = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported in this browser.'))
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new Error(
        err.code === 1 ? 'Please allow location access (choose Allow in your browser).'
          : err.code === 3 ? 'Getting your location is taking too long. Move to an open area and try again.'
            : 'Unable to get your location. Please turn on GPS/Location.',
      )),
      { enableHighAccuracy: true, timeout, maximumAge },
    )
  })
}