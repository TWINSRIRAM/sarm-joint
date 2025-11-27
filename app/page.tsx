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
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [server, setServer] = useState<BluetoothRemoteGATTServer | null>(null);
  const [cmdChar, setCmdChar] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [statusChar, setStatusChar] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [connected, setConnected] = useState(false);

  const [angles, setAngles] = useState<Angles>({
    joint1: 90,
    joint2: 90,
    joint3: 90,
    joint4: 90,
    joint5: 90
  });

  // --- MODIFIED UUIDs to match ESP32 code ---
  const serviceUUID = "12345678-1234-5678-1234-56789abcdef0"; // SERVICE_UUID
  const charUUID = "12345678-1234-5678-1234-56789abcdef1";   // CHAR_CMD_UUID
  const statusUUID = "12345678-1234-5678-1234-56789abcdef2"; // CHAR_STATUS_UUID
  // -------------------------------------------

  // Connect & discover characteristics
  const connect = async () => {
    try {
      // Show all BLE devices, user picks device (safer across phones)
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [serviceUUID]
      });

      setDevice(dev);

      const gatt = await dev.gatt?.connect();
      if (!gatt) return;

      setServer(gatt);
      setConnected(true);

      const serv = await gatt.getPrimaryService(serviceUUID);
      const cmd = await serv.getCharacteristic(charUUID);
      const status = await serv.getCharacteristic(statusUUID);

      setCmdChar(cmd);
      setStatusChar(status);

      // Subscribe to notifications
      await status.startNotifications();
      status.addEventListener("characteristicvaluechanged", handleStatusNotify);

      console.log("Connected to", dev.name || "(unnamed)");
    } catch (err) {
      console.error("Connect error:", err);
      alert("Connection failed: " + String(err));
    }
  };

  // Handle incoming status notifications
  const handleStatusNotify = (ev: Event) => {
    try {
      const ch = ev.target as BluetoothRemoteGATTCharacteristic;
      const value = ch.value;
      if (!value) return;

      // decode RFC: we assume utf-8 JSON string
      const decoder = new TextDecoder();
      const json = decoder.decode(value.buffer);
      const doc = JSON.parse(json);

      if (doc && doc.joints && Array.isArray(doc.joints)) {
        setAngles({
          joint1: Number(doc.joints[0]) || 0,
          joint2: Number(doc.joints[1]) || 0,
          joint3: Number(doc.joints[2]) || 0,
          joint4: Number(doc.joints[3]) || 0,
          joint5: Number(doc.joints[4]) || 0
        });
      }
    } catch (e) {
      console.error("Notify parse error:", e);
    }
  };

  // Send JSON command to ESP32
  const sendJson = async (obj: any) => {
    if (!cmdChar) {
      console.warn("No command characteristic");
      return;
    }
    try {
      const json = JSON.stringify(obj);
      const buf = new TextEncoder().encode(json);
      // prefer write without response for speed
      if ((cmdChar as any).writeValueWithoutResponse) {
        await (cmdChar as any).writeValueWithoutResponse(buf);
      } else {
        await cmdChar.writeValue(buf);
      }
      console.log("Sent:", json);
    } catch (e) {
      console.error("Send error:", e);
    }
  };

  // Update a single joint (sends set_joint)
  const updateJoint = (jointKey: keyof Angles, value: number) => {
    // update local UI immediately
    setAngles((prev) => ({ ...prev, [jointKey]: value }));

    // map jointKey -> jointId (0-based)
    const id = Number(jointKey.replace("joint", "")) - 1;
    sendJson({ cmd: "set_joint", jointId: id, angle: value });
  };

  // Send full pose
  const sendFullPose = () => {
    sendJson({ cmd: "set_pose", joints: Object.values(angles).map((v) => Number(v)) });
  };

  // Home
  const sendHome = () => {
    sendJson({ cmd: "home" });
  };

  // Disconnect handler and cleanup
  useEffect(() => {
    const onDisconnect = () => {
      setConnected(false);
      setDevice(null);
      setServer(null);
      setCmdChar(null);
      setStatusChar(null);
      console.log("Device disconnected");
    };

    if (device) {
      device.addEventListener("gattserverdisconnected", onDisconnect);
      return () => device.removeEventListener("gattserverdisconnected", onDisconnect);
    }
  }, [device]);

  return (
    <main className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-semibold mb-4">SARM 5-DOF BLE Controller</h1>

      {!connected ? (
        <button onClick={connect} className="px-5 py-3 bg-blue-600 rounded-md mb-6">
          Connect (pick your SARM device)
        </button>
      ) : (
        <div className="mb-4">
          <div className="text-green-300">Connected: {device?.name ?? "(unnamed)"}</div>
          <div className="text-sm text-gray-300">Service: {serviceUUID}</div>
        </div>
      )}

      <div className="w-full max-w-2xl space-y-6">
        {/* Sliders */}
        {(Object.keys(angles) as (keyof Angles)[]).map((k) => (
          <div key={k} className="bg-gray-800 p-4 rounded-md">
            <div className="flex justify-between mb-2">
              <div className="font-medium">{k.toUpperCase()}</div>
              <div className="text-sm text-gray-300">{angles[k]}°</div>
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

      <div className="flex gap-3 mt-6">
        <button onClick={sendFullPose} className="px-4 py-2 bg-blue-500 rounded-md">
          Send Full Pose
        </button>
        <button onClick={sendHome} className="px-4 py-2 bg-red-600 rounded-md">
          HOME / RESET
        </button>
      </div>

      <div className="mt-6 text-sm text-gray-400">
        <div>BLE Service UUID: {serviceUUID}</div>
        <div>Cmd Char UUID: {charUUID}</div>
        <div>Status Char UUID: {statusUUID}</div>
      </div>
    </main>
  );
}