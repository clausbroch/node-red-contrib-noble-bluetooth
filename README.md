# node-red-contrib-noble-bluetooth

A Node-RED module based on noble for interaction with Bluetooth Low Energy (BLE) devices.

## Installation

```
npm install node-red-contrib-noble-bluetooth
```

## Prerequisite

Requires [@abandonware/noble](https://www.npmjs.com/package/@abandonware/noble) module for bluetooth communication

## Quick Start

Create a **BLE scanner** node and hook its input up to an inject node. Send a message with `topic` "start" to start scanning for devices. By befault it will search for any device. Can be configured to only search for devices publishing certaing servies by providing an array of UUID's.

Connect the output to a **BLE device** node to connect to the found device. This will establish a connection to the device and discover all published services and characteristics.

Use a **BLE in** node to read from the device or a **BLE out** note to write to it.

More details about parameters and usage in each node's info panel.

## License
Licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

