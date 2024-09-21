export enum Power {
  ON = 'ON',
  OFF = 'OFF',
}

export enum Mute {
  ON = 'ON',
  OFF = 'OFF',
}

export enum VolumioStatus {
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
}

export interface VolumioState {
  mute: boolean
  status: VolumioStatus
  volume: number
  album?: string
  albumart?: string
  artist?: string
  bitdepth?: string
  channels?: number
  consume?: boolean
  disableVolumeControl?: boolean
  duration?: number
  position?: number
  random?: boolean
  repeat?: boolean
  repeatSingle?: boolean
  samplerate?: string
  seek?: number
  service?: string
  stream?: string | boolean
  title?: string
  trackType?: string
  updatedb?: boolean
  uri?: string
  volatile?: boolean
}
