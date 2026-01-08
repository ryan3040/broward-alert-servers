import { Hono } from "hono"; import { cors } from "hono/cors"; import Expo from "expo-server-sdk";
const app = new Hono(); const expo = new Expo();
const devices = new Map();
const ADMIN_PIN = "1234"; // app.use("/")
*, cors()); app.get("/", (c) => 
c.json({ status: "ok" }, devices.size ));
app.post("/api/devices/register", async (c) => { 
  const reqJson = await c.req.json(); 
  const { pushToken, platform, isSubscribed } = reqJson; 
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) { 
    return c.json({ success: false, error: "Invalid push token" }, 400); 
  } 
  const deviceId = Buffer.from(pushToken).toString("base64").slice(0, 32); 
  devices.set(deviceId, { token: pushToken, platform: platform || "ios", isSubscribed: isSubscribed || false, followedAlerts: [], createdAt: Date.now() }); 
  return c.json({ success: true, data: { deviceId } }); 
});
app.post("/api/notifications/broadcast", async (c) => { 
  if (c.req.header("X-Admin-Pin") !== ADMIN_PIN) return c.json({ success: false, error: "Unauthorized" }, 401); 
  const body = await c.req.json(); 
  const { title, body: notificationBody, data, subscribersOnly } = body; 
  const messages = []; 
  for (const [, device] of devices) { 
    if (subscribersOnly && !device.isSubscribed) continue;
    if (Expo.isExpoPushToken(device.token)) {
      messages.push({ to: device.token, sound: "default", title, body: notificationBody, data: data || {}, priority: "high" });
    }
  }
  if (messages.length === 0) return c.json({ success: true, sent: 0 });
  const chunks = expo.chunkPushNotifications(messages); 
  let sent = 0; 
  for (const chunk of chunks) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);
    sent += tickets.length;
  } 
  return c.json({ success: true, sent, total: devices.size });
});
app.get("/api/stats", (c) => {
  if (c.req.header("X-Admin-Pin") !== ADMIN_PIN) return c.json({ success: false, error: "Unauthorized" }, 401);
  return c.json({ success: true, data: { totalDevices: devices.size, subscribers: 0, freeUsers: devices.size } });
});
export default { port: process.env.PORT || 3000, fetch: app.fetch };
