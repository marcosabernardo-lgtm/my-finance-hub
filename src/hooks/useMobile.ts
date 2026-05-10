import { useState, useEffect } from 'react'

export function useMobile() {
  const getIsMobile = () => {
    const width = window.innerWidth
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    return width <= 1024 || (isTouch && width <= 1180)
  }

  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const update = () => setIsMobile(getIsMobile())
    const mq = window.matchMedia('(pointer: coarse)')

    update()
    window.addEventListener('resize', update)
    mq.addEventListener('change', update)

    return () => {
      window.removeEventListener('resize', update)
      mq.removeEventListener('change', update)
    }
  }, [])

  return isMobile
}
