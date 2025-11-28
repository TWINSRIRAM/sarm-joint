"use client";

import { useEffect, useRef, useState } from "react";

type Angles = {
  joint1: number;
  joint2: number;
  joint3: number;
  joint4: number;
  joint5: number;
};

export default function Page() {
  const [device, setDevice] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  const cmdRef = useRef<any>(null);
  const statusRef = useRef<any>(null);

  const [angles, setAngles] = useState<Angles>({
    joint1: 90,
    joint2: 90,
    joint3: 90,
    joint4: 90,
    joint5: 90,
  });

  // BLE UUIDs (match ESP32)
  const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
  const CMD_UUID = "12345678-1234-5678-1234-56789abcdef1";
  const STATUS_UUID = "12345678-1234-5678-1234-56789abcdef2";

  /* ---------------------------------------------------------
     CONNECT TO ESP32
  --------------------------------------------------------- */
  const connect = async () => {
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });

      setDevice(dev);

      const gatt = await dev.gatt?.connect();
      if (!gatt) throw new Error("GATT connection failed");

      setConnected(true);

      const service = await gatt.getPrimaryService(SERVICE_UUID);
      const cmd = await service.getCharacteristic(CMD_UUID);
      const status = await service.getCharacteristic(STATUS_UUID);

      cmdRef.current = cmd;
      statusRef.current = status;

      await status.startNotifications();
      status.addEventListener("characteristicvaluechanged", handleStatus);

      console.log("Connected to:", dev.name);
    } catch (err) {
      console.error(err);
      alert("Connection failed:\n" + String(err));
    }
  };

  /* ---------------------------------------------------------
     HANDLE STATUS NOTIFICATIONS
  --------------------------------------------------------- */
  const handleStatus = (event: any) => {
    const value = event.target.value;
    if (!value) return;

    const text = new TextDecoder().decode(value.buffer);

    try {
      const json = JSON.parse(text);

      if (Array.isArray(json.joints)) {
        setAngles({
          joint1: json.joints[0],
          joint2: json.joints[1],
          joint3: json.joints[2],
          joint4: json.joints[3],
          joint5: json.joints[4],
        });
      }
    } catch {
      console.log("Invalid JSON:", text);
    }
  };

  /* ---------------------------------------------------------
     SEND JSON COMMAND (SAFE)
  --------------------------------------------------------- */
  const sendJson = async (data: any) => {
    try {
      if (!cmdRef.current) return;

      const buf = new TextEncoder().encode(JSON.stringify(data));

      if (typeof cmdRef.current.writeValueWithoutResponse === "function") {
        await cmdRef.current.writeValueWithoutResponse(buf);
      } else {
        await cmdRef.current.writeValue(buf);
      }
    } catch (err) {
      console.error("BLE Write Error:", err);
    }
  };

  /* ---------------------------------------------------------
     ARM JOINT UPDATE
  --------------------------------------------------------- */
  const updateJoint = (key: keyof Angles, value: number) => {
    setAngles((old) => ({ ...old, [key]: value }));

    const index = Number(key.replace("joint", "")) - 1;

    sendJson({
      cmd: "set_joint",
      jointId: index,
      angle: value,
    });
  };

  /* ---------------------------------------------------------
     FULL POSE
  --------------------------------------------------------- */
  const sendFullPose = () => {
    sendJson({
      cmd: "set_pose",
      joints: Object.values(angles),
    });
  };

  /* ---------------------------------------------------------
     HOME
  --------------------------------------------------------- */
  const sendHome = () => sendJson({ cmd: "home" });

  /* ---------------------------------------------------------
     CLEANUP
  --------------------------------------------------------- */
  useEffect(() => {
    if (!device) return;

    const disc = () => {
      setConnected(false);
      cmdRef.current = null;
      statusRef.current = null;
      setDevice(null);
      console.log("Disconnected");
    };

    device.addEventListener("gattserverdisconnected", disc);
    return () => device.removeEventListener("gattserverdisconnected", disc);
  }, [device]);

  /* ---------------------------------------------------------
     UI
  --------------------------------------------------------- */
  return (
    <main className="min-h-screen bg-black text-white p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4">SARM 5-DOF BLE Arm Controller</h1>

      {!connected ? (
        <button
          onClick={connect}
          className="bg-blue-600 px-6 py-3 rounded-lg"
        >
          Connect to SARM
        </button>
      ) : (
        <p className="text-green-400 mb-4">Connected ✔</p>
      )}

      {/* ------- ARM SLIDERS ------- */}
      <div className="w-full max-w-2xl space-y-5 mt-6">
        {(Object.keys(angles) as (keyof Angles)[]).map((k) => (
          <div key={k} className="bg-gray-800 p-4 rounded-lg">
            <div className="flex justify-between mb-2">
              <span>{k.toUpperCase()}</span>
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

      {/* BUTTONS */}
      <div className="flex gap-4 mt-6">
        <button
          onClick={sendFullPose}
          className="bg-blue-500 px-6 py-2 rounded-lg"
        >
          Send Full Pose
        </button>

        <button
          onClick={sendHome}
          className="bg-red-600 px-6 py-2 rounded-lg"
        >
          HOME
        </button>
      </div>
    </main>
  );
}
