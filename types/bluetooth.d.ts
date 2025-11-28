export {};

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: any): Promise<BluetoothDevice>;
    };
  }

  interface BluetoothDevice {
    name?: string;
    gatt?: BluetoothRemoteGATTServer | null;
    addEventListener(type: string, listener: any): void;
  }

  interface BluetoothRemoteGATTServer {
    connect(): Promise<BluetoothRemoteGATTServer>;
    getPrimaryService(uuid: string): Promise<any>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    value: DataView | null;
    writeValue(value: BufferSource): Promise<void>;
    writeValueWithoutResponse?(value: BufferSource): Promise<void>;
    startNotifications(): Promise<void>;
    addEventListener(type: string, listener: any): void;
  }
}
