'use strict';

let AWS = require('aws-sdk');
let http = require('https');
let ht = require('http');

let host = 'api.particle.io';
let version = '/v1';
let allowedModuleType = [1, 6, 20];
let dimmableDeviceTypes = [6, 7, 8, 9, 10, 43];
let rangeControlledDeviceTypes = [];
let lockableDeviceTypes = [];
let displayCategories = { 1: "SWITCH", 18: "SWITCH", 43: "THERMOSTAT", 44: "SWITCH", 21: "SWITCH", 22: "SWITCH", 24: "SWITCH", 25: "SWITCH", 2: "LIGHT", 3: "LIGHT", 4: "LIGHT", 7: "LIGHT", 8: "LIGHT", 9: "LIGHT", 17: "SWITCH", 19: "SMARTPLUG", 23: "TV", 6: "SWITCH" };
let uuid = require('uuid');

AWS.config.update({ region: 'eu-west-1' });

let AlexaResponse = require("./alexa/skills/smarthome/AlexaResponse");


exports.handler = async function (event, context, callback) {




    // Dump the request for logging - check the CloudWatch logs
    console.log("----- Event -----");
    console.log(JSON.stringify(event));



    // Validate we have an Alexa directive
    if (!('directive' in event)) {
        let aer = new AlexaResponse(
            {
                "name": "ErrorResponse",
                "payload": {
                    "type": "INVALID_DIRECTIVE",
                    "message": "Missing key: directive, Is request a valid Alexa directive?"
                }
            });
        return sendResponse(aer.get());
    }

    // Check the payload version
    if (event.directive.header.payloadVersion !== "3") {
        let aer = new AlexaResponse(
            {
                "name": "ErrorResponse",
                "payload": {
                    "type": "INTERNAL_ERROR",
                    "message": "This skill only supports Smart Home API version 3"
                }
            });
        return sendResponse(aer.get());
    }

    let namespace = ((event.directive || {}).header || {}).namespace;

    if (namespace.toLowerCase() === 'alexa.authorization') {
        let aar = new AlexaResponse({ "namespace": "Alexa.Authorization", "name": "AcceptGrant.Response", });
        return sendResponse(aar.get());
    }

    if (namespace.toLowerCase() === 'alexa.discovery') {
        return alexaDiscovery(event);
    }

    if (namespace.toLowerCase() === 'alexa.scenecontroller') {
        let endpoint_id = event.directive.endpoint.endpointId;
        let token = event.directive.endpoint.scope.token;
        let correlationToken = event.directive.header.correlationToken;


        let device = endpoint_id.split("-");
        var arg = event.directive.endpoint.cookie.arg;


        let asm = {
            "context": {
                "properties": [
                    {
                        "namespace": "Alexa.EndpointHealth",
                        "name": "connectivity",
                        "value": {
                            "value": "OK"
                        },
                        "timeOfSample": new Date().toISOString(),
                        "uncertaintyInMilliseconds": 200
                    }
                ]
            },
            "event": {
                "header": {
                    "namespace": "Alexa.SceneController",
                    "name": "ActivationStarted",
                    "payloadVersion": "3",
                    "messageId": uuid(),
                    "correlationToken": correlationToken
                },
                "endpoint": {
                    "scope": {
                        "type": "BearerToken",
                        "token": token
                    },
                    "endpointId": endpoint_id
                },
                "payload": {
                    "cause": {
                        "type": "VOICE_INTERACTION"
                    },
                    "timestamp": new Date().toISOString()
                }
            }
        }


        return callSceneFunction(device[0], token, arg, asm);



    }

    if (namespace.toLowerCase() === 'alexa.powercontroller') {
        let power_state_value = "OFF";
        let power = '0!';
        if (event.directive.header.name === "TurnOn") {
            power_state_value = "ON";
            power = '255!';
        }

        let endpoint_id = event.directive.endpoint.endpointId;
        let token = event.directive.endpoint.scope.token;
        let correlationToken = event.directive.header.correlationToken;


        let ar = new AlexaResponse(
            {
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpoint_id
            }
        );
        ar.addContextProperty({ "namespace": "Alexa.PowerController", "name": "powerState", "value": power_state_value });

        let device = endpoint_id.split("-");

        var arg = 'ctrl/' + device[1] + "*" + device[2] + "@" + device[3] + "," + power;
        return callParticleFunction(device[0], token, arg, ar, true);



    }

    if (namespace.toLowerCase() === 'alexa.lockcontroller') {
        let power_state_value = "UNLOCKED";
        let power = '255!';
        if (event.directive.header.name === "Lock") {
            power_state_value = "LOCKED";
            power = '0!';
        }

        let endpoint_id = event.directive.endpoint.endpointId;
        let token = event.directive.endpoint.scope.token;
        let correlationToken = event.directive.header.correlationToken;


        let ar = new AlexaResponse(
            {
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpoint_id
            }
        );
        ar.addContextProperty({ "namespace": "Alexa.LockController", "name": "lockState", "value": power_state_value });

        let device = endpoint_id.split("-");

        var arg = 'ctrl/' + device[1] + "*" + device[2] + "@" + device[3] + "," + power;
        return callParticleFunction(device[0], token, arg, ar, true);



    }


    if (namespace.toLowerCase() === 'alexa.brightnesscontroller') {


        let endpoint_id = event.directive.endpoint.endpointId;
        let token = event.directive.endpoint.scope.token;
        let correlationToken = event.directive.header.correlationToken;
        let brightness = 40;

        let ar = new AlexaResponse(
            {
                "correlationToken": correlationToken,
                "token": token,
                "endpointId": endpoint_id
            }
        );
        ar.addContextProperty({ "namespace": "Alexa.BrightnessController", "name": "brightness", "value": brightness });

        let device = endpoint_id.split("-");

        if ('brightness' in event.directive.payload) {
            brightness = Math.ceil((parseInt(event.directive.payload.brightness) * 255) / 100);
            let arg = 'ctrl/' + device[1] + "*" + device[2] + "@" + device[3] + "," + brightness + "!";
            console.log("ARG : " + arg);

            return callParticleFunction(device[0], token, arg, ar, true);
        } else {
            let arg = 'stat/' + device[1] + '*' + device[2] + '@' + device[3] + ',-255!'
            let brightnessDelta = event.directive.payload.brightnessDelta;
            return getCurrentState(device[0], device[1], device[2], device[3], brightnessDelta, token, arg, ar);
        }





    }


};

function sendResponse(response) {
    console.log("index.handler response -----");
    console.log(JSON.stringify(response));
    return response
}



function alexaDiscovery(event) {
    return new Promise((resolve, reject) => {
        const options = {
            host: host,
            path: version + '/devices/?access_token=' + event.directive.payload.scope.token,
            port: 443,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {

                resolve(findDevices(body));
            });



        });

        req.on('error', (e) => {
            reject(e.message);
        });

        // send the request
        req.write('');
        req.end();
    });
}

function findDevices(gateways) {

    if (JSON.parse(gateways).length <= 1)
        return findDevicesFromDynamo(JSON.parse(gateways)[0]['id']);

    const options = {
        host: "nuos.in",
        path: '/find-devices.php',
        port: 443,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };
    return new Promise((resolve, reject) => {

        const req = http.request(options, (res) => {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {



                let items = JSON.parse(body);

                let adr = new AlexaResponse({ "namespace": "Alexa.Discovery", "name": "Discover.Response" });
                let capability_alexa = adr.createPayloadEndpointCapability();
                let capability_alexa_powercontroller = adr.createPayloadEndpointCapability({ "interface": "Alexa.PowerController", "supported": [{ "name": "powerState" }] });
                let capability_alexa_brightnesscontroller = adr.createPayloadEndpointCapability({ "interface": "Alexa.BrightnessController", "supported": [{ "name": "brightness" }] });
                let capability_alexa_scenecontroller = { "type": "AlexaInterface", "interface": "Alexa.SceneController", "version": "3", "supportsDeactivation": false };
                let capability_alexa_lockcontroller = { "type": "AlexaInterface", "interface": "Alexa.LockController", "version": "3", "properties": { "supported": [{ "name": "lockState" }], "proactivelyReported": true, "retrievable": true } };

                let capabilities = [capability_alexa, capability_alexa_powercontroller];

                let d = items.d;
                let s = items.s;
                if (d) {
                    for (var j = 0; j < d.length; j++) {


                        if (dimmableDeviceTypes.indexOf(d[j].type) >= 0)
                            var caps = capabilities.concat([capability_alexa_brightnesscontroller]);
                        else if (lockableDeviceTypes.indexOf(d[j].type) >= 0)
                            var caps = [capability_alexa, capability_alexa_lockcontroller];
                        else if (rangeControlledDeviceTypes.indexOf(d[j].type) >= 0)
                            caps = [{ "type": "AlexaInterface", "interface": "Alexa", "version": "3" }, { "type": "AlexaInterface", "interface": "Alexa.RangeController", "version": "3", "instance": "TowerFan" + d[j]['id'] + ".Speed", "capabilityResources": { "friendlyNames": [{ "@type": "asset", "value": { "assetId": "Alexa.Setting.FanSpeed" } }] }, "properties": { "supported": [{ "name": "rangeValue" }], "proactivelyReported": true, "retrievable": true }, "configuration": { "supportedRange": { "minimumValue": 1, "maximumValue": 4, "precision": 1 }, "presets": [{ "rangeValue": 10, "presetResources": { "friendlyNames": [{ "@type": "asset", "value": { "assetId": "Alexa.Value.Maximum" } }, { "@type": "asset", "value": { "assetId": "Alexa.Value.High" } }, { "@type": "text", "value": { "text": "Highest", "locale": "en-US" } }] } }] } }];
                        else
                            var caps = capabilities;

                        adr.addPayloadEndpoint({ "displayCategories": d[j]['displayCategories'], "manufacturerName": "Nuos Home Automation", "description": d[j]['description'], "friendlyName": d[j]['friendlyName'], "capabilities": caps, "endpointId": d[j]["endpointId"] });

                    }
                }


                if (s) {

                    for (var j = 0; j < s.length; j++) {
                        adr.addPayloadEndpoint({ "displayCategories": s[j]['displayCategories'], "manufacturerName": "Nuos Home Automation", "description": "Scene", "friendlyName": s[j]['friendlyName'], "endpointId": s[j]['endpointId'], "capabilities": [capability_alexa, capability_alexa_scenecontroller], "cookie": s[j]['cookie'] });
                    }
                }




                resolve(sendResponse(adr.get()));


            });



        });

        req.on('error', (e) => {
            reject(e.message);
        });

        // send the request
        req.write("gateways=" + gateways);
        req.end();
    });

}

function findDevicesFromDynamo(gatewayId) {
    return new Promise((resolve, reject) => {
        const options = {
            host: '8a346zakk7.execute-api.ap-southeast-1.amazonaws.com',
            path: '/prod/NUOSAPPDeviceAndSceneNamesDB/' + gatewayId,
            port: 443,
            method: 'GET',
            headers: { 'x-api-key': 'FJssllekan84rX7yKTmhP5Tdi9YIwacm69G5MCTv' }
        };

        const req = http.request(options, (res) => {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {

                console.log("Devices From Dynamo");
                console.log(body);
                let items = JSON.parse(body)['body-json']['Items'];

                let adr = new AlexaResponse({ "namespace": "Alexa.Discovery", "name": "Discover.Response" });
                let capability_alexa = adr.createPayloadEndpointCapability();
                let capability_alexa_powercontroller = adr.createPayloadEndpointCapability({ "interface": "Alexa.PowerController", "supported": [{ "name": "powerState" }] });
                let capability_alexa_brightnesscontroller = adr.createPayloadEndpointCapability({ "interface": "Alexa.BrightnessController", "supported": [{ "name": "brightness" }] });
                let capability_alexa_scenecontroller = { "type": "AlexaInterface", "interface": "Alexa.SceneController", "version": "3", "supportsDeactivation": false };
                let capability_alexa_lockcontroller = { "type": "AlexaInterface", "interface": "Alexa.LockController", "version": "3", "properties": { "supported": [{ "name": "lockState" }], "proactivelyReported": true, "retrievable": true } };

                let capabilities = [capability_alexa, capability_alexa_powercontroller];

                for (var i = 0; i < items.length; i++) {
                    if (items[i]['roomID']['S'] != "0" && items[i]['roomID']['S'] != "255") {
                        let d = eval("(" + items[i]['deviceNamesJSON']['S'] + ")")[0];
                        let s = eval("(" + items[i]['sceneNamesJSON']['S'] + ")")[0];
                        if (d) {
                            for (var j = 0; j < d.RS.length; j++) {

                                if (allowedModuleType.indexOf(d.RS[j].MT) >= 0) {

                                    for (var k = 0; k <= d.RS[j].DT.length; k++) {

                                        if (d.RS[j].DT[k] > 0 && !/Device/i.test(d.RS[j].D[k])) {
                                            var deviceId = k + 1;
                                            if (dimmableDeviceTypes.indexOf(d.RS[j].DT[k]) >= 0)
                                                var caps = capabilities.concat([capability_alexa_brightnesscontroller]);
                                            else if (lockableDeviceTypes.indexOf(d.RS[j].DT[k]) >= 0)
                                                var caps = [capability_alexa, capability_alexa_lockcontroller];
                                            else if (rangeControlledDeviceTypes.indexOf(d.RS[j].DT[k]) >= 0)
                                                caps = [{ "type": "AlexaInterface", "interface": "Alexa", "version": "3" }, { "type": "AlexaInterface", "interface": "Alexa.RangeController", "version": "3", "instance": "TowerFan" + deviceId + ".Speed", "capabilityResources": { "friendlyNames": [{ "@type": "asset", "value": { "assetId": "Alexa.Setting.FanSpeed" } }] }, "properties": { "supported": [{ "name": "rangeValue" }], "proactivelyReported": true, "retrievable": true }, "configuration": { "supportedRange": { "minimumValue": 1, "maximumValue": 4, "precision": 1 }, "presets": [{ "rangeValue": 10, "presetResources": { "friendlyNames": [{ "@type": "asset", "value": { "assetId": "Alexa.Value.Maximum" } }, { "@type": "asset", "value": { "assetId": "Alexa.Value.High" } }, { "@type": "text", "value": { "text": "Highest", "locale": "en-US" } }] } }] } }];
                                            else
                                                var caps = capabilities;

                                            var dc = ((d.RS[j].DT[k] in displayCategories) ? [displayCategories[d.RS[j].DT[k]]] : ["OTHER"]);

                                            adr.addPayloadEndpoint({ "displayCategories": dc, "manufacturerName": "Nuos Home Automation", "description": d.RS[j].MN, "friendlyName": d.RN + " " + d.RS[j].D[k], "endpointId": gatewayId + "-" + d.R + '-' + d.RS[j].M + '-' + deviceId, "capabilities": caps });

                                        }
                                    }
                                }
                            }
                        }

                        if (s) {

                            for (var j = 0; j < s.SN.length; j++) {
                                adr.addPayloadEndpoint({ "displayCategories": ["SCENE_TRIGGER", "ACTIVITY_TRIGGER"], "manufacturerName": "Nuos Home Automation", "description": "Scene", "friendlyName": s.RN + " " + s.SN[j] + " Scene", "endpointId": gatewayId + '-scene-' + s.R + '-' + s.SN[j].replace(/\s/g, "").toLowerCase(), "capabilities": [capability_alexa, capability_alexa_scenecontroller], "cookie": { "arg": s.SC[j] } });
                            }
                        }
                    }
                    else if(items[i]['roomID']['S'] == "0") {
                        let s = null;
                        try {
                            s = eval("(" + items[i]['sceneNamesJSON']['S'] + ")")[0];
                        } catch(err) {
                            console.log(err);
                        }
                        if (s) {

                            for (var j = 0; j < s.SN.length; j++) {
                                adr.addPayloadEndpoint({ "displayCategories": ["SCENE_TRIGGER", "ACTIVITY_TRIGGER"], "manufacturerName": "Nuos Home Automation", "description": "Scene", "friendlyName": s.RN + " " + s.SN[j] + " Scene", "endpointId": gatewayId + '-scene-' + s.R + '-' + s.SN[j].replace(/\s/g, "").toLowerCase(), "capabilities": [capability_alexa, capability_alexa_scenecontroller], "cookie": { "arg": s.SC[j] } });
                            }
                        }
                    }

                }

                resolve(sendResponse(adr.get()));
            });



        });

        req.on('error', (e) => {
            reject(e.message);
        });

        // send the request
        req.write('');
        req.end();
    });
}





function callParticleFunction(gatewayId, accessToken, arg, ar, resp = true) {
    console.log("Arguement");
    console.log(arg);
    console.log("Response = " + resp);
    const options = {
        host: host,
        path: version + '/devices/' + gatewayId + '/TRANSMIT',
        port: 443,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };
    return new Promise((resolve, reject) => {

        const req = http.request(options, (res) => {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                console.log("Transmit");
                console.log(body);
                if (resp == true)
                    resolve(sendResponse(ar.get()));
                else
                    resolve(body.toString());
                return;
            });



        });

        req.on('error', (e) => {
            reject(e.message);
        });

        // send the request
        req.write('access_token=' + accessToken + "&arg=" + arg);
        req.end();
    });
}



function getCurrentState(gatewayId, room, module, device, brightnessDelta, accessToken, arg, ar) {
    let brightness = 0;
    return new Promise((resolve, reject) => {
        const options = {
            host: host,
            path: version + '/devices/' + gatewayId + '/CURR_STATE',
            port: 443,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        };

        const req = http.request(options, (res) => {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                console.log("Current State");
                console.log(JSON.parse(body)['return_value']);
                let currentBrightness = parseInt(JSON.parse(body).return_value);
                let absDelta = Math.abs(brightnessDelta);
                if (currentBrightness > 0) {
                    let light = Math.round((255 * absDelta) / 100);
                    brightness = ((brightnessDelta > 0) ? (currentBrightness + light) : (currentBrightness - light));
                    brightness = (brightness > 255 ? 255 : brightness);

                } else {
                    brightness = ((brightnessDelta > 0) ? (0 + Math.round((255 * absDelta) / 100)) : (255 - Math.round((255 * absDelta) / 100)));
                }
                let arg = 'ctrl/' + room + "*" + module + "@" + device + "," + brightness + "!";
                console.log("ARG : " + arg);

                resolve(callParticleFunction(gatewayId, accessToken, arg, ar, true));
            });



        });

        req.on('error', (e) => {
            reject(e.message);
        });

        // send the request
        req.write('access_token=' + accessToken + "&arg=" + arg);
        req.end();
    });
}





function callSceneFunction(gatewayId, accessToken, arg, ar) {
    console.log("Arguement");
    console.log(arg);
    const options = {
        host: "nuos.in",
        path: '/execute-scene.php',
        port: 443,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };
    return new Promise((resolve, reject) => {

        const req = http.request(options, (res) => {
            var body = '';

            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                console.log("Transmit");
                console.log(body);
                resolve(sendResponse(ar));

            });



        });

        req.on('error', (e) => {
            reject(e.message);
        });

        // send the request
        req.write('token=' + accessToken + "&arg=" + arg + "&device=" + gatewayId);
        req.end();
    });

}