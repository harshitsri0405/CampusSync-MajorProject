export function getPosition({ timeout = 20000, maximumAge = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Is browser me location support nahi hai.'))
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new Error(
        err.code === 1 ? 'Location ki permission do (browser me "Allow" dabao).'
          : err.code === 3 ? 'Location milne me der ho rahi hai. Khuli jagah par jaakar dobara try karo.'
            : 'Location nahi mil paayi. GPS/Location on karo.',
      )),
      { enableHighAccuracy: true, timeout, maximumAge },
    )
  })
}