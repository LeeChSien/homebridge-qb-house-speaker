# homebridge-qb-house-speaker

## Prerequisite

1. Install LIRC on your device ([ref](https://devkimchi.com/2020/08/12/turning-raspberry-pi-into-remote-controller/))
2. Copy lirc configs from `./lirc` to `/etc/lirc/lircd.conf.d/`

## Usage

```js
"platforms": [
  {
    "platform": "QBHouseSpeaker",
    "name": "QB House Speaker",
    "host": "192.168.11.48"
  }
]
```
