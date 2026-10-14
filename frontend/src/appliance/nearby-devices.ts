import { authHeader } from "./auth";

export type NearbyDevice = {
  id: string;
  name: string;
  platform: string;
  address: string;
};
export async function fetchNearbyDevices(): Promise<NearbyDevice[]> {
  const response = await fetch("/api/appliance/device-link/discovery", {
    headers: authHeader(),
  });
  if (!response.ok) throw new Error("局域网发现暂不可用");
  const body = await response.json();
  return Array.isArray(body.devices) ? body.devices : [];
}
