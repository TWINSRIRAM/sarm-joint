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

  const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
  const CMD_UUID = "12345678-1234-5678-1234-56789abcdef1";
  const STATUS_UUID = "12345678-1234-5678-1234-56789abcdef2";

  /* -------------------------------------------------------
     CONNECT TO ESP32 (SAFE FOR VERCEL BUILD)
  ------------------------------------------------------- */
  const connect = async () => {
    try {
      // IMPORTANT: Prevent error during SSR build
      if (typeof navigator === "undefined") {
        alert("Navigator not available");
        return;
      }

      const nav = navigator as any; // avoid TS error
      if (!nav.bluetooth) {
        alert("Your browser does not support Web Bluetooth API");
        return;
      }

      const dev = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });

      setDevice(dev);

      const gatt = await dev.gatt?.connect();
      if (!gatt) return;

      const service = await gatt.getPrimaryService(SERVICE_UUID);
      const cmd = await service.getCharacteristic(CMD_UUID);
      const status = await service.getCharacteristic(STATUS_UUID);

      setCmdChar(cmd);
      setStatusChar(status);
      setConnected(true);

      await status.startNotifications();
      status.addEventListener("characteristicvaluechanged", handleStatus);

      console.log("Connected to:", dev.name);
    } catch (err) {
      console.error("BLE Connect Error:", err);
      alert("Connect Failed: " + String(err));
    }
  };

  /* -------------------------------------------------------
     HANDLE STATUS NOTIFICATIONS
  ------------------------------------------------------- */
  const handleStatus = (event: any) => {
    const value = event.target.value;
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
          joint5: doc.joints[4],
        });
      }
    } catch (e) {
      console.error("JSON Parse ERROR:", text);
    }
  };

  /* -------------------------------------------------------
     SEND JSON TO ESP32
  ------------------------------------------------------- */
  const sendJson = async (obj: any) => {
    if (!cmdChar) return;

    try {
      const data = new TextEncoder().encode(JSON.stringify(obj));
      if ((cmdChar as any).writeValueWithoutResponse)
        await (cmdChar as any).writeValueWithoutResponse(data);
      else
        await cmdChar.writeValue(data);

      console.log("Sent:", obj);
    } catch (err) {
      console.error("BLE Write Error:", err);
    }
  };

  /* -------------------------------------------------------
     JOINT CONTROLLERS
  ------------------------------------------------------- */
  const updateJoint = (key: keyof Angles, value: number) => {
    const updated = { ...angles, [key]: value };
    setAngles(updated);

    const jointIndex = Number(key.replace("joint", "")) - 1;

    sendJson({
      cmd: "set_joint",
      jointId: jointIndex,
      angle: value,
    });
  };

  const sendFullPose = () => {
    sendJson({
      cmd: "set_pose",
      joints: Object.values(angles),
    });
  };

  const sendHome = () => {
    sendJson({ cmd: "home" });
  };

  /* -------------------------------------------------------
     CLEANUP ON DISCONNECT
  ------------------------------------------------------- */
  useEffect(() => {
    if (!device) return;

    const handler = () => {
      setConnected(false);
      setCmdChar(null);
      setStatusChar(null);
      setDevice(null);
    };

    device.addEventListener("gattserverdisconnected", handler);
    return () => device.removeEventListener("gattserverdisconnected", handler);
  }, [device]);

  /* -------------------------------------------------------
     PAGE UI
  ------------------------------------------------------- */
  return (
    <main className="min-h-screen bg-black text-white p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4">SARM 5-DOF Controller</h1>

      {!connected ? (
        <button
          onClick={connect}
          className="px-5 py-3 bg-blue-600 rounded-md"
        >
          Connect via BLE
        </button>
      ) : (
        <div className="text-green-400 mb-4">Connected ✔</div>
      )}

      {/* JOINT SLIDERS */}
      <div className="w-full max-w-2xl space-y-4 mt-4">
        {(Object.keys(angles) as (keyof Angles)[]).map((k) => (
          <div key={k} className="bg-gray-800 p-4 rounded-md">
            <div className="flex justify-between mb-2">
              <span className="font-medium">{k.toUpperCase()}</span>
              <span>{angles[k]}°</span>
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

      {/* ACTION BUTTONS */}
      <div className="flex gap-3 mt-6">
        <button onClick={sendFullPose} className="px-4 py-2 bg-blue-500 rounded-md">
          SEND FULL POSE
        </button>
        <button onClick={sendHome} className="px-4 py-2 bg-red-600 rounded-md">
          HOME
        </button>
      </div>
    </main>
  );
}
