// =========================================================================
// AlphaPlus POS - Local Windows Hardware Printer Bridge
// Runs locally on the POS terminal (port 18181) to detect exact installed
// Windows printers and manage direct hardware routing with zero dialogs.
// =========================================================================

const http = require('http');
const { exec } = require('child_process');

const PORT = 18181;

function getWindowsPrinters() {
  return new Promise((resolve, reject) => {
    // PowerShell command to query installed printers from Windows Spooler
    const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Where-Object { $_.Name -notlike '*OneNote*' } | Select-Object Name, PortName, DriverName, PrinterStatus, Shared | ConvertTo-Json -Compress"`;
    
    exec(psCmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        return reject(err);
      }
      try {
        const raw = stdout.trim();
        if (!raw) {
          return resolve([]);
        }
        let list = JSON.parse(raw);
        if (!Array.isArray(list)) {
          list = [list];
        }
        
        // Format & identify thermal models
        const printers = list.map((p) => {
          const name = p.Name || '';
          const port = p.PortName || '';
          const driver = p.DriverName || '';
          const isThermal = /XP-|POS-|EPSON|TM-|BIXOLON|STAR|RECEIPT|THERMAL|80C|58/i.test(name) || /XP-|POS-|EPSON|TM-/i.test(driver);
          
          return {
            id: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: name,
            port: port,
            driver: driver,
            isThermal: isThermal,
            width: isThermal ? '80mm' : 'A4',
            status: p.PrinterStatus || 'Normal'
          };
        });

        // Sort so physical thermal printers (XP-80C) appear at the top
        printers.sort((a, b) => {
          if (a.isThermal && !b.isThermal) return -1;
          if (!a.isThermal && b.isThermal) return 1;
          return a.name.localeCompare(b.name);
        });

        resolve(printers);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Headers to allow cloud web app (Vercel) & localhost to communicate seamlessly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  // Health check endpoint
  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'AlphaPlus POS Local Printer Bridge',
      version: '2.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Get exact installed Windows printers
  if (url.pathname === '/printers') {
    try {
      const printers = await getWindowsPrinters();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: printers.length,
        printers: printers
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }
    return;
  }

  // Set Windows default printer
  if (url.pathname === '/set-default' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { printerName } = JSON.parse(body || '{}');
        if (!printerName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing printerName' }));
          return;
        }

        const psCmd = `powershell -NoProfile -Command "(New-Object -ComObject WScript.Network).SetDefaultPrinter('${printerName.replace(/'/g, "''")}')"`;
        exec(psCmd, (err) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, defaultPrinter: printerName }));
          }
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[AlphaPlus Printer Bridge] Running at http://127.0.0.1:${PORT}`);
  console.log(`[AlphaPlus Printer Bridge] Ready to serve live installed Windows printers to web app.`);
});
