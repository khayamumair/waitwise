import { useCallback, useEffect, useRef, useState } from "react"
import { getGpuStatus } from "../lib/api"
import type { GpuStatus } from "../lib/types"

/** Polls GET /gpu on an interval (default 2s) and exposes the latest snapshot. */
export function useGpuStatus(intervalMs = 2000) {
  const [status, setStatus] = useState<GpuStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const mounted = useRef(true)

  const poll = useCallback(async () => {
    try {
      const data = await getGpuStatus()
      if (!mounted.current) return
      setStatus(data)
      setError(false)
    } catch {
      if (!mounted.current) return
      setError(true)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    poll()
    const id = window.setInterval(poll, intervalMs)
    return () => {
      mounted.current = false
      window.clearInterval(id)
    }
  }, [poll, intervalMs])

  return { status, loading, error }
}
