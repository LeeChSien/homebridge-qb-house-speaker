import type {
  PlatformAccessory,
  Service,
  PlatformConfig,
  CharacteristicValue,
} from 'homebridge'
import { exec } from 'child_process'
import fetch from 'node-fetch'

import type { SpeakerPlatform } from './SpeakerPlatform.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'

enum Power {
  ON = 'ON',
  OFF = 'OFF',
}

enum Mute {
  ON = 'ON',
  OFF = 'OFF',
}

enum VolumioStatus {
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
}

interface VolumioState {
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

const FIXED_ID = 'fixed:qb-house:smart-speaker'

export class SpeakerAccessory {
  public accessory!: PlatformAccessory
  private service!: Service
  private state = {
    power: Power.OFF as Power,
    mute: Mute.OFF as Mute,
    volume: 50 as number,
    status: VolumioStatus.STOP as VolumioStatus,
  }
  private VOLUMIO_HOST!: string

  constructor(
    private readonly platform: SpeakerPlatform,
    private readonly configs: PlatformConfig,
  ) {
    // don nothing.
  }

  async init() {
    const uuid = this.platform.api.hap.uuid.generate(FIXED_ID)
    this.VOLUMIO_HOST = this.configs.volumeHost as string

    const existingAccessory = this.platform.accessories.find(
      (accessory) => accessory.UUID === uuid,
    )

    if (existingAccessory) {
      this.accessory = existingAccessory
    } else {
      this.accessory = new this.platform.api.platformAccessory(
        this.configs.name as string,
        uuid,
      )
      this.accessory.context.device = this.configs
      this.platform.api.registerPlatformAccessories(
        PLUGIN_NAME,
        PLATFORM_NAME,
        [this.accessory],
      )
    }

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, FIXED_ID)

    this.service =
      this.accessory.getService(this.platform.Service.Speaker) ||
      this.accessory.addService(this.platform.Service.Speaker)

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.configs.name as string,
    )

    /*
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(async (value) => {
        const newState = value ? Power.ON : Power.OFF
        if (newState !== this.state.power) {
          this.state.power = newState
          exec('irsend SEND_ONCE livingroom_amp TOGGLE')
        }
      })
      .onGet(() => this.state.power === Power.ON)
    */

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentMediaState)
      .onGet(() =>
        this.convertVolumioStatusToCharacteristicValue(this.state.status),
      )

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetMediaState)
      .onSet(async (value) => {
        const newState = this.convertCharacteristicValueToVolumioStatus(value)
        if (newState !== this.state.status) {
          this.state.status = newState
          fetch(`${this.VOLUMIO_HOST}/api/v1/commands/?cmd=${newState}`, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          })
        }
      })
      .onSet(() =>
        this.convertVolumioStatusToCharacteristicValue(this.state.status),
      )

    this.service
      .getCharacteristic(this.platform.Characteristic.Mute)
      .onSet(async (value) => {
        const newState = value ? Mute.ON : Mute.OFF
        if (newState !== this.state.mute) {
          this.state.mute = newState
          exec('irsend SEND_ONCE livingroom_amp MUTE')

          if (this.state.mute === Mute.ON) {
            fetch(
              `${this.VOLUMIO_HOST}/api/v1/commands/?cmd=volume&volume=mute`,
              {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                },
              },
            )
          } else {
            fetch(
              `${this.VOLUMIO_HOST}/api/v1/commands/?cmd=volume&volume=unmute`,
              {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                },
              },
            )
          }
        }
      })
      .onGet(() => this.state.mute === Mute.ON)

    this.service
      .getCharacteristic(this.platform.Characteristic.Volume)
      .onSet(async (value) => {
        this.state.volume = value as number
        fetch(
          `${this.VOLUMIO_HOST}/api/v1/commands/?cmd=volume&volume=${value}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          },
        )
      })
      .onGet(() => this.state.volume)

    this.syncVolumioState()
  }

  syncVolumioState() {
    if (!this.VOLUMIO_HOST) {
      return
    }

    fetch(`${this.VOLUMIO_HOST}/api/v1/getstate`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
      .then((res) => res.json())
      .then((_state) => {
        const state = _state as VolumioState

        this.platform.log.debug('Volumio state:', state)

        this.state.mute = state.mute ? Mute.ON : Mute.OFF
        this.service.updateCharacteristic(
          this.platform.Characteristic.Mute,
          this.state.mute === Mute.ON,
        )

        this.state.volume = state.volume
        this.service.updateCharacteristic(
          this.platform.Characteristic.Volume,
          this.state.volume,
        )

        this.state.status = state.status
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentMediaState,
          this.convertVolumioStatusToCharacteristicValue(this.state.status),
        )

        this.platform.log.debug('Volumio state synced')
        this.platform.log.debug('Homebridge state:', this.state)
      })
      .catch(() => {
        this.platform.log.error('Cannot get volumio state')
      })
  }

  convertVolumioStatusToCharacteristicValue(status: VolumioStatus) {
    switch (status) {
      case VolumioStatus.PLAY:
        return this.platform.Characteristic.CurrentMediaState.PLAY
      case VolumioStatus.PAUSE:
        return this.platform.Characteristic.CurrentMediaState.PAUSE
      case VolumioStatus.STOP:
      default:
        return this.platform.Characteristic.CurrentMediaState.STOP
    }
  }

  convertCharacteristicValueToVolumioStatus(status: CharacteristicValue) {
    switch (status) {
      case this.platform.Characteristic.CurrentMediaState.PLAY:
        return VolumioStatus.PLAY
      case this.platform.Characteristic.CurrentMediaState.PAUSE:
        return VolumioStatus.PAUSE
      case this.platform.Characteristic.CurrentMediaState.STOP:
      default:
        return VolumioStatus.STOP
    }
  }
}
