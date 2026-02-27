import { createContext, useContext } from 'react'

export const HideAvatarsContext = createContext(false)

export function useHideAvatars(): boolean {
  return useContext(HideAvatarsContext)
}
