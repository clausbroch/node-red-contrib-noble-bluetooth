const noble = require('@abandonware/noble');
const async = require('async');

"use strict";

module.exports = function(RED) {
    function BLEScannerNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node._continuous = false;

        noble.on('stateChange', function(state) {
          node.log("BLE state: " + state);
          // possible state values: "unknown", "resetting", "unsupported", "unauthorized", "poweredOff", "poweredOn"

          // ...
        });
        
        function scanStarted() {
            node.status({ fill: "green", shape: "ring", text: "scanning" });
        }

        function scanStopped() {
            node.status({});
        }

        noble.on('discover', function(peripheral) {
                 const advertisement = peripheral.advertisement;
                 const localName = advertisement.localName;
                 const txPowerLevel = advertisement.txPowerLevel;
                 const manufacturerData = advertisement.manufacturerData;
                 const serviceData = advertisement.serviceData;
                 const serviceUuids = advertisement.serviceUuids;
                 var msg = { };
                 msg.peripheral = peripheral.id;
                 msg.address = peripheral.address;
                 msg.rssi = peripheral.rssi;
                 if(typeof peripheral.connectable !== 'undefined') {
                    msg.connectable = peripheral.connectable;
                 }
                 if(localName) {
                    msg.name = localName;
                 }
                 if(txPowerLevel) {
                    msg.txPowerLevel = txPowerLevel;
                 }
                 if(manufacturerData) {
                    msg.manufacturerData = manufacturerData;
                 }
                 if(serviceUuids) {
                    msg.services = serviceUuids;
                 }
                 if(node._continuous == false) {
                    noble.stopScanning();
                 }
                 node.send(msg);
        });
        
        node.on('input', function(msg) {
            noble.removeListener('scanStart', scanStarted);
            noble.removeListener('scanStop', scanStopped);
            noble.once('scanStart', scanStarted);
            noble.once('scanStop', scanStopped);
                
            if(msg.topic === "start") {
                clearTimeout(node._timeoutFunc);
                var serviceUuids = [];
                if(msg.services) {
                    serviceUuids = msg.services;
                }
                node._continuous = false;
                if(msg.continuous) {
                    node._continuous = msg.continuous == true;
                }
                noble.startScanning(serviceUuids, false, function(error) {
                    if (error) {
                        node.error("Error scanning for devices: " + error);
                        node.status({ fill: "red", shape: "dot", text: "error" });
                    }
                });
                
                if(msg.timeout && msg.timeout > 0) {
                    node._timeoutFunc = setTimeout(function() {
                        noble.stopScanning();
                    }, msg.timeout);
                }
            }
            else if(msg.topic === "stop"){
                clearTimeout(node._timeoutFunc);
                noble.stopScanning();
            }
                
            //msg.payload = msg.payload.toLowerCase();
            //node.send(msg);
        });

        node.on('close', function(done) {
            noble.removeListener('scanStart', scanStarted);
            noble.removeListener('scanStop', scanStopped);
            noble.stopScanning();
            done();
        });

    }
    RED.nodes.registerType("BLE scanner",BLEScannerNode);

    function BLEDeviceNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        
        function deviceDisconnected() {
            node.status({});
            var msg = {}
            msg.connected = false;
            msg.connectable = node._peripheral.connectable;
            msg.peripheral = node._peripheral.id;
            msg.address = node._peripheral.address;
            msg.topic = "disconnected";
            node.send(msg);
        }
        
        node.on('input', function(msg) {
            if (!msg.peripheral) {
                node.status({ fill: "red", shape: "dot", text: "invalid peripheral id" });
                return;
            }
            if(node._peripheral) {
                node._peripheral.removeListener('disconnect', deviceDisconnected);
            }
            node._peripheral = noble._peripherals[msg.peripheral];
            var peripheral = node._peripheral;
            peripheral.connect(function(error) {
                if (error) {
                   node.error("Error connecting: " + error);
                   node.status({ fill: "red", shape: "dot", text: "error connecting" });
                   return;
                }
                
                msg.connected = true;
                msg.connectable = peripheral.connectable;
                msg.rssi = peripheral.rssi;

                node.on('close', function(done) {
                    peripheral.disconnect();
                    done();
                });
                peripheral.once('disconnect', deviceDisconnected);
                               
                node.status({ fill: "green", shape: "dot", text: "connecting" });

                peripheral.discoverAllServicesAndCharacteristics(function(error, services, characteristics) {
                    if (error) {
                       node.error("Error discovering services: " + error);
                       node.status({ fill: "red", shape: "dot", text: "error finding services" });
                       return;
                    }
                    var serviceUuids = [];
                    services.forEach(function(value, index, array) {
                        serviceUuids.push(value.uuid);
                    });
                    msg.services = serviceUuids;
                    var characteristicUuids = [];
                    characteristics.forEach(function(value, index, array) {
                        characteristicUuids.push(value.uuid);
                    });
                    msg.characteristics = characteristicUuids;
                    msg.topic = "connected";
                    node.status({ fill: "green", shape: "dot", text: "connected" });
                    node.send(msg);
               });

            });

        });
 
        node.on('close', function(done) {
            done();
        });
    }
    RED.nodes.registerType("BLE device",BLEDeviceNode);
}
