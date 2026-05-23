# Launching a Browser

To launch a browser with persistent context:

1. **Find the browser's default user data directory:**
   - Chrome: `C:\Users\<username>\AppData\Local\Google\Chrome\User Data\Default`
   - Edge: `C:\Users\<username>\AppData\Local\Microsoft\Edge\User Data\Default`
   - Firefox: `C:\Users\<username>\AppData\Local\Mozilla\Firefox\Profiles\<profile>`

2. **Use launchPersistentContext:**
   ```javascript
   const browser = await chromium.launchPersistentContext('user data dir', {
     headless: false
   });
   ```

This allows the browser to maintain session data, cookies, and extensions across launches.
