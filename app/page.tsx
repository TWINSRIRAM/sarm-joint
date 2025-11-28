"use client";

import { useEffect, useState } from "react";

type Angles = {
  joint1: number;
  joint2: number;
  joint3: number;
  joint4: number;
  joint5: number;
};

export default function Page() {
  const [device, setDevice] = useState<any>(null);
  const [cmdChar, setCmdChar] = useState<any>(null);
  const [statusChar, setStatusChar] = useState<any>(null);

  const [connected, setConnected] = useState(false);

  const [angles, setAngles] = useState<Angles>({
    joint1: 90,
    joint2: 90,
    joint3: 90,
    joint4: 90,
    joint5: 90
  });

  // UUIDs (MATCH YOUR ESP32 CODE)
  const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
  const CMD_UUID = "12345678-1234-5678-1234-56789abcdef1";
  const STATUS_UUID = "12345678-1234-5678-1234-56789abcdef2";

  // ------------------------------
  // CONNECT TO ESP32 BLE
  // ------------------------------
  const connect = async () => {
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      });

      setDevice(dev);

      const gatt = await dev.gatt?.connect();
      if (!gatt) return;

      setConnected(true);

      const service = await gatt.getPrimaryService(SERVICE_UUID);
      const cmd = await service.getCharacteristic(CMD_UUID);
      const status = await service.getCharacteristic(STATUS_UUID);

      setCmdChar(cmd);
      setStatusChar(status);

      await status.startNotifications();
      status.addEventListener("characteristicvaluechanged", handleStatus);

      console.log("Connected to", dev.name);
    } catch (err) {
      console.error("Connection error:", err);
      alert("BLE Connect Failed: " + String(err));
    }
  };

  // ------------------------------
  // HANDLE STATUS NOTIFY FROM ESP32
  // ------------------------------
  const handleStatus = (event: Event) => {
    const ch = event.target as BluetoothRemoteGATTCharacteristic;
    const value = ch.value;
    if (!value) return;

    const text = new TextDecoder().decode(value.buffer);
    try {
      const doc = JSON.parse(text);
      if (doc.joints) {
        setAngles({
          joint1: doc.joints[0],
          joint2: doc.joints[1],
          joint3: doc.joints[2],
          joint4: doc.joints[3],
          joint5: doc.joints[4]
        });
      }
    } catch (err) {
      console.error("Parse Error:", err, text);
    }
  };

  // ------------------------------
  // SEND JSON COMMANDS
  // ------------------------------
  const sendJson = async (data: any) => {
    try {
      if (!cmdChar) return;

      const json = JSON.stringify(data);
      const buffer = new TextEncoder().encode(json);

      if ((cmdChar as any).writeValueWithoutResponse) {
        await (cmdChar as any).writeValueWithoutResponse(buffer);
      } else {
        await cmdChar.writeValue(buffer);
      }

      console.log("Sent:", json);
    } catch (err) {
      console.error("Send Error:", err);
    }
  };

  // SINGLE JOINT UPDATE
  const updateJoint = (key: keyof Angles, value: number) => {
    setAngles((prev) => ({ ...prev, [key]: value }));

    const index = Number(key.replace("joint", "")) - 1;

    sendJson({
      cmd: "set_joint",
      jointId: index,
      angle: value
    });
  };

  // FULL POSE BUTTON
  const sendFullPose = () => {
    sendJson({
      cmd: "set_pose",
      joints: Object.values(angles)
    });
  };

  // HOME BUTTON
  const sendHome = () => {
    sendJson({ cmd: "home" });
  };

  // -----------------------------------------
  // AUTO-CLEAN WHEN DEVICE DISCONNECTS
  // -----------------------------------------
  useEffect(() => {
    if (!device) return;

    const disconnectHandler = () => {
      setConnected(false);
      setCmdChar(null);
      setStatusChar(null);
      setDevice(null);
      console.log("Disconnected");
    };

    device.addEventListener("gattserverdisconnected", disconnectHandler);

    return () => device.removeEventListener("gattserverdisconnected", disconnectHandler);
  }, [device]);

  // -----------------------------------------
  // UI
  // -----------------------------------------
  return (
    <main className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-2xl font-semibold mb-4">SARM 5-DOF BLE Controller</h1>

      {!connected ? (
        <button
          onClick={connect}
          className="px-5 py-3 bg-blue-600 rounded-md mb-6"
        >
          Connect to SARM
        </button>
      ) : (
        <div className="text-green-400 mb-4">Connected ✔</div>
      )}

      {/* Sliders */}
      <div className="w-full max-w-2xl space-y-6">
        {(Object.keys(angles) as (keyof Angles)[]).map((k) => (
          <div key={k} className="bg-gray-800 p-4 rounded-md shadow-md">
            <div className="flex justify-between mb-2">
              <div className="font-medium">{k.toUpperCase()}</div>
              <div>{angles[k]}°</div>
            </div>
            <input
              type="range"
              min={0}
              max={180}
              value={angles[k]}
              onChange={(e) => updateJoint(k, Number(e.target.value))}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={sendFullPose}
          className="px-4 py-2 bg-blue-500 rounded-md"
        >
          Send Full Pose
        </button>

        <button
          onClick={sendHome}
          className="px-4 py-2 bg-red-600 rounded-md"
        >
          HOME
        </button>
      </div>

      <div className="text-xs text-gray-500 mt-6">
        SERVICE_UUID: {SERVICE_UUID}
      </div>
    </main>
  );
}
