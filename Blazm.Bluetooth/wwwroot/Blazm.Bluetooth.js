var PairedBluetoothDevices = [];
export async function requestDevice(query) {
    var objquery = JSON.parse(query);
    console.log(query);

    var device = await navigator.bluetooth.requestDevice(objquery);
    await device.gatt.connect();
    device.addEventListener('gattserverdisconnected', onDisconnected);
    PairedBluetoothDevices.push(device);
    console.log('> Device connected');
    return { "Name": device.name, "Id": device.id };
}

export async function disconnectDevice(name) {
    try {
        var devices = PairedBluetoothDevices.filter(function (item) {
            return item.name == name;
        });

        if ((!devices) || (devices.length == 0)) {
            console.log('> Bluetooth Device not found');
            return;
        }

        //remove device from list (un -request) so it does not try to reconnect
        PairedBluetoothDevices = PairedBluetoothDevices.filter(function (dev) {
            return dev != devices[0];
        });

        console.log('> Disconnecting from Bluetooth Device...');
        if (devices[0].gatt.connected) {
            devices[0].gatt.disconnect();
        } else {
            console.log('> Bluetooth Device is already disconnected');
        }

    } catch (error) {
        console.log(error);
    }
}


export async function onDisconnected(arg) {
    try {
        console.log(arg.srcElement);
        console.log('> Bluetooth Device disconnected');
        // check if the device is still in the list of paired device
        var device = getDevice(arg.srcElement.id);

        if (!device) {
            console.log('> Bluetooth Device not in the list, do not reconnect');
            return;
        }
        connect(arg.srcElement);
    }
    catch (error) {
        console.log(error);
    }
}

function connect(bluetoothDevice) {
    exponentialBackoff(1 /* max retries */, 500 /* mseconds delay */,
        function toTry() {
            time('> Connecting to Bluetooth Device... ');
            return bluetoothDevice.gatt.connect();
        },
        async function success() {
            console.log('> Bluetooth Device connected.');
            await bluetoothDevice.NotificationConnectedHandler.invokeMethodAsync('HandleConnected');
        },
        async function fail() {
            time('> Failed to reconnect.');
            await bluetoothDevice.NotificationDisconnectedHandler.invokeMethodAsync('HandleDisconnected');
            //remove the device from the list
            PairedBluetoothDevices = PairedBluetoothDevices.filter(function (dev) {
                return dev != bluetoothDevice;
            });
        });
}

function exponentialBackoff(max, delay, toTry, success, fail) {
    toTry().then(result => success(result))
        .catch(_ => {
            if (max === 0) {
                return fail();
            }
            time('> Retrying in ' + delay + 'ms... (' + max + ' tries left)');
            setTimeout(function () {
                exponentialBackoff(--max, delay * 2, toTry, success, fail);
            }, delay );
        });
}

function time(text) {
    console.log('[' + new Date().toJSON().substr(11, 8) + '] ' + text);
}

function getDevice(deviceId) {
    var device = PairedBluetoothDevices.filter(function (item) {
        return item.id == deviceId;
    });
    return device[0];
}

export async function writeValue(deviceId, serviceId, characteristicId, value) {
    var device = getDevice(deviceId);
    //console.log("Found device" + device);
    if (device.gatt.connected) {
        var service = await device.gatt.getPrimaryService(serviceId);
        var characteristic = await service.getCharacteristic(characteristicId);
        var b = Uint8Array.from(value);
        await characteristic.writeValue(b);
        time("> Tx " + b.length + " bytes");
    }
    else {
        await sleep(1000);
        await writeValue(deviceId, serviceId, characteristicId, value);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function readValue(deviceId, serviceId, characteristicId) {
    var device = getDevice(deviceId);

    var service = await device.gatt.getPrimaryService(serviceId);
    var characteristic = await service.getCharacteristic(characteristicId);

    var value = await characteristic.readValue();
    var uint8Array = new Uint8Array(value.buffer);
    var array = Array.from(uint8Array);
    return array;
}

var NotificationHandler = [];

export async function setupNotify(deviceId, serviceId, characteristicId, notificationHandler) {
    console.log("> Setting up Notify handler");
    var device = getDevice(deviceId);
    device.NotificationHandler = notificationHandler;
    var service = await device.gatt.getPrimaryService(serviceId);
    var characteristic = await service.getCharacteristic(characteristicId);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
    console.log("> Characteristics listening success");
}

async function handleCharacteristicValueChanged(event) {

    var value = event.target.value;
    var deviceId = event.target.service.device.id;
    var uint8Array = new Uint8Array(value.buffer);
    time("> RX:" + uint8Array.length + " bytes");
    var device = getDevice(deviceId);
    await device.NotificationHandler.invokeMethodAsync('HandleCharacteristicValueChanged', event.target.service.uuid, event.target.uuid, uint8Array);
}

var NotificationDisconnectedHandler = [];

export async function setupDisconnected(deviceId, notificationHandler) {
    console.log("> Setting up disconnected handler");
    var device = getDevice(deviceId);
    device.NotificationDisconnectedHandler = notificationHandler;
}

var NotificationConnectedHandler = [];

export async function setupConnected(deviceId, notificationHandler) {
    console.log("> Setting up connected handler");
    var device = getDevice(deviceId);
    device.NotificationConnectedHandler = notificationHandler;
}



