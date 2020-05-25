const noble = require('@abandonware/noble');
//const async = require('async');

"use strict";

module.exports = function(RED) {
    
    //
    // BLE scanner node
    //
    function BLEScannerNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.config = config;
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
                var services = RED.util.evaluateNodeProperty(node.config.services, node.config.servicesType, node);
                if(services) {
                    serviceUuids = services;
                }
                else if(msg.services) {
                    serviceUuids = msg.services;
                }
                if(typeof serviceUuids === "string") {
                    serviceUuids = [serviceUuids];
                }

                node._continuous = node.config.continuous;
                if(!node._continuous && msg.continuous) {
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

    //
    // BLE device node
    //
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
            //node._services = null;
            //node._characteristics = null;
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

                    var services_ = [];
                    //node._services = services;
                    services.forEach(function(value, index, array) {
                        var service_ = {};
                        service_.uuid = value.uuid;
                        service_.name = value.name;
                        service_.type = value.type;
                        var serviceChars_ = [];
                        value.characteristics.forEach(function(value_, index_, array_) {
                            var serviceChar_ = {};
                            serviceChar_.uuid = value_.uuid;
                            serviceChar_.serviceUuid = service_.uuid;
                            serviceChar_.name = value_.name;
                            serviceChar_.type = value_.type;
                            serviceChar_.properties = value_.properties;
                            serviceChars_.push(serviceChar_);
                        });
                        service_.characteristics = serviceChars_;
                        services_.push(service_);
                    });
                    msg.services = services_;
                                                                 
                    var characteristics_ = [];
                    //node._characteristics = characteristics;
                    characteristics.forEach(function(value, index, array) {
                        var characteristic_ = {};
                        characteristic_.uuid = value.uuid;
                        characteristic_.serviceUuid = value._serviceUuid;
                        characteristic_.name = value.name;
                        characteristic_.type = value.type;
                        characteristic_.properties = value.properties;
                        characteristics_.push(characteristic_);
                    });
                    msg.characteristics = characteristics_;
                    msg.topic = "connected";
                    msg._peripheral = peripheral;
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
    
    function FindServiceUUID(node, peripheral, characteristicUuid) {
        var service_ = peripheral.services.find(function(service, index, array) {
            var char_ = service.characteristics.find(function(characteristic, index, array) {
                return characteristic.uuid == characteristicUuid;
            });
            return typeof char_ != 'undefined';
        });
        if(typeof service_ != 'undefined') {
            return service_.uuid;
        }
        return "";
    }
    
    //
    // BLE in node
    //
    function BLEInNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.config = config;

        function deviceDisconnected() {
            node.status({});
        }

        node.on('input', function(msg) {
            if (!msg.peripheral) {
                node.error("Invalid peripheral id");
                node.status({ fill: "red", shape: "dot", text: "invalid peripheral id" });
                return;
            }
            var peripheral = noble._peripherals[msg.peripheral];
                
            if(!peripheral) {
                node.error("Unknown peripheral");
                node.status({ fill: "red", shape: "dot", text: "unknown peripheral" });
                return;
            }
            
            var characteristicUuid = node.config.characteristic;
            if(!characteristicUuid && msg.characteristic) {
                characteristicUuid = msg.characteristic;
            }
            if(!characteristicUuid) {
                node.error("Missing characteristic UUID");
                node.status({ fill: "red", shape: "dot", text: "missing characteristic UUID" });
                return;
            }
                
            var serviceUuid = FindServiceUUID(node, peripheral, characteristicUuid);
            if(!serviceUuid) {
                node.error("Service not found for characteristic " + characteristicUuid);
                node.status({ fill: "red", shape: "dot", text: "service not found" });
                return;
            }

            var characteristic = noble._characteristics[peripheral.id][serviceUuid][characteristicUuid];
            if(!characteristic) {
                node.error("Invalid characteristic");
                node.status({ fill: "red", shape: "dot", text: "invalid characteristic" });
                return;
            }

            peripheral.once('disconnect', function () {
                node.status({});
            });

            var topic = node.config.topic;
            if(!topic && msg.topic) {
                topic = msg.topic;
            }
            if(topic === "subscribe") {
                characteristic.on('data', function(data, isNotification) {
                    var msg_ = {};
                    msg_.characteristic = characteristic.uuid;
                    msg_.payload = data;
                    node.send(msg_);
                });
                characteristic.subscribe(function(error) {
                    if (error) {
                       node.error("Error subscribing to characteristic: " + error);
                       node.status({ fill: "red", shape: "dot", text: "error subscribing" });
                       return;
                    }
                    node.status({ fill: "green", shape: "dot", text: "subscribed" });
                });
            }
            else if(topic === "unsubscribe") {
                characteristic.unsubscribe(function(error) {
                    if (error) {
                        node.error("Error unsubscribing from characteristic: " + error);
                        return;
                    }
                    node.status({});
                });
            }
            else if(!topic || topic === "read") {
                characteristic.read(function(error, data) {
                    if (error) {
                       node.error("Error reading from characteristic: " + error);
                       return;
                    }
                    var msg_ = {};
                    msg_.characteristic = characteristic.uuid;
                    msg_.payload = data;
                    node.send(msg_);
                });
            }
            else {
                node.error("Invalid topic: " + topic);
                return;
            }
        });
    }
    RED.nodes.registerType("BLE in",BLEInNode);

    //
    // BLE out node
    //
    function BLEOutNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.config = config;

        node.on('input', function(msg) {
            if (!msg.peripheral) {
                node.error("Invalid peripheral id");
                node.status({ fill: "red", shape: "dot", text: "invalid peripheral id" });
                return;
            }
            var peripheral = noble._peripherals[msg.peripheral];
                
            if(!peripheral) {
                node.error("Unknown peripheral");
                node.status({ fill: "red", shape: "dot", text: "unknown peripheral" });
                return;
            }
            
            var characteristicUuid = node.config.characteristic;
            if(!characteristicUuid && msg.characteristic) {
                characteristicUuid = msg.characteristic;
            }
            if(!characteristicUuid) {
                node.error("Missing characteristic UUID");
                node.status({ fill: "red", shape: "dot", text: "missing characteristic UUID" });
                return;
            }
                
            var serviceUuid = FindServiceUUID(node, peripheral, characteristicUuid);
            if(!serviceUuid) {
                node.error("Service not found for characteristic " + characteristicUuid);
                node.status({ fill: "red", shape: "dot", text: "service not found" });
                return;
            }

            var characteristic = noble._characteristics[peripheral.id][serviceUuid][characteristicUuid];
            if(!characteristic) {
                node.error("Invalid characteristic");
                node.status({ fill: "red", shape: "dot", text: "invalid characteristic" });
                return;
            }

            var data = msg.payload;
            if(!data) {
                node.error("Missing payload");
                node.status({ fill: "red", shape: "dot", text: "missing payload" });
                return;
            }
            if(typeof data === "string") {
                data = Buffer.from(data);
            }
            if(Buffer.isBuffer(data) === false) {
                node.error("Invalid payload type. Must be string or buffer object");
                node.status({ fill: "red", shape: "dot", text: "invalid payload" });
                return;
            }

            // true if for write without response
            characteristic.write(data, true, function(error) {
                if (error) {
                    node.error("Error writing to characteristic: " + error);
                    node.status({ fill: "red", shape: "dot", text: "error writing" });
                    return;
                }
                node.status({});
            });
        });
    }
    RED.nodes.registerType("BLE out",BLEOutNode);

}

