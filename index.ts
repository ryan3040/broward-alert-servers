import { Hono } from "hono";
import { cors } from "hono/cors";
import { Expo } from "expo-server-sdk";

const app = new Hono();
const expo = new Expo();
const devices = new Map();
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

app.use("/*", cors());

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Broward Alerts Push Server", devices: devices.size });
});

app.post("/api/register", async (c) => {
  const body = await c.req.json();
  const { pushToken, platform, isSubscribed } = body;
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
    return c.json({ success: false, error: "Invalid push token" }, 400);
  }
  const deviceId = Buffer.from(pushToken).toString("base64").slice(0, 32);
  devices.set(deviceId, { token: pushToken, platform: platform || false, isSubscribed: isSubscribed ?? true });
  return c.json({ success: true, data: { deviceId } });
});

app.post("/api/notifications/broadcast", async (c) => {
  const adminPin = c.req.header("X-Admin-Pin");
  if (adminPin !== ADMIN_PIN) return c.json({ success: false, error: "Unauthorized" }, 401);
  const body = await c.req.json();
  const { title, body: notificationBody, data, subscribersOnly } = body;
  if (!title || !notificationBody) return c.json({ success: false, error: "Title and body required" }, 400);
  const messages = [];
  for (const [, device] of devices) {
    if (subscribersOnly && !device.isSubscribed) continue;
    if (Expo.isExpoPushToken(device.token)) {
      messages.push({
        to: device.token,
        sound: "default",
        title,
        body: notificationBody,
        data: data || {},
        priority: "high"
      });
    }
  }
  if (messages.length === 0) return c.json({ success: true, sent: 0, message: "No devices to notify" });
  const expoChunkPushNotifications = expo.chunkPushNotifications(messages);
  let sent = 0;
  for (const chunk of expoChunkPushNotifications) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      sent += tickets.length;
    } catch (error) {
      console.error("Error:", error);
    }
  }
  return c.json({ success: true, sent, total: devices.size });
});

app.get("/api/stats", (c) => {
  const adminPin = c.req.header("X-Admin-Pin");
  if (adminPin !== ADMIN_PIN) return c.json({ success: false, error: "Unauthorized" }, 401);
  const subscriberCount = Array.from(devices.values()).filter((d) => d.isSubscribed).length;
  return c.json({
    success: true,
    data: {
      totalDevices: devices.size,
      subscribers: subscriberCount,
      freeUsers: devices.size - subscriberCount
    }
  });
});

const port = Number(process.env.PORT) || 3000;
console.log(`Broward Alerts Push Server running on port ${port}`);
export default {  port, hostname: "0.0.0.0", fetch: app.fetch };
