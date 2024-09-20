import {
  type PlatformAccessory,
  type Service,
  type PlatformConfig,
  type CharacteristicValue,
  Categories,
} from 'homebridge'
import { exec } from 'child_process'
import fetch from 'node-fetch'

import type { SpeakerPlatform } from './SpeakerPlatform.js'
import { playClassicRadio } from './utils.js'

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
  private tvService!: Service
  private speakerService!: Service
  private state = {
    power: Power.OFF as Power,
    mute: Mute.OFF as Mute,
    volume: 50 as number,
    status: VolumioStatus.STOP as VolumioStatus,
    identifier: 999999, // 999999 is a special value to indicate no input
  }
  private identifiers = new Map<number, Record<string, string>>()
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

      this.accessory.displayName = this.configs.name as string
      this.accessory.category = Categories.TV_SET_TOP_BOX

      this.accessory.context.device = this.configs
      this.platform.api.publishExternalAccessories(
        this.configs.name as string,
        [this.accessory],
      )
    }

    const informationService = this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, FIXED_ID)

    this.tvService =
      this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television)

    this.tvService
      .setCharacteristic(
        this.platform.Characteristic.ConfiguredName,
        this.configs.name as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.Name,
        this.configs.name as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
      )

    this.tvService
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(async (value) => {
        const newState = value ? Power.ON : Power.OFF
        if (newState !== this.state.power) {
          this.state.power = newState
          exec('irsend SEND_ONCE livingroom_amp TOGGLE')
        }
      })
      .onGet(() => this.state.power === Power.ON)

    this.tvService
      .getCharacteristic(this.platform.Characteristic.CurrentMediaState)
      .onGet(() =>
        this.convertVolumioStatusToCharacteristicValue(this.state.status),
      )

    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onSet((value) => {
        const identifier = value as number
        if (this.identifiers.has(identifier)) {
          this.state.identifier = identifier
          const channel = this.identifiers.get(identifier)

          if (channel?.application) {
            if (channel.application === 'Off') {
              this.state.status = VolumioStatus.STOP
              fetch(`${this.VOLUMIO_HOST}/api/v1/commands/?cmd=stop`, {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                },
              })
            } else if (channel.application === '愛樂電台') {
              playClassicRadio(this.VOLUMIO_HOST)
            }
          }
        }
      })
      .onGet(() => this.state.identifier)

    this.tvService
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

    this.speakerService =
      this.accessory.getService(this.platform.Service.TelevisionSpeaker) ||
      this.accessory.addService(this.platform.Service.TelevisionSpeaker)

    this.speakerService
      .setCharacteristic(
        this.platform.Characteristic.ConfiguredName,
        this.configs.name + ' Speaker',
      )
      .setCharacteristic(
        this.platform.Characteristic.Name,
        this.configs.name + ' Speaker',
      )

    this.speakerService
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

    this.speakerService.setCharacteristic(
      this.platform.Characteristic.VolumeControlType,
      this.platform.Characteristic.VolumeControlType.ABSOLUTE,
    )

    this.speakerService
      .getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(async (value) => {
        if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
          this.state.volume += 5
        } else {
          this.state.volume -= 5
        }

        if (this.state.volume > 100) {
          this.state.volume = 100
        } else if (this.state.volume < 0) {
          this.state.volume = 0
        }

        fetch(
          `${this.VOLUMIO_HOST}/api/v1/commands/?cmd=volume&volume=${this.state.volume}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          },
        )
      })

    this.speakerService
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

    this.tvService.addLinkedService(informationService)
    this.tvService.addLinkedService(this.speakerService)

    this.setupApplication('Off')
    this.setupApplication('愛樂電台')

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

        this.state.mute = state.mute ? Mute.ON : Mute.OFF
        this.speakerService.updateCharacteristic(
          this.platform.Characteristic.Mute,
          this.state.mute === Mute.ON,
        )

        this.state.volume = state.volume
        this.speakerService.updateCharacteristic(
          this.platform.Characteristic.Volume,
          this.state.volume,
        )

        this.state.status = state.status
        this.tvService.updateCharacteristic(
          this.platform.Characteristic.CurrentMediaState,
          this.convertVolumioStatusToCharacteristicValue(this.state.status),
        )
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

  setupApplication(application: string) {
    const identifier = this.identifiers.size
    this.identifiers.set(identifier, { application })

    const service = new this.platform.Service.InputSource(
      this.accessory.displayName + application,
      application,
    )
    service.setCharacteristic(
      this.platform.Characteristic.Identifier,
      identifier,
    )
    service.setCharacteristic(
      this.platform.Characteristic.ConfiguredName,
      application,
    )
    service.setCharacteristic(
      this.platform.Characteristic.IsConfigured,
      this.platform.Characteristic.IsConfigured.CONFIGURED,
    )
    service.setCharacteristic(
      this.platform.Characteristic.InputSourceType,
      this.platform.Characteristic.InputSourceType.OTHER,
    )
    service.setCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.platform.Characteristic.CurrentVisibilityState.SHOWN,
    )

    service
      .getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('set', (name, callback) => {
        callback(null, name)
      })

    this.accessory.addService(service)
    this.tvService!.addLinkedService(service)
  }
}
